import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { getDb } from "../db";
import refreshRoute from "../routes/refresh";
import type { CloudflareEnv } from "../types";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn(async (c, next) => {
    c.set("userId", "user-1");
    await next();
  }),
}));

describe("POST /api/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues an owned feed and returns 202 without fetching it inline", async () => {
    const mockDb = {
      select: vi.fn(() => mockDb),
      from: vi.fn(() => mockDb),
      where: vi.fn().mockResolvedValue([{ id: "feed-1", lastFetchedAt: null, lastErrorAt: null }]),
    };
    const sendBatch = vi.fn().mockResolvedValue({
      metadata: { metrics: { backlogCount: 1, backlogBytes: 50 } },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const queue = {
      metrics: vi.fn(),
      send: vi.fn(),
      sendBatch,
    } satisfies Queue;
    const app = new Hono<{ Bindings: CloudflareEnv }>();
    app.route("/api/refresh", refreshRoute);

    const response = await app.request(
      "http://collect.test/api/refresh",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-1",
        },
        body: JSON.stringify({ feedId: "feed-1" }),
      },
      {
        ASSETS: {} as Fetcher,
        BETTER_AUTH_SECRET: "test-secret",
        COLLECT_KV: {} as KVNamespace,
        COLLECT_R2: {} as R2Bucket,
        DB: {} as D1Database,
        FEED_SYNC_QUEUE: queue,
        FRONTEND_URL: "https://collect.jiahongw.com",
        RESEND_API_KEY: "test-resend-key",
        SESSION: {} as KVNamespace,
      } satisfies CloudflareEnv,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { queued: 1, feeds: [{ id: "feed-1", lastFetchedAt: null, lastErrorAt: null }] },
    });
    expect(sendBatch).toHaveBeenCalledOnce();
  });
});
