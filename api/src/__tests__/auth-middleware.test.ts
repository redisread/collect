import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { getDb } from "../db";
import { createAuth } from "../lib/auth";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../lib/auth", () => ({ createAuth: vi.fn() }));

describe("auth middleware", () => {
  const getSession = vi.fn();
  const env = { DB: {}, BETTER_AUTH_SECRET: "test-secret" } as CloudflareEnv;
  const createApp = () => {
    const app = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();
    app.use("*", authMiddleware);
    app.get("/protected", (c) => c.json({ userId: c.get("userId") }));
    app.get("/failure", () => { throw new Error("business failure"); });
    return app;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createAuth).mockReturnValue({ api: { getSession } } as never);
  });

  it("passes signed secure cookies to Better Auth and uses its verified user", async () => {
    getSession.mockResolvedValue({ user: { id: "verified-user" } });
    const cookie = "__Secure-better-auth.session_token=token.signature%3D";
    const response = await createApp().request("https://collect.jiahongw.com/protected", {
      headers: { cookie },
    }, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ userId: "verified-user" });
    expect(createAuth).toHaveBeenCalledWith(env.DB, env.BETTER_AUTH_SECRET, "https://collect.jiahongw.com");
    expect(getSession.mock.calls[0][0].headers.get("cookie")).toBe(cookie);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects missing, expired, or invalid cookie sessions", async () => {
    getSession.mockResolvedValue(null);
    const response = await createApp().request("https://collect.jiahongw.com/protected", {}, env);
    expect(response.status).toBe(401);
  });

  it("fails closed when cookie validation fails", async () => {
    getSession.mockRejectedValue(new Error("sensitive database detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await createApp().request("https://collect.jiahongw.com/protected", {}, env);
    expect(response.status).toBe(401);
    expect(log.mock.calls.flat().join()).not.toContain("sensitive database detail");
    log.mockRestore();
  });

  it.each([
    { remainingSeconds: -1, expectedStatus: 401 },
    { remainingSeconds: 0, expectedStatus: 401 },
    { remainingSeconds: 60, expectedStatus: 200 },
  ])("validates bearer expiry with $remainingSeconds seconds remaining", async ({ remainingSeconds, expectedStatus }) => {
    const now = new Date("2026-11-07T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const dialect = new SQLiteSyncDialect();
    const where = vi.fn();
    const query = {
      select: vi.fn(() => query),
      from: vi.fn(() => query),
      where,
      limit: vi.fn(async () => remainingSeconds > 0 ? [{ userId: "native-user" }] : []),
    };
    where.mockReturnValue(query);
    vi.mocked(getDb).mockReturnValue(query as never);
    try {
      const response = await createApp().request("https://collect.jiahongw.com/protected", {
        headers: { authorization: "Bearer native-token" },
      }, env);
      expect(response.status).toBe(expectedStatus);
      const condition = dialect.sqlToQuery(where.mock.calls[0][0]);
      expect(condition.sql).toBe('(\"session\".\"token\" = ? and \"session\".\"expires_at\" > ?)');
      expect(condition.params).toEqual(["native-token", now.getTime() / 1000]);
      expect(query.limit).toHaveBeenCalledWith(1);
      expect(getSession).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves downstream failures as server errors after authentication", async () => {
    getSession.mockResolvedValue({ user: { id: "verified-user" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await createApp().request("https://collect.jiahongw.com/failure", {}, env);
    expect(response.status).toBe(500);
    log.mockRestore();
  });
});
