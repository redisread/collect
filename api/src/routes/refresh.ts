import { Hono } from "hono";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { feeds, articles } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { RSSFetcher } from "../lib/rss/fetcher";
import { FeedSyncService } from "../services/FeedSyncService";
import { CacheManager } from "../lib/cache/CacheManager";
import type { CloudflareEnv } from "../types";

const refreshRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

refreshRoute.use("/*", authMiddleware);

// POST /api/refresh — 刷新当前用户的 RSS 订阅源
// 已升级：使用 FeedSyncService 和新的数据模型
refreshRoute.post("/", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({})) as { feedId?: string };
    const db = getDb(c.env.DB);
    const cache = new CacheManager(c.env.COLLECT_KV);
    const fetcher = new RSSFetcher();
    const syncService = new FeedSyncService(db, c.env.COLLECT_KV, fetcher);

    let feedList;
    if (body.feedId) {
      // 刷新单个订阅源（验证归属）
      feedList = await db
        .select()
        .from(feeds)
        .where(and(eq(feeds.id, body.feedId), eq(feeds.userId, userId)));
      if (feedList.length === 0) return c.json({ success: false, error: "订阅源不存在" }, 404);
    } else {
      // 刷新当前用户所有订阅源
      feedList = await db
        .select()
        .from(feeds)
        .where(eq(feeds.userId, userId))
        .orderBy(asc(feeds.sortOrder));
    }

    const results = [];
    for (const feed of feedList) {
      try {
        const parsed = await fetcher.fetch(feed.feedUrl, {
          etag: feed.lastEtag,
          lastModified: feed.lastModified,
        });

        // 如果内容未变化（304）
        if (parsed.notModified) {
          // 更新抓取时间
          await db
            .update(feeds)
            .set({
              lastFetchedAt: new Date().toISOString(),
              nextFetchAt: calculateNextFetch(feed.fetchIntervalMinutes ?? 60),
            })
            .where(eq(feeds.id, feed.id));

          results.push({ feedId: feed.id, newArticles: 0, success: true, notModified: true });
          continue;
        }

        // 获取已存在的文章 URL
        const existingArticles = await db
          .select({ url: articles.url })
          .from(articles)
          .where(eq(articles.feedId, feed.id));
        const existingUrls = new Set(existingArticles.map((a) => a.url));

        // 只插入新文章
        const newArticles = parsed.articles.filter(
          (a) => a.url && !existingUrls.has(a.url)
        );

        if (newArticles.length > 0) {
          await db.insert(articles).values(
            newArticles.slice(0, 50).map((a) => ({
              userId,  // 新增：直接关联用户
              feedId: feed.id,
              title: a.title,
              url: a.url,
              content: a.content,
              contentText: stripHtml(a.content),
              summary: a.summary,
              author: a.author,
              imageUrl: a.imageUrl,
              publishedAt: a.publishedAt,
            }))
          );
        }

        // 更新抓取时间和元数据
        const interval = feed.fetchIntervalMinutes ?? 60;
        await db
          .update(feeds)
          .set({
            lastFetchedAt: new Date().toISOString(),
            nextFetchAt: calculateNextFetch(interval),
            lastEtag: parsed.etag ?? null,
            lastModified: parsed.lastModified ?? null,
            contentHash: parsed.hash ?? null,
            healthStatus: 'healthy',
            consecutiveErrors: 0,
            lastErrorMessage: null,
          })
          .where(eq(feeds.id, feed.id));

        results.push({ feedId: feed.id, newArticles: newArticles.length, success: true });
      } catch (err) {
        // 更新错误状态
        await db
          .update(feeds)
          .set({
            consecutiveErrors: sql`${feeds.consecutiveErrors} + 1`,
            lastErrorMessage: err instanceof Error ? err.message : "未知错误",
            lastErrorAt: new Date().toISOString(),
            healthStatus: 'error',
          })
          .where(eq(feeds.id, feed.id));

        results.push({
          feedId: feed.id,
          success: false,
          error: err instanceof Error ? err.message : "未知错误",
        });
      }
    }

    // 刷新后清除用户缓存
    await cache.invalidateUser(userId);

    return c.json({ success: true, data: { results, total: feedList.length } });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "刷新失败" }, 500);
  }
});

// Helper: Calculate next fetch time
function calculateNextFetch(intervalMinutes: number): string {
  const next = new Date();
  next.setMinutes(next.getMinutes() + intervalMinutes);
  return next.toISOString();
}

// Helper: Strip HTML to text
function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default refreshRoute;
