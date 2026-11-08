import { and, eq } from "drizzle-orm";
import type { DB } from "../db";
import { articles, feeds, type Article } from "../db/schema";
import { extractArticle } from "./extractor";

export async function automaticallyExtract(db: DB, article: Article): Promise<Article> {
  if (article.isExtracted) return article;
  const feed = await db.select({ enabled: feeds.autoExtract }).from(feeds)
    .where(and(eq(feeds.id, article.feedId), eq(feeds.userId, article.userId))).get();
  if (!feed?.enabled) return article;
  try {
    const extracted = await extractArticle(article.url);
    const updated = await db.update(articles).set({
      content: extracted.content, contentText: extracted.content.replace(/<[^>]*>/g, " "),
      isExtracted: true, extractedAt: new Date().toISOString(),
    }).where(and(eq(articles.id, article.id), eq(articles.isExtracted, false))).returning().get();
    return updated ?? await db.select().from(articles).where(eq(articles.id, article.id)).get() ?? article;
  } catch {
    // A failed origin must not prevent reading the original feed content.
    return article;
  }
}
