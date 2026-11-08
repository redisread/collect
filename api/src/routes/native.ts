import { nativeContent } from "../lib/native-content";
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, gt, asc } from "drizzle-orm";
import { getDb } from "../db";
import { articles, session, user } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const app = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();
app.use("*", authMiddleware);
app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });

app.get("/account", async c => {
  const account = await getDb(c.env.DB).select({ id: user.id, name: user.name, email: user.email })
    .from(user).where(eq(user.id, c.get("userId"))).get();
  return c.json({ success: true, data: account });
});
app.delete("/session", async c => {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) return c.json({ success: false, error: "缺少会话" }, 400);
  await getDb(c.env.DB).delete(session).where(and(eq(session.userId, c.get("userId")), eq(session.token, token)));
  return c.json({ success: true, data: {} });
});

// Keyset paging allows a full reconciliation without carrying article bodies.
app.get("/articles", async c => {
  const cursor = c.req.query("after") || "";
  const rows = await getDb(c.env.DB).select({
    id: articles.id, feedId: articles.feedId, title: articles.title, url: articles.url,
    summary: articles.summary, author: articles.author, publishedAt: articles.publishedAt,
    imageUrl: articles.imageUrl, isRead: articles.isRead, isStarred: articles.isStarred,
    isReadLater: articles.isReadLater, readingProgress: articles.readingProgress,
    readVersion: articles.readVersion, starVersion: articles.starVersion,
    laterVersion: articles.laterVersion, progressVersion: articles.progressVersion,
  }).from(articles).where(and(eq(articles.userId, c.get("userId")), gt(articles.id, cursor)))
    .orderBy(asc(articles.id)).limit(200);
  return c.json({ success: true, data: { articles: rows, next: rows.length === 200 ? rows.at(-1)!.id : null } });
});
app.get("/articles/:id", async c => {
  const article = await getDb(c.env.DB).select().from(articles)
    .where(and(eq(articles.userId, c.get("userId")), eq(articles.id, c.req.param("id")))).get();
  if (!article) return c.json({ success: false, error: "文章不存在" }, 404);
  return c.json({ success: true, data: { ...article, ...nativeContent(article.content || article.summary || "", article.url) } });
});

const mutation = z.discriminatedUnion("field", [
  z.object({ field: z.literal("isRead"), value: z.boolean(), version: z.number().int().nonnegative() }),
  z.object({ field: z.literal("isStarred"), value: z.boolean(), version: z.number().int().nonnegative() }),
  z.object({ field: z.literal("isReadLater"), value: z.boolean(), version: z.number().int().nonnegative() }),
  z.object({ field: z.literal("readingProgress"), value: z.number().int().min(0).max(100), version: z.number().int().nonnegative() }),
]);
app.patch("/articles/:id", async c => {
  const parsed = mutation.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, error: "无效的状态修改" }, 400);
  const body = parsed.data;
  const db = getDb(c.env.DB);
  const owned = and(eq(articles.id, c.req.param("id")), eq(articles.userId, c.get("userId")));
  const versions = { isRead: articles.readVersion, isStarred: articles.starVersion,
    isReadLater: articles.laterVersion, readingProgress: articles.progressVersion };
  // A conditional UPDATE keeps conflict detection atomic with the write.
  const updated = await db.update(articles).set({ [body.field]: body.value })
    .where(and(owned, eq(versions[body.field], body.version))).returning({ id: articles.id });
  const current = await db.select().from(articles).where(owned).get();
  if (!current) return c.json({ success: false, error: "文章不存在" }, 404);
  if (!updated.length) return c.json({ success: false, error: "文章已在其他设备更新", data: current }, 409);
  return c.json({ success: true, data: current });
});
export default app;
