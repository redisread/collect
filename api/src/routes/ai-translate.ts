import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, lt } from "drizzle-orm";
import { load } from "cheerio/slim";
import { getDb } from "../db";
import { aiProfiles, aiTranslationJobs, articles, translationHistory } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";
import { SUPPORTED_LANG_CODES } from "../config/languages";
import { createTranslationPlan, renderTranslationPlan, translateInlineHtml, TranslationError, type TranslationPlan, type TranslatedRun } from "../lib/translate";
import { decryptApiKey, requestAiTranslation, validateProviderDestination } from "../lib/ai-provider";

const app = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();
app.use("*", authMiddleware);
app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
const startSchema = z.object({
  articleId: z.string().min(1), profileId: z.string().uuid(), revision: z.string().uuid(),
  targetLang: z.string().refine(value => SUPPORTED_LANG_CODES.has(value)),
  content: z.string().trim().min(1).max(150_000),
  restoreOnly: z.boolean().default(false),
});

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function responseFor(job: typeof aiTranslationJobs.$inferSelect) {
  const plan = JSON.parse(job.plan) as TranslationPlan;
  const results = JSON.parse(job.results) as TranslatedRun[];
  return { id: job.id, completed: job.completed, total: plan.jobs.length, complete: job.completed === plan.jobs.length,
    profileId: job.profileId, revision: job.revision, targetLang: job.targetLang,
    ...renderTranslationPlan(plan, results) };
}

app.post("/start", zValidator("json", startSchema), async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const article = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.id, body.articleId), eq(articles.userId, userId))).get();
  if (!article) return c.json({ success: false, error: "文章不存在" }, 404);
  const profile = await db.select({ revision: aiProfiles.revision }).from(aiProfiles)
    .where(and(eq(aiProfiles.id, body.profileId), eq(aiProfiles.userId, userId))).get();
  if (!profile) return c.json({ success: false, error: "AI 配置不存在，请在个人设置中选择" }, 404);
  if (profile.revision !== body.revision) return c.json({ success: false, error: "AI 配置已更新，请重新点击翻译" }, 409);
  const contentHash = await hash(body.content);
  const id = await hash(JSON.stringify([userId, body.articleId, body.profileId, profile.revision, body.targetLang, contentHash]));
  let job = await db.select().from(aiTranslationJobs).where(and(eq(aiTranslationJobs.id, id), eq(aiTranslationJobs.userId, userId))).get();
  if (!job && body.restoreOnly) return c.json({ success: true, data: null });
  if (!job) {
    let plan: TranslationPlan;
    try { plan = createTranslationPlan(body.content, body.targetLang, 1200); }
    catch (error) { return c.json({ success: false, error: error instanceof TranslationError ? error.message : "无法拆分文章内容" }, 400); }
    await db.insert(aiTranslationJobs).values({ id, userId, articleId: body.articleId, profileId: body.profileId,
      revision: profile.revision, targetLang: body.targetLang, contentHash, plan: JSON.stringify(plan), updatedAt: new Date().toISOString() })
      .onConflictDoNothing();
    job = await db.select().from(aiTranslationJobs).where(and(eq(aiTranslationJobs.id, id), eq(aiTranslationJobs.userId, userId))).get();
  }
  if (!job) return c.json({ success: false, error: "配置已变更，请重新尝试" }, 409);
  return c.json({ success: true, data: responseFor(job) });
});

app.post("/:id/step", zValidator("json", z.object({ completed: z.number().int().min(0).max(600) })), async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const id = c.req.param("id");
  const owner = and(eq(aiTranslationJobs.id, id), eq(aiTranslationJobs.userId, userId));
  const job = await db.select().from(aiTranslationJobs).where(owner).get();
  if (!job) return c.json({ success: false, error: "翻译进度不存在，请重新开始" }, 404);
  const plan = JSON.parse(job.plan) as TranslationPlan;
  if (job.completed === plan.jobs.length || job.completed !== c.req.valid("json").completed) {
    return c.json({ success: true, data: responseFor(job) });
  }
  const profile = await db.select().from(aiProfiles).where(and(eq(aiProfiles.id, job.profileId), eq(aiProfiles.userId, userId))).get();
  if (!profile || profile.revision !== job.revision) return c.json({ success: false, error: "配置已修改，请重新点击翻译以使用新配置" }, 409);
  const leaseToken = crypto.randomUUID();
  const acquired = await db.update(aiTranslationJobs).set({ leaseToken, leaseUntil: Date.now() + 90_000 })
    .where(and(owner, eq(aiTranslationJobs.completed, job.completed), lt(aiTranslationJobs.leaseUntil, Date.now())))
    .returning({ id: aiTranslationJobs.id });
  if (!acquired.length) return c.json({ success: false, error: "这一段正在翻译，请稍后点击继续" }, 409);
  try {
    const signal = AbortSignal.timeout(55_000);
    const endpoint = await validateProviderDestination(profile.baseUrl, signal);
    const key = await decryptApiKey(profile.encryptedKey, c.env.AI_KEYS_ENCRYPTION_SECRET, `${userId}:${profile.id}`);
    const context = [plan.jobs[0], plan.jobs[job.completed - 1], plan.jobs[job.completed + 1]]
      .filter(Boolean).map(html => load(html, {}, false).text()).join("\n").slice(0, 3000);
    const result = await translateInlineHtml(plan.jobs[job.completed], text =>
      requestAiTranslation(profile, endpoint, key, text, job.targetLang, context, signal));
    const results = JSON.parse(job.results) as TranslatedRun[];
    results.push(result);
    const encoded = JSON.stringify(results);
    if (encoded.length > 900_000) throw new TranslationError("translation_size", "译文超出保存上限，请缩短文章后重试");
    const updated = await db.update(aiTranslationJobs).set({ results: encoded, completed: results.length,
      updatedAt: new Date().toISOString(), leaseToken: null, leaseUntil: 0 })
      .where(and(owner, eq(aiTranslationJobs.leaseToken, leaseToken))).returning();
    if (!updated.length) return c.json({ success: false, error: "任务已变更，请重新读取进度" }, 409);
    if (results.length === plan.jobs.length) {
      const article = await db.select({ title: articles.title }).from(articles).where(and(eq(articles.id, job.articleId), eq(articles.userId, userId))).get();
      await db.insert(translationHistory).values({ id: `ai-${id}`, userId, articleId: job.articleId, targetLang: job.targetLang,
        sourceLang: "auto", articleTitle: article?.title ?? "" }).onConflictDoNothing();
    }
    return c.json({ success: true, data: responseFor(updated[0]) });
  } catch (error) {
    return c.json({ success: false, error: error instanceof TranslationError ? error.message : "AI 翻译暂时失败，已完成段落已保存，请稍后继续" }, 502);
  } finally {
    await db.update(aiTranslationJobs).set({ leaseToken: null, leaseUntil: 0 }).where(and(owner, eq(aiTranslationJobs.leaseToken, leaseToken)));
  }
});

export default app;
