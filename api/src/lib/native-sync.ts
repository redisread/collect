import { and, asc, eq, gt, lte } from "drizzle-orm";
import type { DB } from "../db";
import { articles, feeds, folders, nativeChanges, userPreferences } from "../db/schema";
import { articleExpiry, RETENTION_DAYS } from "./article-retention";
import { DEFAULT_TARGET_LANG } from "../config/languages";

export const nativeArticleFields = {
  expiresAt: articleExpiry(), id: articles.id, feedId: articles.feedId, title: articles.title,
  url: articles.url, summary: articles.summary, author: articles.author,
  publishedAt: articles.publishedAt, imageUrl: articles.imageUrl, isRead: articles.isRead,
  isStarred: articles.isStarred, isReadLater: articles.isReadLater,
  readingProgress: articles.readingProgress, readVersion: articles.readVersion,
  starVersion: articles.starVersion, laterVersion: articles.laterVersion,
  progressVersion: articles.progressVersion, contentVersion: articles.contentVersion,
  isExtracted: articles.isExtracted,
};

export async function nativeSyncPage(db: DB, userId: string, after: number) {
  // Replaced changes receive a new sequence. A concurrent edit is replayed on a later page/pull.
  const changes = await db.select().from(nativeChanges)
    .where(and(eq(nativeChanges.userId, userId), gt(nativeChanges.sequence, after)))
    .orderBy(asc(nativeChanges.sequence)).limit(201);
  const page = changes.slice(0, 200);
  const cursor = page.at(-1)?.sequence ?? after;
  const range = and(eq(nativeChanges.userId, userId), gt(nativeChanges.sequence, after), lte(nativeChanges.sequence, cursor));
  const kinds = new Set(page.map(change => change.kind));
  const updatedArticles = kinds.has("article") ? await db.select(nativeArticleFields).from(articles)
    .innerJoin(nativeChanges, and(eq(nativeChanges.entityId, articles.id), eq(nativeChanges.kind, "article")))
    .where(and(range, eq(articles.userId, userId))) : [];
  const updatedFeeds = kinds.has("feed") ? await db.select({
    id: feeds.id, title: feeds.title, feedUrl: feeds.feedUrl, folderId: feeds.folderId,
    unsubscribedAt: feeds.unsubscribedAt, autoExtract: feeds.autoExtract, sortOrder: feeds.sortOrder,
  }).from(feeds).innerJoin(nativeChanges, and(eq(nativeChanges.entityId, feeds.id), eq(nativeChanges.kind, "feed")))
    .where(and(range, eq(feeds.userId, userId))) : [];
  const updatedFolders = kinds.has("folder") ? await db.select({ id: folders.id, name: folders.name, sortOrder: folders.sortOrder })
    .from(folders).innerJoin(nativeChanges, and(eq(nativeChanges.entityId, folders.id), eq(nativeChanges.kind, "folder")))
    .where(and(range, eq(folders.userId, userId))) : [];
  let preferences;
  if (kinds.has("preferences")) {
    const row = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).get();
    preferences = {
      articleRetentionDays: RETENTION_DAYS.includes(row?.articleRetentionDays as 30) ? row!.articleRetentionDays : 30,
      articleSortOrder: row?.articleSortOrder === "asc" ? "asc" : "desc",
      translationTargetLanguage: row?.translationTargetLanguage ?? DEFAULT_TARGET_LANG,
    };
  }
  // Only explicit tombstones remove cached entities. Missing joins can be concurrent updates.
  const deleted = page.filter(change => change.deleted && change.kind !== "preferences")
    .map(change => ({ kind: change.kind, id: change.entityId }));
  return { cursor, hasMore: changes.length > 200, articles: updatedArticles, feeds: updatedFeeds,
    folders: updatedFolders, deleted, preferences };
}
