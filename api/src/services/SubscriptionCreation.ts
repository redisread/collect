import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { DB } from "../db";
import { articles, expiredArticleUrls, feeds } from "../db/schema";
import type { ParsedFeed } from "../lib/rss/parser";
import { articleIdForUrl } from "./FeedSyncService";
import { jsonValues } from "./SubscriptionManagement";

export async function saveSubscription(
  db: DB,
  userId: string,
  parsed: ParsedFeed,
  options: {
    feedUrl: string;
    folderId?: string | null;
    existing?: typeof feeds.$inferSelect;
    fetchIntervalMinutes?: number;
  },
) {
  const { existing, feedUrl } = options;
  const feedID = existing?.id ?? crypto.randomUUID();
  const order = await db
    .select({ next: sql<number>`coalesce(max(${feeds.sortOrder}),-1)+1` })
    .from(feeds)
    .where(eq(feeds.userId, userId))
    .get();
  const siteURL = parsed.siteUrl || feedUrl;
  const saveFeed = existing
    ? db
        .update(feeds)
        .set({
          unsubscribedAt: null,
          isActive: true,
          folderId: options.folderId ?? null,
          lastEtag: null,
          lastModified: null,
          contentHash: null,
          nextFetchAt: null,
          fetchIntervalMinutes:
            options.fetchIntervalMinutes ?? existing.fetchIntervalMinutes,
        })
        .where(
          and(
            eq(feeds.id, existing.id),
            eq(feeds.userId, userId),
            isNotNull(feeds.unsubscribedAt),
          ),
        )
        .returning()
    : db
        .insert(feeds)
        .values({
          id: feedID,
          userId,
          folderId: options.folderId ?? null,
          title: parsed.title,
          url: siteURL,
          feedUrl,
          description: parsed.description,
          faviconUrl:
            parsed.faviconUrl ?? new URL("/favicon.ico", siteURL).href,
          lastFetchedAt: new Date().toISOString(),
          sortOrder: order?.next ?? 0,
          fetchIntervalMinutes: options.fetchIntervalMinutes ?? 60,
        })
        .onConflictDoNothing()
        .returning();
  const current = parsed.articles.slice(0, 50);
  const known = new Set(
    (
      await db
        .select({ url: articles.url })
        .from(articles)
        .where(eq(articles.feedId, feedID))
    ).map((a) => a.url),
  );
  const values = await Promise.all(
    current
      .filter((a) => !known.has(a.url))
      .map(async (a) => ({
        id: await articleIdForUrl(feedID, a.url),
        userId,
        feedId: feedID,
        title: a.title,
        url: a.url,
        content: a.content,
        contentText: a.content
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
        summary: a.summary,
        author: a.author,
        imageUrl: a.imageUrl,
        publishedAt: a.publishedAt,
      })),
  );
  const inserts = [];
  for (let offset = 0; offset < values.length; offset += 3)
    inserts.push(
      db
        .insert(articles)
        .values(values.slice(offset, offset + 3))
        .onConflictDoNothing(),
    );
  const clearURLs =
    existing && current.length
      ? [
          db
            .delete(expiredArticleUrls)
            .where(
              and(
                eq(expiredArticleUrls.feedId, feedID),
                inArray(
                  expiredArticleUrls.url,
                  jsonValues(current.map((a) => a.url)),
                ),
              ),
            ),
        ]
      : [];
  // A failed article write rolls back both creation/restoration and expiry-ledger changes.
  const [saved] = await db.batch([saveFeed, ...clearURLs, ...inserts]);
  const feed = saved[0];
  if (!feed) throw new HTTPException(409, { message: "该订阅源已存在" });
  const unread = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(and(eq(articles.feedId, feedID), eq(articles.isRead, false)))
    .get();
  return { ...feed, unreadCount: unread?.count ?? 0 };
}
