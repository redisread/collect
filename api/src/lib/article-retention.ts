import { and, eq, sql, type SQL } from "drizzle-orm";
import type { DB } from "../db";
import { articles, userPreferences } from "../db/schema";

export const RETENTION_DAYS = [7, 30, 60, 90] as const;

export function articleExpiry(days?: number) {
  const duration = days === undefined
    ? sql`coalesce((SELECT CASE WHEN article_retention_days IN (7,30,60,90) THEN article_retention_days ELSE 30 END FROM user_preferences WHERE user_id = ${articles.userId}), 30)`
    : sql`${days}`;
  return sql<string>`max(datetime(${articles.createdAt}, '+' || ${duration} || ' days'), coalesce(datetime(${articles.retentionGraceUntil}), '0001-01-01'))`;
}

export function expiredArticles(userId?: string, days?: number): SQL {
  return and(
    sql`coalesce(${articles.isStarred}, 0) = 0`,
    sql`coalesce(${articles.isReadLater}, 0) = 0`,
    sql`${articleExpiry(days)} <= datetime('now')`,
    userId ? eq(articles.userId, userId) : undefined,
  )!;
}

export async function retentionDays(db: DB, userId: string) {
  const row = await db.select({ days: userPreferences.articleRetentionDays }).from(userPreferences)
    .where(eq(userPreferences.userId, userId)).get();
  return RETENTION_DAYS.includes(row?.days as typeof RETENTION_DAYS[number]) ? row!.days! : 30;
}

export async function cleanupArticles(db: DB, userId?: string) {
  // A DELETE trigger records expired URLs atomically, including concurrent sync writes.
  const result = await db.delete(articles).where(expiredArticles(userId)).run();
  return result.meta.changes;
}
