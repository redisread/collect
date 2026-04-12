import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const translationsRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

translationsRoute.use("/*", authMiddleware);

// GET /api/translations/history — 获取翻译历史记录
translationsRoute.get("/history", async (c) => {
	const userId = c.get("userId");
	const rawDb = c.env.DB;

	const page = parseInt(c.req.query("page") || "1");
	const pageSize = parseInt(c.req.query("pageSize") || "20");
	const offset = (page - 1) * pageSize;

	// 查询总数
	const countResult = await rawDb.prepare(
		`SELECT COUNT(*) as total FROM translation_history WHERE user_id = ?`
	).bind(userId).all();
	const total = (countResult.results?.[0] as { total: number })?.total ?? 0;

	// 查询分页数据
	const itemsResult = await rawDb.prepare(
		`SELECT id, article_id, target_lang, source_lang, article_title, feed_name, translated_at
		 FROM translation_history
		 WHERE user_id = ?
		 ORDER BY translated_at DESC
		 LIMIT ? OFFSET ?`
	).bind(userId, pageSize, offset).all();

	const items = (itemsResult.results || []).map((row: Record<string, unknown>) => ({
		id: row.id as string,
		articleId: row.article_id as string,
		targetLang: row.target_lang as string,
		sourceLang: row.source_lang as string,
		articleTitle: row.article_title as string | null,
		feedName: row.feed_name as string | null,
		translatedAt: row.translated_at as string,
	}));

	return c.json({
		success: true,
		data: { items, total, page, pageSize },
	});
});

// DELETE /api/translations/history/:id — 删除翻译历史记录
translationsRoute.delete("/history/:id", async (c) => {
	const userId = c.get("userId");
	const historyId = c.req.param("id");
	const rawDb = c.env.DB;

	// 确保只能删除自己的记录
	const result = await rawDb.prepare(
		`DELETE FROM translation_history WHERE id = ? AND user_id = ?`
	).bind(historyId, userId).run();

	if (result.meta?.changes === 0) {
		return c.json({ success: false, error: "记录不存在或无权删除" }, 403);
	}

	return c.json({ success: true });
});

export default translationsRoute;
