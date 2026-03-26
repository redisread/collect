import { Hono } from "hono";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { feeds, articles, fetchQueue, userPreferences } from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { FeedSyncService } from "../../services/FeedSyncService";
import { RSSFetcher } from "../../lib/rss/fetcher";
import type { CloudflareEnv } from "../../types";

const syncRoute = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { userId: string; isAdmin?: boolean };
}>();

// Admin middleware
const adminMiddleware = async (c: any, next: any) => {
  // In production, verify admin role
  // For now, allow all authenticated users
  c.set("isAdmin", true);
  await next();
};

syncRoute.use("/*", authMiddleware);

/**
 * POST /api/v2/sync/schedule
 * Schedule feeds for sync (manual trigger)
 */
syncRoute.post("/schedule", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json<{ feedId?: string; batchSize?: number }>().catch(() => ({ feedId: undefined, batchSize: undefined }));
    const db = getDb(c.env.DB);
    const syncService = new FeedSyncService(db, c.env.COLLECT_KV, new RSSFetcher());

    if (body.feedId) {
      // Schedule specific feed
      const [feed] = await db
        .select()
        .from(feeds)
        .where(and(eq(feeds.id, body.feedId), eq(feeds.userId, userId)));

      if (!feed) {
        return c.json({ success: false, error: "订阅源不存在" }, 404);
      }

      const result = await syncService.syncFeed(feed.id, userId);
      return c.json({ success: true, data: result });
    } else {
      // Schedule all user feeds
      const userFeeds = await db
        .select({ id: feeds.id, userId: feeds.userId })
        .from(feeds)
        .where(eq(feeds.userId, userId));

      // Create queue items
      if (userFeeds.length > 0) {
        await db.insert(fetchQueue).values(
          userFeeds.map((f) => ({
            feedId: f.id,
            userId: f.userId,
            priority: 10, // High priority for manual sync
            status: "pending" as const,
          }))
        );
      }

      return c.json({
        success: true,
        data: { scheduled: userFeeds.length },
      });
    }
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "调度失败",
      },
      500
    );
  }
});

/**
 * POST /api/v2/sync/process
 * Process pending sync jobs
 */
syncRoute.post("/process", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") ?? "10", 10);
    const db = getDb(c.env.DB);
    const syncService = new FeedSyncService(db, c.env.COLLECT_KV, new RSSFetcher());

    const results = await syncService.processSyncJobs(limit);

    return c.json({
      success: true,
      data: {
        processed: results.length,
        results,
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "处理失败",
      },
      500
    );
  }
});

/**
 * GET /api/v2/sync/queue
 * Get queue status
 */
syncRoute.get("/queue", async (c) => {
  try {
    const db = getDb(c.env.DB);
    const syncService = new FeedSyncService(db, c.env.COLLECT_KV, new RSSFetcher());

    const stats = await syncService.getQueueStats();

    // Get recent jobs
    const recentJobs = await db
      .select({
        id: fetchQueue.id,
        feedId: fetchQueue.feedId,
        status: fetchQueue.status,
        priority: fetchQueue.priority,
        scheduledAt: fetchQueue.scheduledAt,
        startedAt: fetchQueue.startedAt,
        completedAt: fetchQueue.completedAt,
        errorMessage: fetchQueue.errorMessage,
        retryCount: fetchQueue.retryCount,
      })
      .from(fetchQueue)
      .orderBy(desc(fetchQueue.scheduledAt))
      .limit(50);

    return c.json({
      success: true,
      data: {
        stats,
        recentJobs,
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "获取队列状态失败",
      },
      500
    );
  }
});

/**
 * POST /api/v2/sync/cleanup
 * Cleanup old data
 */
syncRoute.post("/cleanup", adminMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DB);
    const syncService = new FeedSyncService(db, c.env.COLLECT_KV, new RSSFetcher());

    // Run cleanup tasks
    const [articlesCleaned, jobsCleaned] = await Promise.all([
      syncService.cleanupOldArticles(),
      syncService.cleanupOldJobs(24),
    ]);

    return c.json({
      success: true,
      data: {
        articlesCleaned,
        jobsCleaned,
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "清理失败",
      },
      500
    );
  }
});

/**
 * GET /api/v2/sync/health
 * Get sync health status
 */
syncRoute.get("/health", async (c) => {
  try {
    const userId = c.get("userId");
    const db = getDb(c.env.DB);

    // Get user's feed health stats
    const healthStats = await db
      .select({
        status: feeds.healthStatus,
        count: sql<number>`count(*)`,
      })
      .from(feeds)
      .where(eq(feeds.userId, userId))
      .groupBy(feeds.healthStatus);

    // Get feeds with errors
    const errorFeeds = await db
      .select({
        id: feeds.id,
        title: feeds.title,
        healthStatus: feeds.healthStatus,
        consecutiveErrors: feeds.consecutiveErrors,
        lastErrorMessage: feeds.lastErrorMessage,
        lastErrorAt: feeds.lastErrorAt,
      })
      .from(feeds)
      .where(
        and(
          eq(feeds.userId, userId),
          inArray(feeds.healthStatus, ["error", "degraded"])
        )
      )
      .orderBy(desc(feeds.lastErrorAt))
      .limit(10);

    // Get stale feeds (not updated in 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const staleFeeds = await db
      .select({
        id: feeds.id,
        title: feeds.title,
        lastFetchedAt: feeds.lastFetchedAt,
      })
      .from(feeds)
      .where(
        and(
          eq(feeds.userId, userId),
          sql`${feeds.lastFetchedAt} < ${oneWeekAgo.toISOString()}`
        )
      )
      .orderBy(asc(feeds.lastFetchedAt))
      .limit(10);

    return c.json({
      success: true,
      data: {
        healthStats,
        errorFeeds,
        staleFeeds,
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "获取健康状态失败",
      },
      500
    );
  }
});

export default syncRoute;
