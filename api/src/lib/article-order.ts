import { asc, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import { articles, userPreferences } from "../db/schema";

export async function readArticleOrder(db: DB, userId: string) {
  const row = await db.select({ order: userPreferences.articleSortOrder }).from(userPreferences)
    .where(eq(userPreferences.userId, userId)).get();
  return row?.order === "asc" ? "asc" : "desc";
}

// SQLite normalizes valid timestamps including timezone offsets. Unknown dates sort last.
export const publicationTime = sql<number | null>`julianday(${articles.publishedAt})`;
export function articleOrder(order: "asc" | "desc") {
  const direction = order === "asc" ? asc : desc;
  return [asc(sql`${publicationTime} is null`), direction(publicationTime), direction(articles.id)];
}
