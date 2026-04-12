import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";
import { parseHTML } from "linkedom";

const translateRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

translateRoute.use("/*", authMiddleware);

// 支持的目标语言
const SUPPORTED_LANGS = new Set(["zh-CN", "zh-TW", "en", "ja", "ko"]);

interface TranslationSegment {
	original: string;
	translated: string;
}

// 速率限制：per-user 10 次/60s
async function checkRateLimit(kv: KVNamespace, userId: string): Promise<boolean> {
	const key = `rate:translate:${userId}`;
	const now = Date.now();
	const windowMs = 60_000;
	const maxRequests = 10;

	const raw = await kv.get(key, "json") as { count: number; windowStart: number } | null;
	if (!raw || (now - raw.windowStart) > windowMs) {
		await kv.put(key, JSON.stringify({ count: 1, windowStart: now }), { expirationTtl: 120 });
		return true;
	}
	if (raw.count >= maxRequests) {
		return false;
	}
	raw.count += 1;
	await kv.put(key, JSON.stringify(raw), { expirationTtl: 120 });
	return true;
}

// 从 HTML 中提取可翻译的文本段
function extractSegments(html: string): TranslationSegment[] {
	const { document } = parseHTML(html);
	const segments: TranslationSegment[] = [];

	// 使用 querySelectorAll 获取所有块级元素
	const blockSelector = "p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, td, th";
	const elements = document.querySelectorAll(blockSelector);

	for (let i = 0; i < elements.length; i++) {
		const el = elements[i];
		const text = el.textContent?.trim();
		if (text && text.length > 0) {
			segments.push({ original: text, translated: "" });
		}
	}

	// 如果没有找到块级元素，尝试获取 body 的文本
	if (segments.length === 0) {
		const bodyText = document.body?.textContent?.trim();
		if (bodyText) {
			// 按空行分段
			const parts = bodyText.split(/\n\s*\n/).filter((t: string) => t.trim());
			for (const part of parts) {
				segments.push({ original: part.trim(), translated: "" });
			}
		}
	}

	return segments;
}

// 调用 Google Translate 翻译一段文本
async function translateText(text: string, targetLang: string, sourceLang: string): Promise<string> {
	const url = new URL("https://translate.googleapis.com/translate_a/single");
	url.searchParams.set("client", "dict-chrome-ex");
	url.searchParams.set("sl", sourceLang);
	url.searchParams.set("tl", targetLang);
	url.searchParams.set("dt", "t");
	url.searchParams.set("q", text);

	const response = await fetch(url.toString(), {
		headers: {
			"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		},
	});

	if (!response.ok) {
		throw new Error(`Google Translate API error: ${response.status}`);
	}

	const data = (await response.json()) as Array<Array<Array<string>>> | null;
	return data?.[0]?.map((item) => item[0]).join("") ?? "";
}

// POST /api/translate — 分段翻译文章
translateRoute.post("/", async (c) => {
	const userId = c.get("userId");
	const kv = c.env.COLLECT_KV;

	// 1. 解析请求
	const body = await c.req.json() as Record<string, unknown>;
	const {
		articleId,
		content,
		sourceLang = "auto",
		targetLang = "zh-CN",
	} = body as {
		articleId?: string;
		content?: string;
		sourceLang?: string;
		targetLang?: string;
	};

	if (!articleId || typeof articleId !== "string") {
		return c.json({ success: false, error: "缺少 articleId 参数" }, 400);
	}
	if (!content || typeof content !== "string" || content.trim().length === 0) {
		return c.json({ success: false, error: "缺少文章内容" }, 400);
	}
	if (typeof targetLang !== "string" || !SUPPORTED_LANGS.has(targetLang)) {
		return c.json({ success: false, error: "不支持的目标语言" }, 400);
	}

	// 2. 检查 KV 缓存
	const cacheKey = `translation:${userId}:${articleId}:${targetLang}`;
	const cached = await kv.get(cacheKey, "json") as {
		segments: TranslationSegment[];
		targetLang: string;
		detectedLang: string;
		timestamp: number;
	} | null;

	if (cached && (Date.now() - cached.timestamp) < 7 * 24 * 60 * 60 * 1000) {
		return c.json({ success: true, data: cached, fromCache: true });
	}

	// 3. 速率限制
	const allowed = await checkRateLimit(kv, userId);
	if (!allowed) {
		return c.json({ success: false, error: "翻译请求过于频繁，请稍后再试" }, 429);
	}

	// 4. 提取文本段
	const segments = extractSegments(content);
	if (segments.length === 0) {
		return c.json({ success: false, error: "未找到可翻译的文本" }, 400);
	}

	// 5. 逐段翻译
	let detectedLang = sourceLang as string;
	for (let i = 0; i < segments.length; i++) {
		try {
			const translated = await translateText(segments[i].original, targetLang, sourceLang as string);
			segments[i].translated = translated;
			if (!detectedLang || detectedLang === "auto") {
				detectedLang = targetLang;
			}
		} catch (error) {
			console.error(`翻译第 ${i + 1} 段失败:`, error);
			segments[i].translated = segments[i].original; // 失败时保留原文
		}
	}

	// 6. 存储到 KV
	const result = {
		segments,
		targetLang,
		detectedLang,
		timestamp: Date.now(),
	};
	await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 604800 }); // 7 天

	return c.json({ success: true, data: result });
});

export default translateRoute;
