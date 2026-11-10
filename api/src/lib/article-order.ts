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
export function afterArticle(order: "asc" | "desc", cursor: { publishedAt: string | null; id: string }) {
  const operator = sql.raw(order === "asc" ? ">" : "<");
  const time = sql`julianday(${cursor.publishedAt})`;
  return sql`((${time} is not null and (${publicationTime} is null or
    ${publicationTime} ${operator} ${time} or
    (${publicationTime} = ${time} and ${articles.id} ${operator} ${cursor.id}))) or
    (${time} is null and ${publicationTime} is null and ${articles.id} ${operator} ${cursor.id}))`;
}
export function articleOrder(order: "asc" | "desc") {
  const direction = order === "asc" ? asc : desc;
  return [asc(sql`${publicationTime} is null`), direction(publicationTime), direction(articles.id)];
}
