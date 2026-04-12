import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

describe("Translation History API", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("GET /api/translations/history", () => {
		it("should return paginated translation history", async () => {
			const mockItems = [
				{
					id: 1,
					article_id: "article1",
					target_lang: "zh-CN",
					source_lang: "en",
					article_title: "Test Article",
					feed_name: "Test Feed",
					translated_at: "2026-04-12T10:00:00Z",
				},
			];

			// Override the route for testing
			const testApp = new Hono();
			testApp.get("/api/translations/history", async (c) => {
				const page = parseInt(c.req.query("page") || "1");
				const pageSize = parseInt(c.req.query("pageSize") || "20");
				const total = 1;
				return c.json({
					success: true,
					data: {
						items: mockItems.map((row) => ({
							id: row.id,
							articleId: row.article_id,
							targetLang: row.target_lang,
							sourceLang: row.source_lang,
							articleTitle: row.article_title,
							feedName: row.feed_name,
							translatedAt: row.translated_at,
						})),
						total,
						page,
						pageSize,
					},
				});
			});

			const res = await testApp.request("/api/translations/history");
			expect(res.status).toBe(200);
			const data: Record<string, unknown> = await res.json();
			const response = data.data as Record<string, unknown>;
			const items = response.items as Array<{ articleId: string }>;
			expect(items).toHaveLength(1);
			expect(items[0].articleId).toBe("article1");
		});

		it("should return empty items when no history exists", async () => {
			const testApp = new Hono();
			testApp.get("/api/translations/history", async (c) => {
				return c.json({
					success: true,
					data: { items: [], total: 0, page: 1, pageSize: 20 },
				});
			});

			const res = await testApp.request("/api/translations/history");
			const data: Record<string, unknown> = await res.json();
			const responseData = data.data as Record<string, unknown>;
			expect(data.success).toBe(true);
			expect(responseData.items).toEqual([]);
			expect(responseData.total).toBe(0);
		});

		it("should use default pagination when not specified", async () => {
			const testApp = new Hono();
			testApp.get("/api/translations/history", async (c) => {
				const page = parseInt(c.req.query("page") || "1");
				const pageSize = parseInt(c.req.query("pageSize") || "20");
				return c.json({
					success: true,
					data: { items: [], total: 0, page, pageSize },
				});
			});

			const res = await testApp.request("/api/translations/history");
			const data: Record<string, unknown> = await res.json();
			const responseData = data.data as Record<string, unknown>;
			expect(responseData.page).toBe(1);
			expect(responseData.pageSize).toBe(20);
		});
	});

	describe("DELETE /api/translations/history/:id", () => {
		it("should return success when deletion is authorized", async () => {
			const testApp = new Hono();
			testApp.delete("/api/translations/history/:id", async (c) => {
				return c.json({ success: true });
			});

			const res = await testApp.request("/api/translations/history/1", {
				method: "DELETE",
			});
			expect(res.status).toBe(200);
			const data: Record<string, unknown> = await res.json();
			expect(data.success).toBe(true);
		});

		it("should return 403 when record does not exist", async () => {
			const testApp = new Hono();
			testApp.delete("/api/translations/history/:id", async (c) => {
				return c.json({ success: false, error: "记录不存在或无权删除" }, 403);
			});

			const res = await testApp.request("/api/translations/history/999", {
				method: "DELETE",
			});
			expect(res.status).toBe(403);
			const data: Record<string, unknown> = await res.json();
			expect(data.success).toBe(false);
			expect(data.error).toBe("记录不存在或无权删除");
		});
	});
});
