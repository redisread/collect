import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { getDb } from "../db";
import translationsRoute from "../routes/translations";
import type { CloudflareEnv } from "../types";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: { set: (key: string, value: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "owner"); await next();
  },
}));

describe("browser translation history", () => {
  const app = new Hono<{ Bindings: CloudflareEnv }>().route("/translations", translationsRoute);
  const get = vi.fn();
  const values = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ title: "Article", feedName: "Feed" });
    vi.mocked(getDb).mockReturnValue({
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ get }) }) }) }),
      insert: () => ({ values }),
    } as never);
  });
  const request = () => app.request("https://collect.test/translations/history", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ articleId: "article", targetLang: "zh-CN", sourceLang: "en" }),
  }, { DB: {} } as CloudflareEnv);
  it("records metadata for an owned article", async () => {
    expect((await request()).status).toBe(201);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", articleId: "article", articleTitle: "Article" }));
  });
  it("rejects an article outside the authenticated ownership query", async () => {
    get.mockResolvedValue(undefined);
    expect((await request()).status).toBe(404);
    expect(values).not.toHaveBeenCalled();
  });
});
