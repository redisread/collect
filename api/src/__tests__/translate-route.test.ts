import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import translateRoute from "../routes/translate";
import type { CloudflareEnv } from "../types";
import { getDb } from "../db";

vi.mock("../db", () => ({ getDb: vi.fn() }));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: { set: (key: string, value: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "owner");
    await next();
  },
}));

describe("translation route cache and ownership", () => {
  const app = new Hono<{ Bindings: CloudflareEnv }>().route("/translate", translateRoute);
  const cache = new Map<string, string>();
  const first = vi.fn();
  const put = vi.fn(async (key: string, value: string) => { cache.set(key, value); });
  const env = {
    DB: { prepare: () => ({ bind: () => ({ first, run: vi.fn().mockResolvedValue({ success: true }) }) }) },
    COLLECT_KV: { get: async (key: string) => cache.has(key) ? JSON.parse(cache.get(key)!) : null, put },
  } as unknown as CloudflareEnv;
  const request = (content = "<p>Hello</p>") => app.request("https://collect.test/translate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ articleId: "article", content, targetLang: "zh-CN" }),
  }, env);

  beforeEach(() => {
    cache.clear();
    vi.clearAllMocks();
    first.mockResolvedValue({ id: "article" });
    vi.mocked(getDb).mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ get: first }) }) }),
      insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }),
    } as never);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json([[["你好"]], null, "en"]))));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("recovers omitted emphasis tags through the real route and caches the successful result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: URL) => {
      const text = url.searchParams.get("q")!;
      return Promise.resolve(Response.json([[[text.includes("<em>") ? "你好世界" : "译" + text]], null, "en"]));
    }));
    const content = "<p>Hello <em>world</em></p>";
    const result = await request(content);
    expect(result.status).toBe(200);
    const body = await result.json() as { data: { translatedHtml: string } };
    expect(body.data.translatedHtml).toContain("<em>");
    expect((await (await request(content)).json() as { fromCache: boolean }).fromCache).toBe(true);
  });

  it("checks ownership before contacting Google", async () => {
    first.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reuses identical content and invalidates changed article bodies", async () => {
    expect((await request()).status).toBe(200);
    expect((await (await request()).json() as { fromCache: boolean }).fromCache).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await request("<p>Updated</p>")).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("never caches failed translations as successful originals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response("denied", { status: 403 }))));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await request();
    expect(result.status).toBe(502);
    expect((await result.json() as { code: string }).code).toBe("google_http_error");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"upstreamStatus":403'));
    expect([...cache.keys()].some(key => key.startsWith("translation:"))).toBe(false);
  });

  it("distinguishes timeouts from upstream HTTP errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    const result = await request();
    expect((await result.json() as { code: string }).code).toBe("translation_timeout");
    expect([...cache.keys()].some(key => key.startsWith("translation:"))).toBe(false);
  });
});
