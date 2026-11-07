import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { articles, translationHistory } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";
import { SUPPORTED_LANG_CODES, DEFAULT_TARGET_LANG } from "../config/languages";
import { googleTranslate, translateHtml, TranslationError } from "../lib/translate";

const translateRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();
translateRoute.use("/*", authMiddleware);
const language = z.string().refine(value => SUPPORTED_LANG_CODES.has(value), "不支持的翻译语言");
const requestSchema = z.object({
  articleId: z.string().min(1, "缺少文章编号"),
  content: z.string().min(1, "缺少文章内容").max(150_000, "文章过长，暂时无法翻译").refine(value => !!value.trim(), "缺少文章内容"),
  sourceLang: z.union([z.literal("auto"), language]).default("auto"),
  targetLang: language.default(DEFAULT_TARGET_LANG),
});

translateRoute.post("/", async c => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  const { articleId, content, sourceLang, targetLang } = parsed.data;
  const userId = c.get("userId");
  const db = getDb(c.env.DB);
  const owned = await db.select({ id: articles.id, title: articles.title }).from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId))).get();
  if (!owned) return c.json({ success: false, error: "文章不存在" }, 404);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const key = `translation:v4:${userId}:${articleId}:${sourceLang}:${targetLang}:${hash}`;
  const cached = await c.env.COLLECT_KV.get(key, "json");
  if (cached) return c.json({ success: true, data: cached, fromCache: true });
  const rateKey = `rate:translate:${userId}`;
  const now = Date.now();
  const rate = await c.env.COLLECT_KV.get(rateKey, "json") as { count: number; windowStart: number } | null;
  const count = rate && now - rate.windowStart < 60_000 ? rate.count : 0;
  if (count >= 10) return c.json({ success: false, error: "翻译请求过于频繁，请稍后再试" }, 429);
  await c.env.COLLECT_KV.put(rateKey, JSON.stringify({ count: count + 1, windowStart: count ? rate!.windowStart : now }), { expirationTtl: 120 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const translated = await translateHtml(content, targetLang, text => googleTranslate(text, targetLang, sourceLang, controller.signal));
    const result = { ...translated, targetLang, timestamp: Date.now() };
    await c.env.COLLECT_KV.put(key, JSON.stringify(result), { expirationTtl: 604800 });
    try {
      await db.insert(translationHistory).values({
        id: crypto.randomUUID(), userId, articleId, targetLang,
        sourceLang: result.detectedLang, articleTitle: owned.title,
      });
    } catch { console.warn(JSON.stringify({ event: "translation_history_write_failed" })); }
    return c.json({ success: true, data: result });
  } catch (error) {
    const timedOut = controller.signal.aborted || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name));
    const code = timedOut ? "translation_timeout" : error instanceof TranslationError ? error.code : "translation_failed";
    const message = timedOut ? "翻译请求超时，请稍后重试" :
      error instanceof TranslationError ? error.message : "文章翻译失败，请重试";
    console.warn(JSON.stringify({
      event: "translation_failed", code, durationMs: Date.now() - now,
      upstreamStatus: error instanceof TranslationError ? error.upstreamStatus : undefined,
    }));
    controller.abort();
    return c.json({ success: false, error: message, code }, 502);
  } finally { clearTimeout(timeout); }
});

export default translateRoute;
