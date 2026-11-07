import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";
import { SUPPORTED_LANG_CODES, DEFAULT_TARGET_LANG } from "../config/languages";
import { googleTranslate, translateHtml } from "../lib/translate";

const translateRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();
translateRoute.use("/*", authMiddleware);

translateRoute.post("/", async c => {
  const body = await c.req.json().catch(() => null);
  const { articleId, content, sourceLang = "auto", targetLang = DEFAULT_TARGET_LANG } = body ?? {};
  if (typeof articleId !== "string" || !articleId) return c.json({ success: false, error: "缺少 articleId 参数" }, 400);
  if (typeof content !== "string" || !content.trim()) return c.json({ success: false, error: "缺少文章内容" }, 400);
  if (content.length > 150_000) return c.json({ success: false, error: "文章过长，暂时无法翻译" }, 413);
  if (!SUPPORTED_LANG_CODES.has(targetLang) || (sourceLang !== "auto" && !SUPPORTED_LANG_CODES.has(sourceLang))) {
    return c.json({ success: false, error: "不支持的翻译语言" }, 400);
  }
  const userId = c.get("userId");
  const owned = await c.env.DB.prepare("SELECT id FROM articles WHERE id = ? AND user_id = ?").bind(articleId, userId).first();
  if (!owned) return c.json({ success: false, error: "文章不存在" }, 404);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const key = `translation:v3:${userId}:${articleId}:${sourceLang}:${targetLang}:${hash}`;
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
      await c.env.DB.prepare("INSERT INTO translation_history (user_id, article_id, target_lang, source_lang) VALUES (?, ?, ?, ?)")
        .bind(userId, articleId, targetLang, result.detectedLang).run();
    } catch { console.warn(JSON.stringify({ event: "translation_history_write_failed" })); }
    return c.json({ success: true, data: result });
  } catch {
    controller.abort();
    return c.json({ success: false, error: "Google 翻译暂时不可用或请求超时，请稍后重试" }, 502);
  } finally { clearTimeout(timeout); }
});

export default translateRoute;
