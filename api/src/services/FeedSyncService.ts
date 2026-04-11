import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";
import type { DB } from "../db";
import { feeds, articles, fetchQueue, userPreferences, FeedHealthStatus, QueueStatus } from "../db/schema";
import type { ParsedArticle, ParsedFeed } from "../lib/rss/parser";

export interface SyncResult {
  feedId: string;
  newArticles?: number;
  updatedArticles?: number;
  error?: string;
  duration: number;
}

export interface SyncOptions {
  etag?: string | null;
  lastModified?: string | null;
}

export interface ParsedFeedWithMeta extends ParsedFeed {
  notModified?: boolean;
  etag?: string;
  lastModified?: string;
  hash?: string;
}

export class FeedSyncService {
  constructor(
    private db: DB,
    private kv: KVNamespace,
    private fetcher: {
      fetch: (url: string, options?: SyncOptions) => Promise<ParsedFeedWithMeta>;
    }
  ) {}

  /**
   * Schedule feeds that need to be synced into the queue
   * Called by Cron trigger
   */
  async scheduleSyncJobs(batchSize: number = 100): Promise<number> {
    const now = new Date().toISOString();

    // Find feeds that need syncing
    const feedsToSync = await this.db
      .select({
        id: feeds.id,
        userId: feeds.userId,
        priority: sql<number>`
          CASE
            WHEN ${feeds.healthStatus} = 'error' THEN 0
            WHEN ${feeds.lastFetchedAt} IS NULL THEN 10
            ELSE 5
          END
        `,
      })
      .from(feeds)
      .where(
        and(
          eq(feeds.isActive, true),
          sql`${feeds.nextFetchAt} <= ${now}`
        )
      )
      .limit(batchSize);

    // Batch insert queue items
    if (feedsToSync.length > 0) {
      await this.db.insert(fetchQueue).values(
        feedsToSync.map((f) => ({
          feedId: f.id,
          userId: f.userId,
          priority: f.priority,
          status: QueueStatus.PENDING,
        }))
      );
    }

    return feedsToSync.length;
  }

  /**
   * Process pending sync jobs from the queue
   * Called by HTTP request or Queue trigger
   */
  async processSyncJobs(limit: number = 10): Promise<SyncResult[]> {
    // Transaction: get and lock jobs
    const jobs = await this.db.transaction(async (tx) => {
      // Get pending jobs
      const pending = await tx
        .select()
        .from(fetchQueue)
        .where(eq(fetchQueue.status, QueueStatus.PENDING))
        .orderBy(asc(fetchQueue.scheduledAt), desc(fetchQueue.priority))
        .limit(limit);

      if (pending.length === 0) return [];

      // Mark as processing
      const jobIds = pending.map((j) => j.id);
      await tx
        .update(fetchQueue)
        .set({
          status: QueueStatus.PROCESSING,
          startedAt: new Date().toISOString(),
        })
        .where(inArray(fetchQueue.id, jobIds));

      return pending;
    });

    // Process jobs in parallel
    const results = await Promise.all(
      jobs.map((job) => this.processSingleFeed(job))
    );

    return results;
  }

  /**
   * Sync a specific feed immediately (for manual refresh)
   */
  async syncFeed(feedId: string, userId: string): Promise<SyncResult> {
    // Create a job for this feed
    const [job] = await this.db
      .insert(fetchQueue)
      .values({
        feedId,
        userId,
        priority: 10, // High priority for manual refresh
        status: QueueStatus.PENDING,
      })
      .returning();

    return await this.processSingleFeed(job);
  }

  /**
   * Process a single feed sync job
   */
  private async processSingleFeed(job: typeof fetchQueue.$inferSelect): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      // Get feed configuration
      const [feed] = await this.db
        .select()
        .from(feeds)
        .where(eq(feeds.id, job.feedId));

      if (!feed) {
        throw new Error("Feed not found");
      }

      // Fetch with incremental update headers
      const parsed = await this.fetcher.fetch(feed.feedUrl, {
        etag: feed.lastEtag,
        lastModified: feed.lastModified,
      });

      // Content not modified (304)
      if (parsed.notModified) {
        await this.updateFeedSuccess(feed, 0, 0);
        await this.completeJob(job.id, { newArticles: 0 });
        return { feedId: feed.id, newArticles: 0, duration: Date.now() - startTime };
      }

      // Get existing article URLs for deduplication
      const existingUrls = await this.getCachedArticleUrls(feed.id);

      // Filter new articles
      const newArticles = parsed.articles.filter(
        (a) => a.url && !existingUrls.has(a.url)
      );

      // Insert new articles
      if (newArticles.length > 0) {
        await this.insertArticles(feed, newArticles);
      }

      // Update feed status
      await this.updateFeedSuccess(feed, newArticles.length, 0, {
        etag: parsed.etag,
        lastModified: parsed.lastModified,
        contentHash: parsed.hash,
      });

      // Complete job
      await this.completeJob(job.id, { newArticles: newArticles.length });

      // Invalidate caches
      await this.invalidateFeedCache(feed.id, feed.userId);

      return {
        feedId: feed.id,
        newArticles: newArticles.length,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      await this.handleSyncError(job, error);
      return {
        feedId: job.feedId,
        error: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get cached article URLs for a feed
   */
  private async getCachedArticleUrls(feedId: string): Promise<Set<string>> {
    const cacheKey = `feed:${feedId}:urls`;
    const cached = await this.kv.get(cacheKey);

    if (cached) {
      return new Set(JSON.parse(cached));
    }

    // Cache miss - query database
    const urls = await this.db
      .select({ url: articles.url })
      .from(articles)
      .where(eq(articles.feedId, feedId));

    const urlSet = new Set(urls.map((u) => u.url));

    // Write to cache (1 hour TTL)
    await this.kv.put(cacheKey, JSON.stringify([...urlSet]), {
      expirationTtl: 3600,
    });

    return urlSet;
  }

  /**
   * Insert articles with user preferences applied
   */
  private async insertArticles(
    feed: typeof feeds.$inferSelect,
    newArticles: ParsedArticle[]
  ): Promise<void> {
    // Get user preferences
    const [prefs] = await this.db
      .select({ maxArticlesPerFeed: userPreferences.maxArticlesPerFeed })
      .from(userPreferences)
      .where(eq(userPreferences.userId, feed.userId));

    const maxArticles = prefs?.maxArticlesPerFeed ?? 100;

    // Only keep latest N articles
    const retentionDate = await this.calculateRetentionDate(feed.userId);
    const articlesToInsert = newArticles
      .slice(0, maxArticles)
      .map((a) => ({
        userId: feed.userId,
        feedId: feed.id,
        title: a.title,
        url: a.url,
        content: a.content,
        contentText: this.stripHtml(a.content),
        summary: a.summary,
        author: a.author,
        imageUrl: a.imageUrl,
        publishedAt: a.publishedAt,
        retentionDate,
      }));

    await this.db
      .insert(articles)
      .values(articlesToInsert)
      .onConflictDoNothing();

    // Update feed stats
    await this.updateFeedStats(feed.id);
  }

  /**
   * Update feed after successful sync
   */
  private async updateFeedSuccess(
    feed: typeof feeds.$inferSelect,
    newArticles: number,
    updatedArticles: number,
    meta?: { etag?: string; lastModified?: string; contentHash?: string }
  ): Promise<void> {
    const intervalMinutes = feed.fetchIntervalMinutes ?? 60;
    const nextFetchAt = new Date();
    nextFetchAt.setMinutes(nextFetchAt.getMinutes() + intervalMinutes);

    await this.db
      .update(feeds)
      .set({
        lastFetchedAt: new Date().toISOString(),
        nextFetchAt: nextFetchAt.toISOString(),
        healthStatus: FeedHealthStatus.HEALTHY,
        consecutiveErrors: 0,
        lastErrorMessage: null,
        lastErrorAt: null,
        lastEtag: meta?.etag ?? null,
        lastModified: meta?.lastModified ?? null,
        contentHash: meta?.contentHash ?? null,
        cachedArticleCount: sql`${feeds.cachedArticleCount} + ${newArticles}`,
        cachedUnreadCount: sql`${feeds.cachedUnreadCount} + ${newArticles}`,
      })
      .where(eq(feeds.id, feed.id));
  }

  /**
   * Handle sync error
   */
  private async handleSyncError(
    job: typeof fetchQueue.$inferSelect,
    error: unknown
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const maxRetries = 3;
    const retryCount = job.retryCount ?? 0;

    // Update feed error status
    await this.db
      .update(feeds)
      .set({
        healthStatus:
          retryCount >= maxRetries
            ? FeedHealthStatus.ERROR
            : FeedHealthStatus.DEGRADED,
        consecutiveErrors: sql`${feeds.consecutiveErrors} + 1`,
        lastErrorMessage: errorMessage,
        lastErrorAt: new Date().toISOString(),
      })
      .where(eq(feeds.id, job.feedId));

    // Update job status
    if (retryCount < maxRetries) {
      // Retry later
      const retryDelay = Math.pow(2, retryCount) * 60; // Exponential backoff: 1min, 2min, 4min
      const nextAttempt = new Date();
      nextAttempt.setMinutes(nextAttempt.getMinutes() + retryDelay);

      await this.db
        .update(fetchQueue)
        .set({
          status: QueueStatus.PENDING,
          retryCount: sql`${fetchQueue.retryCount} + 1`,
          scheduledAt: nextAttempt.toISOString(),
          errorMessage,
        })
        .where(eq(fetchQueue.id, job.id));
    } else {
      // Mark as failed
      await this.db
        .update(fetchQueue)
        .set({
          status: QueueStatus.FAILED,
          completedAt: new Date().toISOString(),
          errorMessage,
        })
        .where(eq(fetchQueue.id, job.id));
    }
  }

  /**
   * Complete a job
   */
  private async completeJob(
    jobId: string,
    result: { newArticles: number }
  ): Promise<void> {
    await this.db
      .update(fetchQueue)
      .set({
        status: QueueStatus.COMPLETED,
        completedAt: new Date().toISOString(),
        result: JSON.stringify(result),
      })
      .where(eq(fetchQueue.id, jobId));
  }

  /**
   * Update feed statistics
   */
  private async updateFeedStats(feedId: string): Promise<void> {
    const stats = await this.db
      .select({
        total: sql<number>`count(*)`,
        unread: sql<number>`sum(CASE WHEN is_read = 0 THEN 1 ELSE 0 END)`,
      })
      .from(articles)
      .where(eq(articles.feedId, feedId));

    await this.db
      .update(feeds)
      .set({
        cachedArticleCount: stats[0]?.total ?? 0,
        cachedUnreadCount: stats[0]?.unread ?? 0,
      })
      .where(eq(feeds.id, feedId));
  }

  /**
   * Invalidate caches after sync
   */
  private async invalidateFeedCache(feedId: string, userId: string): Promise<void> {
    const promises = [
      this.kv.delete(`feed:${feedId}:urls`),
      this.kv.delete(`user:${userId}:feeds`),
      this.kv.delete(`user:${userId}:unread_count`),
    ];

    await Promise.all(promises);
  }

  /**
   * Calculate article retention date based on user preferences
   */
  private async calculateRetentionDate(userId: string): Promise<string | null> {
    const [prefs] = await this.db
      .select({ retentionDays: userPreferences.articleRetentionDays })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    const days = prefs?.retentionDays ?? 30;
    if (days === 0) return null; // Keep forever

    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  /**
   * Strip HTML to plain text
   */
  private stripHtml(html: string): string {
    if (!html) return "";
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Cleanup old completed/failed jobs
   */
  async cleanupOldJobs(olderThanHours: number = 24): Promise<number> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - olderThanHours);

    const result = await this.db
      .delete(fetchQueue)
      .where(
        and(
          inArray(fetchQueue.status, [QueueStatus.COMPLETED, QueueStatus.FAILED]),
          sql`${fetchQueue.completedAt} < ${cutoff.toISOString()}`
        )
      );

    // D1 returns meta.changes for delete operations
    return (result as any).meta?.changes ?? 0;
  }

  /**
   * Cleanup old articles based on retention policy
   */
  async cleanupOldArticles(): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.db
      .delete(articles)
      .where(
        and(
          sql`${articles.retentionDate} IS NOT NULL`,
          sql`${articles.retentionDate} < ${now}`,
          eq(articles.isStarred, false) // Keep starred articles
        )
      );

    // D1 returns meta.changes for delete operations
    return (result as any).meta?.changes ?? 0;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const stats = await this.db
      .select({
        status: fetchQueue.status,
        count: sql<number>`count(*)`,
      })
      .from(fetchQueue)
      .groupBy(fetchQueue.status);

    const result = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const stat of stats) {
      result[stat.status as keyof typeof result] = stat.count;
    }

    return result;
  }
}
