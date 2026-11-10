import { afterArticle, articleOrder, readArticleOrder } from "../../lib/article-order";
import { Hono } from "hono";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../../db";
import { articles, feeds, folders } from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { CacheManager } from "../../lib/cache/CacheManager";
import { fetchArticleContent } from "../../lib/content/FetchContentService";
import type { CloudflareEnv } from "../../types";

const articlesV2Route = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { userId: string };
}>();

articlesV2Route.use("/*", authMiddleware);

// Cursor encoding/decoding helpers
function encodeCursor(data: { publishedAt: string | null; id: string }): string {
  const str = JSON.stringify({
    p: data.publishedAt,
    i: data.id,
  });
  return btoa(str);
}

function decodeCursor(cursor: string): { publishedAt: string | null; id: string } {
  try {
    const str = atob(cursor);
    const data = JSON.parse(str);
    if ((data.p !== null && typeof data.p !== "string") || typeof data.i !== "string") throw new Error("Invalid cursor");
    return {
      publishedAt: data.p,
      id: data.i,
    };
  } catch {
    throw new Error("Invalid cursor");
  }
}

/**
 * GET /api/v2/articles
 * Cursor-based pagination with filtering
 */
articlesV2Route.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const cursor = c.req.query("cursor");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "30", 10), 100);
    const feedId = c.req.query("feedId");
    const folderId = c.req.query("folderId");
    const filter = c.req.query("filter") as "all" | "unread" | "starred" | "read_later" | undefined;

    const db = getDb(c.env.DB);
    const requestedSort = c.req.query("sort");
    const sortOrder = requestedSort === "asc" || requestedSort === "desc"
      ? requestedSort : await readArticleOrder(db, userId);

    // Build base query
    let conditions = [eq(articles.userId, userId)];

    if (feedId) {
      conditions.push(eq(articles.feedId, feedId));
    }

    if (folderId) {
      const folderFeeds = db.select({ id: feeds.id }).from(feeds)
        .where(and(eq(feeds.folderId, folderId), eq(feeds.userId, userId)));
      conditions.push(inArray(articles.feedId, folderFeeds));
    }

    if (filter === "unread") {
      conditions.push(eq(articles.isRead, false));
    } else if (filter === "starred") {
      conditions.push(eq(articles.isStarred, true));
    } else if (filter === "read_later") {
      conditions.push(eq(articles.isReadLater, true));
    }

    // Cursor filtering
    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        conditions.push(afterArticle(sortOrder, decoded));
      } catch {
        return c.json({ success: false, error: "Invalid cursor" }, 400);
      }
    }

    const whereClause = and(...conditions);

    // Execute query (fetch one extra to check hasMore)
    const results = await db
      .select({
        id: articles.id,
        feedId: articles.feedId,
        title: articles.title,
        url: articles.url,
        summary: articles.summary,
        author: articles.author,
        imageUrl: articles.imageUrl,
        publishedAt: articles.publishedAt,
        isRead: articles.isRead,
        isStarred: articles.isStarred,
        isReadLater: articles.isReadLater,
        createdAt: articles.createdAt,
      })
      .from(articles)
      .where(whereClause)
      .orderBy(...articleOrder(sortOrder))
      .limit(limit + 1);

    // Build response
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, -1) : results;

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor({
          publishedAt: items[items.length - 1].publishedAt,
          id: items[items.length - 1].id,
        })
      : null;

    return c.json({
      success: true,
      data: {
        items,
        pagination: {
          nextCursor,
          hasMore,
        },
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "获取文章失败",
      },
      500
    );
  }
});

/**
 * GET /api/v2/articles/:id
 * Get single article with auto-mark-read
 */
articlesV2Route.get("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);

    const [article] = await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), eq(articles.userId, userId)));

    if (!article) {
      return c.json({ success: false, error: "文章不存在" }, 404);
    }

    // Auto mark as read
    if (!article.isRead) {
      await db
        .update(articles)
        .set({
          isRead: true,
          lastReadAt: new Date().toISOString(),
        })
        .where(eq(articles.id, id));

      article.isRead = true;

      // Invalidate cache
      const cache = new CacheManager(c.env.COLLECT_KV);
      await cache.invalidateUser(userId);
    }

    return c.json({ success: true, data: article });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "获取文章失败",
      },
      500
    );
  }
});

// Batch operation schema
const batchOperationSchema = z.object({
  action: z.enum([
    "markRead",
    "markUnread",
    "markAllRead",
    "toggleStar",
    "toggleReadLater",
    "delete",
  ]),
  ids: z.array(z.string()).optional(),
  feedId: z.string().optional(),
  folderId: z.string().optional(),
  filter: z.enum(["all", "unread", "starred"]).optional(),
});

/**
 * POST /api/v2/articles/batch
 * Batch operations on articles
 */
articlesV2Route.post(
  "/batch",
  zValidator("json", batchOperationSchema),
  async (c) => {
    try {
      const userId = c.get("userId");
      const body = c.req.valid("json");
      const db = getDb(c.env.DB);
      const cache = new CacheManager(c.env.COLLECT_KV);

      const now = new Date().toISOString();

      switch (body.action) {
        case "markRead": {
          if (!body.ids || body.ids.length === 0) {
            return c.json({ success: false, error: "文章ID列表不能为空" }, 400);
          }

          await db
            .update(articles)
            .set({ isRead: true, lastReadAt: now })
            .where(
              and(
                eq(articles.userId, userId),
                inArray(articles.id, body.ids)
              )
            );
          break;
        }

        case "markUnread": {
          if (!body.ids || body.ids.length === 0) {
            return c.json({ success: false, error: "文章ID列表不能为空" }, 400);
          }

          await db
            .update(articles)
            .set({ isRead: false, lastReadAt: null })
            .where(
              and(
                eq(articles.userId, userId),
                inArray(articles.id, body.ids)
              )
            );
          break;
        }

        case "markAllRead": {
          let conditions = [eq(articles.userId, userId), eq(articles.isRead, false)];

          if (body.feedId) {
            conditions.push(eq(articles.feedId, body.feedId));
          }

          if (body.folderId) {
            // Get feeds in folder
            const folderFeeds = await db
              .select({ id: feeds.id })
              .from(feeds)
              .where(and(eq(feeds.folderId, body.folderId), eq(feeds.userId, userId)));

            if (folderFeeds.length > 0) {
              const feedIds = folderFeeds.map((f) => f.id);
              conditions.push(inArray(articles.feedId, feedIds));
            }
          }

          await db
            .update(articles)
            .set({ isRead: true, lastReadAt: now })
            .where(and(...conditions));
          break;
        }

        case "toggleStar": {
          if (!body.ids || body.ids.length === 0) {
            return c.json({ success: false, error: "文章ID列表不能为空" }, 400);
          }

          // Get current states
          const current = await db
            .select({ id: articles.id, isStarred: articles.isStarred })
            .from(articles)
            .where(
              and(eq(articles.userId, userId), inArray(articles.id, body.ids))
            );

          // Toggle each article
          for (const item of current) {
            await db
              .update(articles)
              .set({ isStarred: !item.isStarred })
              .where(eq(articles.id, item.id));
          }
          break;
        }

        case "toggleReadLater": {
          if (!body.ids || body.ids.length === 0) {
            return c.json({ success: false, error: "文章ID列表不能为空" }, 400);
          }

          const current = await db
            .select({ id: articles.id, isReadLater: articles.isReadLater })
            .from(articles)
            .where(
              and(eq(articles.userId, userId), inArray(articles.id, body.ids))
            );

          for (const item of current) {
            await db
              .update(articles)
              .set({ isReadLater: !item.isReadLater })
              .where(eq(articles.id, item.id));
          }
          break;
        }

        case "delete": {
          if (!body.ids || body.ids.length === 0) {
            return c.json({ success: false, error: "文章ID列表不能为空" }, 400);
          }

          await db
            .delete(articles)
            .where(
              and(eq(articles.userId, userId), inArray(articles.id, body.ids))
            );
          break;
        }
      }

      // Invalidate caches
      await cache.invalidateUser(userId);

      return c.json({ success: true });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "批量操作失败",
        },
        500
      );
    }
  }
);

/**
 * PUT /api/v2/articles/:id
 * Update single article
 */
articlesV2Route.put("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json<{
      isRead?: boolean;
      isStarred?: boolean;
      isReadLater?: boolean;
    }>();

    const db = getDb(c.env.DB);
    const cache = new CacheManager(c.env.COLLECT_KV);

    // Verify ownership
    const [existing] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.id, id), eq(articles.userId, userId)));

    if (!existing) {
      return c.json({ success: false, error: "文章不存在" }, 404);
    }

    const updates: Partial<typeof articles.$inferInsert> = {};

    if (body.isRead !== undefined) {
      updates.isRead = body.isRead;
      updates.lastReadAt = body.isRead ? new Date().toISOString() : null;
    }
    if (body.isStarred !== undefined) updates.isStarred = body.isStarred;
    if (body.isReadLater !== undefined) updates.isReadLater = body.isReadLater;

    const [updated] = await db
      .update(articles)
      .set(updates)
      .where(eq(articles.id, id))
      .returning();

    // Invalidate cache
    await cache.invalidateUser(userId);

    return c.json({ success: true, data: updated });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "更新文章失败",
      },
      500
    );
  }
});

/**
 * POST /api/v2/articles/fetch-content
 * Fetch and extract content from a URL
 */
articlesV2Route.post(
  "/fetch-content",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      url: z.string().url(),
    })
  ),
  async (c) => {
    try {
      const { url } = c.req.valid("json");

      const result = await fetchArticleContent(url);

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "获取内容失败",
        },
        500
      );
    }
  }
);

export default articlesV2Route;
