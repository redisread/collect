import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const translateRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

translateRoute.use("/*", authMiddleware);

// POST /api/translate — 翻译文本
translateRoute.post("/", async (c) => {
	try {
		const { text, sourceLang = "auto", targetLang = "zh-CN" } = await c.req.json();

		if (!text || typeof text !== "string") {
			return c.json({ success: false, error: "缺少 text 参数" }, 400);
		}

		// 使用 Google Translate 未公开 API
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
			return c.json({ success: false, error: "翻译服务请求失败" }, 500);
		}

		const data = (await response.json()) as [
			Array<Array<string>>, // 翻译结果数组
			null, // 可能包含词性信息
			Array<string>, // 检测到的语言
			// ... 其他字段
		];

		// 解析翻译结果
		// 格式: [[["翻译文本", "原文", ...], ...], ...]
		const translatedText = data[0]?.map((item) => item[0]).join("") ?? "";

		if (!translatedText) {
			return c.json({ success: false, error: "翻译结果为空" }, 500);
		}

		return c.json({
			success: true,
			data: {
				original: text,
				translated: translatedText,
				detectedLang: data[2]?.[0] ?? sourceLang,
			},
		});
	} catch (error) {
		console.error("翻译错误:", error);
		return c.json({ success: false, error: "翻译失败" }, 500);
	}
});

export default translateRoute;