import type { CloudflareEnv } from "../types";
import { getDb } from "../db";
import { FeedSyncService } from "../services/FeedSyncService";
import { RSSFetcher } from "../lib/rss/fetcher";
import { eq } from "drizzle-orm";

/**
 * Cloudflare Workers Cron Triggers
 *
 * Schedule:
 * - Every 5 minutes: Create sync jobs
 * - Every hour: Process pending jobs
 * - Daily at 2 AM: Data cleanup
 * - Weekly on Monday at 6 AM: Weekly report
 */
export async function handleCron(
  event: ScheduledEvent,
  env: CloudflareEnv,
  ctx: ExecutionContext
): Promise<void> {
  const db = getDb(env.DB);
  const syncService = new FeedSyncService(db, env.COLLECT_KV, new RSSFetcher());

  console.log(`Cron triggered: ${event.cron}`);

  switch (event.cron) {
    case "*/5 * * * *": {
      // Every 5 minutes: Schedule feeds that need syncing
      try {
        const scheduled = await syncService.scheduleSyncJobs(200);
        console.log(`Scheduled ${scheduled} feeds for sync`);
      } catch (error) {
        console.error("Failed to schedule sync jobs:", error);
      }
      break;
    }

    case "0 * * * *": {
      // Every hour: Process pending jobs
      try {
        const results = await syncService.processSyncJobs(50);
        console.log(`Processed ${results.length} sync jobs`);

        // Log any errors
        const errors = results.filter((r) => r.error);
        if (errors.length > 0) {
          console.warn(`${errors.length} jobs failed:`, errors);
        }
      } catch (error) {
        console.error("Failed to process sync jobs:", error);
      }
      break;
    }

    case "0 2 * * *": {
      // Daily at 2 AM: Data cleanup
      try {
        // Clean up old articles based on retention policy
        const articlesCleaned = await syncService.cleanupOldArticles();
        console.log(`Cleaned up ${articlesCleaned} old articles`);

        // Clean up old completed/failed queue items
        const jobsCleaned = await syncService.cleanupOldJobs(24);
        console.log(`Cleaned up ${jobsCleaned} old queue items`);

        // Update feed statistics
        await updateFeedStatistics(db);
      } catch (error) {
        console.error("Failed to run data cleanup:", error);
      }
      break;
    }

    case "0 6 * * 1": {
      // Weekly report (Monday at 6 AM)
      try {
        await generateWeeklyReport(db);
      } catch (error) {
        console.error("Failed to generate weekly report:", error);
      }
      break;
    }

    default: {
      console.log(`Unknown cron schedule: ${event.cron}`);
    }
  }
}

/**
 * Update cached statistics for all feeds
 */
async function updateFeedStatistics(db: any): Promise<void> {
  const { feeds, articles } = await import("../db/schema");
  const { eq, sql } = await import("drizzle-orm");

  // Update feed article counts
  const feedStats = await db
    .select({
      feedId: articles.feedId,
      total: sql<number>`count(*)`,
      unread: sql<number>`sum(CASE WHEN is_read = 0 THEN 1 ELSE 0 END)`,
    })
    .from(articles)
    .groupBy(articles.feedId);

  for (const stat of feedStats) {
    await db
      .update(feeds)
      .set({
        cachedArticleCount: stat.total,
        cachedUnreadCount: stat.unread,
      })
      .where(eq(feeds.id, stat.feedId));
  }

  console.log(`Updated statistics for ${feedStats.length} feeds`);
}

/**
 * Generate weekly report
 */
async function generateWeeklyReport(db: any): Promise<void> {
  const { articles, feeds, user } = await import("../db/schema");
  const { sql } = await import("drizzle-orm");

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // Get weekly stats
  const stats = await db
    .select({
      totalArticles: sql<number>`count(*)`,
      totalUsers: sql<number>`count(DISTINCT user_id)`,
      activeFeeds: sql<number>`count(DISTINCT feed_id)`,
    })
    .from(articles)
    .where(sql`created_at >= ${oneWeekAgo.toISOString()}`);

  // Get error stats
  const { FeedHealthStatus } = await import("../db/schema");
  const errorFeeds = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(feeds)
    .where(eq(feeds.healthStatus, FeedHealthStatus.ERROR));

  console.log("Weekly Report:", {
    period: "Last 7 days",
    newArticles: stats[0]?.totalArticles ?? 0,
    activeUsers: stats[0]?.totalUsers ?? 0,
    activeFeeds: stats[0]?.activeFeeds ?? 0,
    errorFeeds: errorFeeds[0]?.count ?? 0,
  });
}

/**
 * Export for manual triggering via API
 */
export async function triggerScheduleSync(
  env: CloudflareEnv
): Promise<{ scheduled: number }> {
  const db = getDb(env.DB);
  const syncService = new FeedSyncService(db, env.COLLECT_KV, new RSSFetcher());

  const scheduled = await syncService.scheduleSyncJobs(200);
  return { scheduled };
}

export async function triggerProcessJobs(
  env: CloudflareEnv,
  limit: number = 50
): Promise<{ processed: number }> {
  const db = getDb(env.DB);
  const syncService = new FeedSyncService(db, env.COLLECT_KV, new RSSFetcher());

  const results = await syncService.processSyncJobs(limit);
  return { processed: results.length };
}

export async function triggerCleanup(
  env: CloudflareEnv
): Promise<{ articlesCleaned: number; jobsCleaned: number }> {
  const db = getDb(env.DB);
  const syncService = new FeedSyncService(db, env.COLLECT_KV, new RSSFetcher());

  const [articlesCleaned, jobsCleaned] = await Promise.all([
    syncService.cleanupOldArticles(),
    syncService.cleanupOldJobs(24),
  ]);

  return { articlesCleaned, jobsCleaned };
}
