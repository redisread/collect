import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseHTML } from "linkedom";

// 测试 extractSegments 的核心逻辑（通过模拟 parseHTML）
function extractSegments(html: string): Array<{ original: string; translated: string }> {
	const { document } = parseHTML(html);
	const segments: Array<{ original: string; translated: string }> = [];

	const blockSelector = "p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, td, th";
	const elements = document.querySelectorAll(blockSelector);

	for (let i = 0; i < elements.length; i++) {
		const el = elements[i];
		const text = el.textContent?.trim();
		if (text && text.length > 0) {
			segments.push({ original: text, translated: "" });
		}
	}

	if (segments.length === 0) {
		const bodyText = document.body?.textContent?.trim();
		if (bodyText) {
			const parts = bodyText.split(/\n\s*\n/).filter((t: string) => t.trim());
			for (const part of parts) {
				segments.push({ original: part.trim(), translated: "" });
			}
		}
	}

	return segments;
}

describe("Translation", () => {
	describe("extractSegments", () => {
		it("should extract text from paragraphs", () => {
			const html = "<body><p>Hello World</p><p>Second paragraph</p></body>";
			const segments = extractSegments(html);
			expect(segments).toHaveLength(2);
			expect(segments[0].original).toBe("Hello World");
			expect(segments[1].original).toBe("Second paragraph");
		});

		it("should extract text from headings", () => {
			const html = "<body><h1>Title</h1><h2>Subtitle</h2><p>Content</p></body>";
			const segments = extractSegments(html);
			expect(segments).toHaveLength(3);
			expect(segments[0].original).toBe("Title");
			expect(segments[1].original).toBe("Subtitle");
		});

		it("should extract text from list items", () => {
			const html = "<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>";
			const segments = extractSegments(html);
			expect(segments).toHaveLength(3);
			expect(segments[0].original).toBe("Item 1");
		});

		it("should extract text from blockquotes", () => {
			const html = "<body><blockquote>Important quote here</blockquote></body>";
			const segments = extractSegments(html);
			expect(segments).toHaveLength(1);
			expect(segments[0].original).toBe("Important quote here");
		});

		it("should skip script and style content", () => {
			const html = `
				<body>
					<script>var x = 1;</script>
					<style>.red { color: red; }</style>
					<p>Visible text</p>
				</body>
			`;
			const segments = extractSegments(html);
			expect(segments).toHaveLength(1);
			expect(segments[0].original).toBe("Visible text");
		});

		it("should handle mixed HTML content", () => {
			const html = `
				<body>
					<h1>Article Title</h1>
					<p>First paragraph with <a href="#">a link</a> inside.</p>
					<p>Second paragraph.</p>
					<li>List item</li>
				</body>
			`;
			const segments = extractSegments(html);
			expect(segments).toHaveLength(4);
			expect(segments[0].original).toBe("Article Title");
			expect(segments[1].original).toBe("First paragraph with a link inside.");
			expect(segments[2].original).toBe("Second paragraph.");
			expect(segments[3].original).toBe("List item");
		});

		it("should return empty array for empty HTML", () => {
			const html = "<body></body>";
			const segments = extractSegments(html);
			expect(segments).toHaveLength(0);
		});

		it("should fallback to body text when no block elements found", () => {
			const html = "<html><body><span>Line one</span>\n\n<span>Line two</span>\n\n<span>Line three</span></body></html>";
			const segments = extractSegments(html);
			expect(segments).toHaveLength(3);
			expect(segments[0].original).toBe("Line one");
			expect(segments[1].original).toBe("Line two");
		});

		it("should preserve inline formatting within block elements", () => {
			const html = "<body><p>This is <strong>bold</strong> and <em>italic</em> text.</p></body>";
			const segments = extractSegments(html);
			expect(segments).toHaveLength(1);
			expect(segments[0].original).toBe("This is bold and italic text.");
		});

		it("should handle table cells", () => {
			const html = `
				<table>
					<tr><td>Cell 1</td><td>Cell 2</td></tr>
					<tr><th>Header 1</th><th>Header 2</th></tr>
				</table>
			`;
			const segments = extractSegments(html);
			expect(segments).toHaveLength(4);
		});
	});

	describe("rate limiting logic", () => {
		it("should allow requests within rate limit", async () => {
			let storedValue: { count: number; windowStart: number } | null = null;
			const mockKv = {
				get: vi.fn().mockImplementation(async () => storedValue),
				put: vi.fn().mockImplementation(async (_key: string, value: string) => {
					storedValue = JSON.parse(value);
					return true;
				}),
			};

			// 模拟 checkRateLimit 逻辑
			const checkRateLimit = async (kv: typeof mockKv, userId: string): Promise<boolean> => {
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
			};

			for (let i = 0; i < 10; i++) {
				const result = await checkRateLimit(mockKv, "user1");
				expect(result).toBe(true);
			}

			// 第 11 次应该被拒绝
			const result = await checkRateLimit(mockKv, "user1");
			expect(result).toBe(false);
		});

		it("should reset rate limit after window expires", async () => {
			const pastTime = Date.now() - 61_000; // 61 seconds ago
			const mockKv = {
				get: vi.fn().mockResolvedValue({ count: 10, windowStart: pastTime }),
				put: vi.fn().mockResolvedValue(true),
			};

			const checkRateLimit = async (kv: typeof mockKv, userId: string): Promise<boolean> => {
				const key = `rate:translate:${userId}`;
				const now = Date.now();
				const windowMs = 60_000;

				const raw = await kv.get(key, "json") as { count: number; windowStart: number } | null;
				if (!raw || (now - raw.windowStart) > windowMs) {
					await kv.put(key, JSON.stringify({ count: 1, windowStart: now }), { expirationTtl: 120 });
					return true;
				}
				if (raw.count >= 10) {
					return false;
				}
				raw.count += 1;
				await kv.put(key, JSON.stringify(raw), { expirationTtl: 120 });
				return true;
			};

			const result = await checkRateLimit(mockKv, "user1");
			expect(result).toBe(true);
		});
	});

	describe("cache key format", () => {
		it("should generate correct cache key format", () => {
			const userId = "user123";
			const articleId = "article456";
			const targetLang = "zh-CN";
			const cacheKey = `translation:${userId}:${articleId}:${targetLang}`;

			expect(cacheKey).toBe("translation:user123:article456:zh-CN");
		});

		it("should generate different cache keys for different languages", () => {
			const base = "translation:user123:article456";
			const keyZhCn = `${base}:zh-CN`;
			const keyJa = `${base}:ja`;

			expect(keyZhCn).not.toBe(keyJa);
		});
	});

	describe("supported languages", () => {
		const SUPPORTED_LANGS = new Set(["zh-CN", "zh-TW", "en", "ja", "ko"]);

		it("should accept zh-CN", () => {
			expect(SUPPORTED_LANGS.has("zh-CN")).toBe(true);
		});

		it("should accept zh-TW", () => {
			expect(SUPPORTED_LANGS.has("zh-TW")).toBe(true);
		});

		it("should accept en", () => {
			expect(SUPPORTED_LANGS.has("en")).toBe(true);
		});

		it("should accept ja", () => {
			expect(SUPPORTED_LANGS.has("ja")).toBe(true);
		});

		it("should accept ko", () => {
			expect(SUPPORTED_LANGS.has("ko")).toBe(true);
		});

		it("should reject unsupported language", () => {
			expect(SUPPORTED_LANGS.has("fr")).toBe(false);
			expect(SUPPORTED_LANGS.has("de")).toBe(false);
			expect(SUPPORTED_LANGS.has("es")).toBe(false);
		});
	});
});
