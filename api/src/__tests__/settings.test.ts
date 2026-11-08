import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { getDb } from "../db";
import settingsRoute from "../routes/settings";
import { userPreferences } from "../db/schema";
import type { CloudflareEnv } from "../types";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: { set: (key: string, value: string) => void; req: { header: (name: string) => string | undefined } }, next: () => Promise<void>) => {
    c.set("userId", c.req.header("test-user") || "owner"); await next();
  },
}));
const app = new Hono<{ Bindings: CloudflareEnv }>().route("/settings", settingsRoute);
const get = vi.fn();
const upsert = vi.fn();
const values = vi.fn(() => ({ onConflictDoUpdate: upsert }));
const select = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(undefined);
  upsert.mockResolvedValue(undefined);
  select.mockReturnValue({ from: () => ({ where: () => ({ get }) }) });
  vi.mocked(getDb).mockReturnValue({ select, insert: () => ({ values }) } as never);
});
const request = (body?: unknown, userId = "owner") => app.request("https://collect.test/settings" + (body ? "/translation" : ""), {
  method: body ? "PUT" : "GET", headers: { "content-type": "application/json", "test-user": userId },
  ...(body ? { body: JSON.stringify(body) } : {}),
}, { DB: {} } as CloudflareEnv);

it("defaults old accounts without a preference row to simplified Chinese", async () => {
  select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ id: "owner" }]) }) });
  const result = await (await request()).json() as { data: { translationTargetLanguage: string; emailDigest: unknown } };
  expect(result.data.translationTargetLanguage).toBe("zh-CN");
  expect(result.data.emailDigest).toEqual({ enabled: false, frequency: "daily", time: "09:00", day: 1 });
});

it("returns the stored account preference", async () => {
  select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ id: "owner" }]) }) });
  get.mockResolvedValue({ targetLanguage: "ja" });
  expect(await (await request()).json()).toMatchObject({ data: { translationTargetLanguage: "ja" } });
});

it("upserts only the authenticated account and updates only language and timestamp", async () => {
  expect((await request({ targetLanguage: "ja", userId: "victim" })).status).toBe(200);
  expect(values).toHaveBeenCalledWith({ userId: "owner", translationTargetLanguage: "ja" });
  expect(upsert).toHaveBeenCalledWith({ target: userPreferences.userId,
    set: { translationTargetLanguage: "ja", updatedAt: expect.any(String) } });
  expect((await request({ targetLanguage: "fr" }, "second")).status).toBe(200);
  expect(values).toHaveBeenLastCalledWith({ userId: "second", translationTargetLanguage: "fr" });
});

it("rejects unsupported languages before writing", async () => {
  expect((await request({ targetLanguage: "unsupported" })).status).toBe(400);
  expect(values).not.toHaveBeenCalled();
});
