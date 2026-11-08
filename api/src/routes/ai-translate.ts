import { readAiRunState, pendingRuns, translateAiBatch } from "../lib/ai-progress";
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
import { createTranslationPlan, renderTranslationPlan, translateInlineHtml, TranslationError, type TranslationPlan } from "../lib/translate";
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
  const state = readAiRunState(job.results);
  return { id: job.id, completed: job.completed, total: plan.jobs.length, complete: job.completed === plan.jobs.length,
    profileId: job.profileId, revision: job.revision, targetLang: job.targetLang,
    progressVersion: job.updatedAt, failed: state.failed.length, pending: pendingRuns(state, plan.jobs.length).length, halted: state.halted,
    ...renderTranslationPlan(plan, state.runs) };
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

app.post("/:id/step", zValidator("json", z.object({ completed: z.number().int().min(0).max(600), progressVersion: z.string().optional(), retryFailed: z.boolean().default(false) })), async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const id = c.req.param("id");
  const owner = and(eq(aiTranslationJobs.id, id), eq(aiTranslationJobs.userId, userId));
  const job = await db.select().from(aiTranslationJobs).where(owner).get();
  if (!job) return c.json({ success: false, error: "翻译进度不存在，请重新开始" }, 404);
  const plan = JSON.parse(job.plan) as TranslationPlan;
  const input = c.req.valid("json");
  if (job.completed === plan.jobs.length || job.completed !== input.completed || (input.progressVersion && input.progressVersion !== job.updatedAt)) {
    return c.json({ success: true, data: responseFor(job) });
  }
  const profile = await db.select().from(aiProfiles).where(and(eq(aiProfiles.id, job.profileId), eq(aiProfiles.userId, userId))).get();
  if (!profile || profile.revision !== job.revision) return c.json({ success: false, error: "配置已修改，请重新点击翻译以使用新配置" }, 409);
  const leaseToken = crypto.randomUUID();
  const acquired = await db.update(aiTranslationJobs).set({ leaseToken, leaseUntil: Date.now() + 90_000 })
    .where(and(owner, eq(aiTranslationJobs.completed, job.completed), eq(aiTranslationJobs.updatedAt, job.updatedAt), lt(aiTranslationJobs.leaseUntil, Date.now())))
    .returning({ id: aiTranslationJobs.id });
  if (!acquired.length) return c.json({ success: false, error: "这一段正在翻译，请稍后点击继续" }, 409);
  const deadline = new AbortController();
  const timeout = setTimeout(() => deadline.abort(), 55_000);
  let disconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  // Leave five seconds for saving before Workers ends the 30s disconnect grace period.
  const onDisconnect = () => { disconnectTimeout = setTimeout(() => deadline.abort(), 25_000); };
  c.req.raw.signal.addEventListener("abort", onDisconnect, { once: true });
  if (c.req.raw.signal.aborted) onDisconnect();
  const work = (async () => {
    try {
      const signal = deadline.signal;
      const endpoint = await validateProviderDestination(profile.baseUrl, signal);
      const key = await decryptApiKey(profile.encryptedKey, c.env.AI_KEYS_ENCRYPTION_SECRET, `${userId}:${profile.id}`);
      const state = readAiRunState(job.results);
      state.halted = undefined;
      if (input.retryFailed || !input.progressVersion) state.failed = [];
      const indices = pendingRuns(state, plan.jobs.length).slice(0, input.progressVersion ? state.concurrency : 1);
      let savedJob = job;
      let saves = Promise.resolve();
      const save = () => {
        saves = saves.then(async () => {
          const encoded = JSON.stringify(state);
          if (encoded.length > 900_000) throw new TranslationError("translation_size", "译文超出保存上限，请缩短文章后重试");
          const updated = await db.update(aiTranslationJobs).set({ results: encoded, completed: state.runs.filter(Boolean).length,
            updatedAt: new Date(Math.max(Date.now(), Date.parse(savedJob.updatedAt) + 1)).toISOString() })
            .where(and(owner, eq(aiTranslationJobs.leaseToken, leaseToken))).returning();
          if (!updated.length) throw new Error("翻译任务已变更");
          savedJob = updated[0];
        });
        return saves;
      };
      await translateAiBatch(state, indices, async index => {
        const context = [plan.jobs[0], plan.jobs[index - 1], plan.jobs[index + 1]]
          .filter(Boolean).map(html => load(html, {}, false).text()).join("\n").slice(0, 3000);
        return translateInlineHtml(plan.jobs[index], text => requestAiTranslation(profile, endpoint, key, text, job.targetLang, context, signal));
      }, save, signal, input.progressVersion ? 2 : 0);
      await saves;
      if (savedJob.completed === plan.jobs.length) {
        const article = await db.select({ title: articles.title }).from(articles).where(and(eq(articles.id, job.articleId), eq(articles.userId, userId))).get();
        await db.insert(translationHistory).values({ id: `ai-${id}`, userId, articleId: job.articleId, targetLang: job.targetLang,
          sourceLang: "auto", articleTitle: article?.title ?? "" }).onConflictDoNothing();
      }
      if (!input.progressVersion && state.failed.length) return c.json({ success: false, error: state.halted ?? "AI 翻译暂时失败，已完成段落已保存" }, 502);
      return c.json({ success: true, data: responseFor(savedJob) });
    } catch (error) {
      return c.json({ success: false, error: error instanceof TranslationError ? error.message : "AI 翻译暂时失败，已完成段落已保存，请稍后继续" }, 502);
    } finally {
      clearTimeout(timeout);
      clearTimeout(disconnectTimeout);
      c.req.raw.signal.removeEventListener("abort", onDisconnect);
      await db.update(aiTranslationJobs).set({ leaseToken: null, leaseUntil: 0 }).where(and(owner, eq(aiTranslationJobs.leaseToken, leaseToken)));
    }
  })();
  c.executionCtx.waitUntil(work.then(() => {}));
  return work;
});

export default app;
