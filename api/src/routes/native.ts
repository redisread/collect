import { nativeArticleFields, nativeSyncPage } from "../lib/native-sync";
import { automaticallyExtract } from "../lib/automatic-extraction";
import { nativeContent } from "../lib/native-content";
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, gt, asc } from "drizzle-orm";
import { getDb } from "../db";
import { articles, session } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const app = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();
app.use("*", authMiddleware);
app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });

app.delete("/session", async c => {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) return c.json({ success: false, error: "缺少会话" }, 400);
  await getDb(c.env.DB).delete(session).where(and(eq(session.userId, c.get("userId")), eq(session.token, token)));
  return c.json({ success: true, data: {} });
});

app.get("/sync", async c => {
  const parsed = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).safeParse(c.req.query("after") ?? "0");
  if (!parsed.success) return c.json({ success: false, error: "无效的同步位置" }, 400);
  return c.json({ success: true, data: await nativeSyncPage(getDb(c.env.DB), c.get("userId"), parsed.data) });
});

// Keyset paging allows a full reconciliation without carrying article bodies.
app.get("/articles", async c => {
  const cursor = c.req.query("after") || "";
  const rows = await getDb(c.env.DB).select(nativeArticleFields).from(articles).where(and(eq(articles.userId, c.get("userId")), gt(articles.id, cursor), c.req.query("feedId") ? eq(articles.feedId, c.req.query("feedId")!) : undefined))
    .orderBy(asc(articles.id)).limit(200);
  return c.json({ success: true, data: { articles: rows, next: rows.length === 200 ? rows.at(-1)!.id : null } });
});
app.get("/articles/:id", async c => {
  let article = await getDb(c.env.DB).select().from(articles)
    .where(and(eq(articles.userId, c.get("userId")), eq(articles.id, c.req.param("id")))).get();
  if (!article) return c.json({ success: false, error: "文章不存在" }, 404);
  if (c.req.query("extract") === "true") article = await automaticallyExtract(getDb(c.env.DB), article);
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
  const current = await db.select(nativeArticleFields).from(articles).where(owned).get();
  if (!current) return c.json({ success: false, error: "文章不存在" }, 404);
  if (!updated.length) return c.json({ success: false, error: "文章已在其他设备更新", data: current }, 409);
  return c.json({ success: true, data: current });
});
export default app;
