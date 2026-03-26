import { Hono } from "hono";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../../db";
import { feeds, articles, folders } from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { CacheManager } from "../../lib/cache/CacheManager";
import { RSSFetcher } from "../../lib/rss/fetcher";
import { discoverFeedUrl } from "../../lib/rss/parser";
import type { CloudflareEnv } from "../../types";

const feedsV2Route = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { userId: string };
}>();

feedsV2Route.use("/*", authMiddleware);

/**
 * GET /api/v2/feeds
 * Get all feeds with unread counts
 */
feedsV2Route.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const folderId = c.req.query("folderId");
    const db = getDb(c.env.DB);
    const cache = new CacheManager(c.env.COLLECT_KV);

    // Try cache first
    const cacheKey = CacheManager.userFeedsKey(userId);
    const cached = await cache.get(cacheKey);

    if (cached) {
      // Filter by folderId if needed
      if (folderId) {
        const filtered = (cached as any[]).filter((f) => f.folderId === folderId);
        return c.json({ success: true, data: filtered });
      }
      return c.json({ success: true, data: cached });
    }

    // Query from DB
    let query = db
      .select()
      .from(feeds)
      .where(eq(feeds.userId, userId))
      .orderBy(asc(feeds.sortOrder));

    if (folderId) {
      query = db
        .select()
        .from(feeds)
        .where(and(eq(feeds.userId, userId), eq(feeds.folderId, folderId)))
        .orderBy(asc(feeds.sortOrder));
    }

    const feedList = await query;

    // Get unread counts
    const unreadCounts = await db
      .select({
        feedId: articles.feedId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(articles)
      .where(and(eq(articles.userId, userId), eq(articles.isRead, false)))
      .groupBy(articles.feedId);

    const unreadMap = new Map(unreadCounts.map((r) => [r.feedId, r.count]));

    const result = feedList.map((feed) => ({
      ...feed,
      unreadCount: unreadMap.get(feed.id) ?? 0,
    }));

    // Cache the result
    await cache.set(cacheKey, result, CACHE_CONFIGS.feedList.ttl);

    return c.json({ success: true, data: result });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "获取订阅源失败",
      },
      500
    );
  }
});

// Create feed schema
const createFeedSchema = z.object({
  url: z.string().min(1, "订阅源URL不能为空"),
  folderId: z.string().optional(),
  fetchIntervalMinutes: z.number().min(5).max(1440).optional(),
});

/**
 * POST /api/v2/feeds
 * Create new feed with auto-discovery
 */
feedsV2Route.post("/", zValidator("json", createFeedSchema), async (c) => {
  try {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const db = getDb(c.env.DB);
    const cache = new CacheManager(c.env.COLLECT_KV);
    const fetcher = new RSSFetcher();

    let feedUrl = body.url.trim();

    // Auto-discover feed URL
    const discovered = await discoverFeedUrl(feedUrl);
    if (discovered) feedUrl = discovered;

    // Check for existing feed
    const [existing] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(and(eq(feeds.feedUrl, feedUrl), eq(feeds.userId, userId)));

    if (existing) {
      return c.json({ success: false, error: "该订阅源已存在" }, 409);
    }

    // Fetch and parse feed
    const parsed = await fetcher.fetch(feedUrl);

    // Get sort order
    const existingFeeds = await db
      .select({ sortOrder: feeds.sortOrder })
      .from(feeds)
      .where(eq(feeds.userId, userId))
      .orderBy(desc(feeds.sortOrder))
      .limit(1);

    const nextOrder = (existingFeeds[0]?.sortOrder ?? 0) + 1;

    // Calculate next fetch time
    const fetchInterval = body.fetchIntervalMinutes ?? 60;
    const nextFetchAt = new Date();
    nextFetchAt.setMinutes(nextFetchAt.getMinutes() + fetchInterval);

    // Insert feed
    const [feed] = await db
      .insert(feeds)
      .values({
        userId,
        folderId: body.folderId ?? null,
        title: parsed.title,
        url: parsed.siteUrl || feedUrl,
        feedUrl,
        description: parsed.description,
        faviconUrl: parsed.faviconUrl,
        lastFetchedAt: new Date().toISOString(),
        nextFetchAt: nextFetchAt.toISOString(),
        fetchIntervalMinutes: fetchInterval,
        sortOrder: nextOrder,
      })
      .returning();

    // Insert articles (limit to first 50)
    if (parsed.articles.length > 0) {
      const articleValues = parsed.articles.slice(0, 50).map((a) => ({
        userId,
        feedId: feed.id,
        title: a.title,
        url: a.url,
        content: a.content,
        contentText: stripHtml(a.content),
        summary: a.summary,
        author: a.author,
        imageUrl: a.imageUrl,
        publishedAt: a.publishedAt,
        isRead: 0 as any,
        isStarred: 0 as any,
        isReadLater: 0 as any,
      }));

      await db.insert(articles).values(articleValues).onConflictDoNothing();
    }

    // Invalidate cache
    await cache.invalidateUser(userId);

    return c.json(
      {
        success: true,
        data: { ...feed, unreadCount: parsed.articles.length },
      },
      201
    );
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "添加订阅源失败",
      },
      500
    );
  }
});

/**
 * GET /api/v2/feeds/:id
 * Get single feed
 */
feedsV2Route.get("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);

    const [feed] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));

    if (!feed) {
      return c.json({ success: false, error: "订阅源不存在" }, 404);
    }

    // Get unread count
    const [unreadResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(
        and(
          eq(articles.feedId, id),
          eq(articles.userId, userId),
          eq(articles.isRead, false)
        )
      );

    return c.json({
      success: true,
      data: {
        ...feed,
        unreadCount: unreadResult?.count ?? 0,
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "获取订阅源失败",
      },
      500
    );
  }
});

// Update feed schema
const updateFeedSchema = z.object({
  title: z.string().min(1).optional(),
  folderId: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  fetchIntervalMinutes: z.number().min(5).max(1440).optional(),
});

/**
 * PUT /api/v2/feeds/:id
 * Update feed
 */
feedsV2Route.put("/:id", zValidator("json", updateFeedSchema), async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const db = getDb(c.env.DB);
    const cache = new CacheManager(c.env.COLLECT_KV);

    // Verify ownership
    const [existing] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));

    if (!existing) {
      return c.json({ success: false, error: "订阅源不存在" }, 404);
    }

    const updates: Partial<typeof feeds.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.title !== undefined) updates.title = body.title.trim();
    if ("folderId" in body) updates.folderId = body.folderId;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.fetchIntervalMinutes !== undefined) {
      updates.fetchIntervalMinutes = body.fetchIntervalMinutes;
      // Recalculate next fetch time
      const nextFetchAt = new Date();
      nextFetchAt.setMinutes(nextFetchAt.getMinutes() + body.fetchIntervalMinutes);
      updates.nextFetchAt = nextFetchAt.toISOString();
    }

    const [updated] = await db
      .update(feeds)
      .set(updates)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)))
      .returning();

    // Invalidate cache
    await cache.invalidateUser(userId);

    return c.json({ success: true, data: updated });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "更新订阅源失败",
      },
      500
    );
  }
});

/**
 * DELETE /api/v2/feeds/:id
 * Delete feed
 */
feedsV2Route.delete("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const cache = new CacheManager(c.env.COLLECT_KV);

    // Verify ownership
    const [existing] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));

    if (!existing) {
      return c.json({ success: false, error: "订阅源不存在" }, 404);
    }

    // Delete feed (cascades to articles)
    await db.delete(feeds).where(and(eq(feeds.id, id), eq(feeds.userId, userId)));

    // Invalidate cache
    await cache.invalidateUser(userId);

    return c.json({ success: true, data: { id } });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "删除订阅源失败",
      },
      500
    );
  }
});

/**
 * POST /api/v2/feeds/:id/refresh
 * Manual refresh feed
 */
feedsV2Route.post("/:id/refresh", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const cache = new CacheManager(c.env.COLLECT_KV);
    const fetcher = new RSSFetcher();

    // Verify ownership
    const [feed] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));

    if (!feed) {
      return c.json({ success: false, error: "订阅源不存在" }, 404);
    }

    // Fetch feed
    const parsed = await fetcher.fetch(feed.feedUrl);

    // Get existing article URLs
    const existingUrls = await db
      .select({ url: articles.url })
      .from(articles)
      .where(eq(articles.feedId, id));

    const urlSet = new Set(existingUrls.map((a) => a.url));

    // Filter new articles
    const newArticles = parsed.articles.filter((a) => a.url && !urlSet.has(a.url));

    // Insert new articles
    if (newArticles.length > 0) {
      const articleValues = newArticles.slice(0, 50).map((a) => ({
        userId,
        feedId: id,
        title: a.title,
        url: a.url,
        content: a.content,
        contentText: stripHtml(a.content),
        summary: a.summary,
        author: a.author,
        imageUrl: a.imageUrl,
        publishedAt: a.publishedAt,
        isRead: 0 as any,
        isStarred: 0 as any,
        isReadLater: 0 as any,
      }));

      await db.insert(articles).values(articleValues).onConflictDoNothing();
    }

    // Update feed
    const interval = feed.fetchIntervalMinutes ?? 60;
    const nextFetchAt = new Date();
    nextFetchAt.setMinutes(nextFetchAt.getMinutes() + interval);

    await db
      .update(feeds)
      .set({
        lastFetchedAt: new Date().toISOString(),
        nextFetchAt: nextFetchAt.toISOString(),
        healthStatus: "healthy",
        consecutiveErrors: 0,
        lastErrorMessage: null,
      })
      .where(eq(feeds.id, id));

    // Invalidate cache
    await cache.invalidateUser(userId);

    return c.json({
      success: true,
      data: {
        newArticles: newArticles.length,
        totalArticles: parsed.articles.length,
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "刷新失败",
      },
      500
    );
  }
});

/**
 * GET /api/v2/feeds/:id/stats
 * Get feed statistics
 */
feedsV2Route.get("/:id/stats", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);

    // Verify ownership
    const [feed] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));

    if (!feed) {
      return c.json({ success: false, error: "订阅源不存在" }, 404);
    }

    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        unread: sql<number>`sum(CASE WHEN is_read = 0 THEN 1 ELSE 0 END)`,
        starred: sql<number>`sum(CASE WHEN is_starred = 1 THEN 1 ELSE 0 END)`,
        readLater: sql<number>`sum(CASE WHEN is_read_later = 1 THEN 1 ELSE 0 END)`,
        oldestArticle: sql<string>`min(published_at)`,
        newestArticle: sql<string>`max(published_at)`,
      })
      .from(articles)
      .where(and(eq(articles.feedId, id), eq(articles.userId, userId)));

    return c.json({
      success: true,
      data: stats[0],
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "获取统计失败",
      },
      500
    );
  }
});

// Cache configs (imported from CacheManager)
const CACHE_CONFIGS = {
  feedList: { ttl: 300 },
};

// Helper: Strip HTML to text
function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default feedsV2Route;
