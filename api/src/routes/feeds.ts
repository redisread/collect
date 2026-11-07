import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { feeds, articles, folders } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { RSSFetcher } from "../lib/rss/fetcher";
import { discoverFeedUrl } from "../lib/rss/parser";
import type { CloudflareEnv } from "../types";

const feedsRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

feedsRoute.use("/*", authMiddleware);

/** 从 URL 推断 favicon URL */
function getFaviconUrl(siteUrl: string): string {
  try {
    const url = new URL(siteUrl);
    return `${url.protocol}//${url.hostname}/favicon.ico`;
  } catch {
    return "";
  }
}

// GET /api/feeds — 获取当前用户的所有订阅源（含未读数）
feedsRoute.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const folderId = c.req.query("folderId");
    const db = getDb(c.env.DB);

    const feedList = await db
      .select()
      .from(feeds)
      .where(
        folderId
          ? and(eq(feeds.userId, userId), eq(feeds.folderId, folderId))
          : eq(feeds.userId, userId)
      )
      .orderBy(asc(feeds.sortOrder));

    // 批量获取未读数
    const unreadCounts = await db
      .select({
        feedId: articles.feedId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(articles)
      .where(eq(articles.isRead, false))
      .groupBy(articles.feedId);

    const unreadMap = new Map(unreadCounts.map((r) => [r.feedId, r.count]));

    const result = feedList.map((feed) => ({
      ...feed,
      unreadCount: unreadMap.get(feed.id) ?? 0,
    }));

    return c.json({ success: true, data: result });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取订阅源失败" }, 500);
  }
});

// POST /api/feeds — 为当前用户添加订阅源
feedsRoute.post(
  "/",
  zValidator("json", z.object({
    url: z.string().min(1, "订阅源 URL 不能为空"),
    folderId: z.string().optional(),
  })),
  async (c) => {
    try {
      const userId = c.get("userId");
      const body = c.req.valid("json");
      const db = getDb(c.env.DB);

      let feedUrl = body.url.trim();

      // 尝试自动发现 Feed URL
      const discovered = await discoverFeedUrl(feedUrl);
      if (discovered) feedUrl = discovered;

      // 抓取并解析 Feed
      const fetcher = new RSSFetcher();
      const parsed = await fetcher.fetch(feedUrl);

      // 检查当前用户是否已订阅该 Feed
      const [existing] = await db
        .select()
        .from(feeds)
        .where(and(eq(feeds.feedUrl, feedUrl), eq(feeds.userId, userId)));
      if (existing) return c.json({ success: false, error: "该订阅源已存在" }, 409);

      const faviconUrl = parsed.faviconUrl ?? getFaviconUrl(parsed.siteUrl);

      const existingFeeds = await db
        .select()
        .from(feeds)
        .where(eq(feeds.userId, userId))
        .orderBy(asc(feeds.sortOrder));
      const maxOrder = existingFeeds.length > 0 ? (existingFeeds[existingFeeds.length - 1].sortOrder ?? 0) + 1 : 0;

      const [feed] = await db
        .insert(feeds)
        .values({
          userId,
          folderId: body.folderId ?? null,
          title: parsed.title,
          url: parsed.siteUrl,
          feedUrl,
          description: parsed.description,
          faviconUrl,
          lastFetchedAt: new Date().toISOString(),
          sortOrder: maxOrder,
        })
        .returning();

      // 保存文章
      if (parsed.articles.length > 0) {
        const articleValues = parsed.articles.slice(0, 50).map((a) => ({
          userId,
          feedId: feed.id,
          title: a.title,
          url: a.url,
          content: a.content,
          summary: a.summary,
          author: a.author,
          imageUrl: a.imageUrl,
          publishedAt: a.publishedAt,
          isRead: 0 as any,
          isStarred: 0 as any,
          isReadLater: 0 as any,
        }));

        try {
          // Try batch insert first
          await db.insert(articles).values(articleValues).onConflictDoNothing();
        } catch (insertErr) {
          console.error("Batch insert failed, trying individual inserts:", insertErr);
          // Fall back to individual inserts
          for (const article of articleValues) {
            try {
              await db.insert(articles).values(article).onConflictDoNothing();
            } catch (e) {
              console.error("Individual insert failed:", e);
            }
          }
        }
      }

      return c.json({ success: true, data: { ...feed, unreadCount: parsed.articles.length } }, 201);
    } catch (err) {
      return c.json({ success: false, error: err instanceof Error ? err.message : "添加订阅源失败" }, 500);
    }
  }
);

// GET /api/feeds/:id — 获取单个订阅源
feedsRoute.get("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const [feed] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));
    if (!feed) return c.json({ success: false, error: "订阅源不存在" }, 404);
    return c.json({ success: true, data: feed });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取订阅源失败" }, 500);
  }
});

// PUT /api/feeds/:id — 更新订阅源
feedsRoute.put("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json() as {
      title?: string;
      folderId?: string | null;
      sortOrder?: number;
    };

    const db = getDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));
    if (!existing) return c.json({ success: false, error: "订阅源不存在" }, 404);

    const updates: Partial<typeof existing> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.title !== undefined) updates.title = body.title.trim();
    if ("folderId" in body) {
      if (body.folderId !== null && (typeof body.folderId !== "string" || !body.folderId)) {
        return c.json({ success: false, error: "无效的文件夹" }, 400);
      }
      if (body.folderId) {
        const [folder] = await db.select({ id: folders.id }).from(folders)
          .where(and(eq(folders.id, body.folderId), eq(folders.userId, userId)));
        if (!folder) return c.json({ success: false, error: "目标文件夹不存在" }, 404);
      }
      updates.folderId = body.folderId;
    }
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    const [updated] = await db
      .update(feeds)
      .set(updates)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "更新订阅源失败" }, 500);
  }
});

// DELETE /api/feeds/:id — 删除订阅源
feedsRoute.delete("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));
    if (!existing) return c.json({ success: false, error: "订阅源不存在" }, 404);

    await db.delete(feeds).where(and(eq(feeds.id, id), eq(feeds.userId, userId)));
    return c.json({ success: true, data: { id } });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "删除订阅源失败" }, 500);
  }
});

// POST /api/feeds/:id/mark-all-read — 标记某订阅源下所有文章为已读
feedsRoute.post("/:id/mark-all-read", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);

    // 验证订阅源是否属于当前用户
    const [existing] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));
    if (!existing) return c.json({ success: false, error: "订阅源不存在" }, 404);

    // 标记该订阅源下所有文章为已读
    await db
      .update(articles)
      .set({ isRead: true })
      .where(eq(articles.feedId, id));

    return c.json({
      success: true,
      data: {
        feedId: id,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "标记已读失败" }, 500);
  }
});

export default feedsRoute;
