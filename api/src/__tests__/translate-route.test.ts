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
  afterEach(() => vi.unstubAllGlobals());

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
    expect((await request()).status).toBe(502);
    expect([...cache.keys()].some(key => key.startsWith("translation:"))).toBe(false);
  });
});
