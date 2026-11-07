import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { feeds } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { enqueueFeedSyncMessages } from "../queue/feed-sync";
import type { CloudflareEnv } from "../types";

const refreshRoute = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { requestId: string; userId: string };
}>();

refreshRoute.use("/*", authMiddleware);

// POST /api/refresh — 将当前用户的 RSS 刷新任务提交到 Cloudflare Queues
refreshRoute.post("/", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({})) as { feedId?: string };
    const db = getDb(c.env.DB);

    let feedList: Array<{ id: string }>;
    if (body.feedId) {
      // 刷新单个订阅源（验证归属）
      feedList = await db
        .select({ id: feeds.id })
        .from(feeds)
        .where(and(eq(feeds.id, body.feedId), eq(feeds.userId, userId)));
      if (feedList.length === 0) return c.json({ success: false, error: "订阅源不存在" }, 404);
    } else {
      // 刷新当前用户所有订阅源
      feedList = await db
        .select({ id: feeds.id })
        .from(feeds)
        .where(eq(feeds.userId, userId))
        .orderBy(asc(feeds.sortOrder));
    }

    const requestId = c.get("requestId") ?? crypto.randomUUID();
    const queued = await enqueueFeedSyncMessages(
      c.env.FEED_SYNC_QUEUE,
      feedList.map((feed) => feed.id),
      requestId,
      "manual",
    );

    return c.json({ success: true, data: { queued } }, 202);
  } catch {
    return c.json({ success: false, error: "刷新任务提交失败" }, 500);
  }
});

export default refreshRoute;
