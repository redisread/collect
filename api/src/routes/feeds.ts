import { HTTPException } from "hono/http-exception";
import { unsubscribeFeeds, moveSubscriptions } from "../services/SubscriptionManagement";
import { saveSubscription } from "../services/SubscriptionCreation";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { feeds, articles, folders } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { RSSFetcher } from "../lib/rss/fetcher";
import { discoverFeedUrl } from "../lib/rss/parser";
import { normalizeFeedUrl } from "../lib/rss/public-fetch";
import type { CloudflareEnv } from "../types";

const feedsRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

feedsRoute.use("/*", authMiddleware);

// GET /api/feeds — 获取当前用户的所有订阅源（含未读数）
feedsRoute.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const folderId = c.req.query("folderId");
    const db = getDb(c.env.DB);

    const feedList = await db
      .select()
      .from(feeds)
      .where(
        folderId
          ? and(eq(feeds.userId, userId), eq(feeds.folderId, folderId))
          : eq(feeds.userId, userId)
      )
      .orderBy(asc(feeds.sortOrder));

    // 批量获取未读数
    const unreadCounts = await db
      .select({
        feedId: articles.feedId,
        count: sql<number>`sum(case when is_read = 0 then 1 else 0 end)`,
        starredCount: sql<number>`sum(case when is_starred = 1 then 1 else 0 end)`,
        readLaterCount: sql<number>`sum(case when is_read_later = 1 then 1 else 0 end)`,
      })
      .from(articles)
      .where(eq(articles.userId, userId))
      .groupBy(articles.feedId);

    const unreadMap = new Map(unreadCounts.map((r) => [r.feedId, r]));

    const result = feedList.map((feed) => ({
      ...feed,
      unreadCount: unreadMap.get(feed.id)?.count ?? 0,
      starredCount: unreadMap.get(feed.id)?.starredCount ?? 0,
      readLaterCount: unreadMap.get(feed.id)?.readLaterCount ?? 0,
    }));

    return c.json({ success: true, data: result });
  } catch (err) {
      if (err instanceof HTTPException) throw err;
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取订阅源失败" }, 500);
  }
});

const batchInput = z.object({ids:z.array(z.string().min(1)).min(1).max(50).refine(ids => new Set(ids).size === ids.length)});
feedsRoute.post("/batch/move", zValidator("json", batchInput.extend({folderId:z.string().min(1).nullable()})), async c => {
  const {ids,folderId}=c.req.valid("json");
  return c.json({success:true,data:{feeds:await moveSubscriptions(getDb(c.env.DB),c.get("userId"),ids,folderId)}});
});
feedsRoute.post("/batch/unsubscribe", zValidator("json", batchInput), async c => {
  return c.json({success:true,data:await unsubscribeFeeds(getDb(c.env.DB),c.get("userId"),c.req.valid("json").ids)});
});

// POST /api/feeds — 为当前用户添加订阅源
feedsRoute.post(
  "/",
  zValidator("json", z.object({
    url: z.string().min(1, "订阅源 URL 不能为空"),
    folderId: z.string().min(1).nullable().optional(),
  })),
  async (c) => {
    try {
      const userId = c.get("userId");
      const body = c.req.valid("json");
      const db = getDb(c.env.DB);

      if (body.folderId) {
        const folder = await db.select({id:folders.id}).from(folders).where(and(eq(folders.id,body.folderId),eq(folders.userId,userId))).get();
        if (!folder) return c.json({success:false,error:"目标文件夹不存在"},400);
      }
      let feedUrl = normalizeFeedUrl(body.url.trim());
      const direct = await db.select().from(feeds).where(and(eq(feeds.feedUrl,feedUrl),eq(feeds.userId,userId))).get();
      if (direct && !direct.unsubscribedAt) return c.json({success:false,error:"该订阅源已存在"},409);

      // 尝试自动发现 Feed URL
      const discovered = await discoverFeedUrl(feedUrl);
      if (discovered) feedUrl = discovered;
      feedUrl = normalizeFeedUrl(feedUrl);

      // 检查当前用户是否已订阅该 Feed
      const [existing] = await db
        .select()
        .from(feeds)
        .where(and(eq(feeds.feedUrl, feedUrl), eq(feeds.userId, userId)));
      if (existing && !existing.unsubscribedAt) return c.json({ success: false, error: "该订阅源已存在" }, 409);
      const parsed = await new RSSFetcher().fetch(feedUrl);

      const feed = await saveSubscription(db,userId,parsed,{feedUrl,folderId:body.folderId,existing});
      return c.json({success:true,data:feed},201);
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      return c.json({ success: false, error: err instanceof Error ? err.message : "添加订阅源失败" }, 500);
    }
  }
);

// GET /api/feeds/:id — 获取单个订阅源
feedsRoute.get("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const [feed] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));
    if (!feed) return c.json({ success: false, error: "订阅源不存在" }, 404);
    return c.json({ success: true, data: feed });
  } catch (err) {
      if (err instanceof HTTPException) throw err;
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取订阅源失败" }, 500);
  }
});

// PUT /api/feeds/:id — 更新订阅源
feedsRoute.put("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json() as {
      title?: string;
      folderId?: string | null;
      sortOrder?: number;
      autoExtract?: boolean;
    };

    const db = getDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));
    if (!existing) return c.json({ success: false, error: "订阅源不存在" }, 404);

    const updates: Partial<typeof existing> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.autoExtract !== undefined) {
      if (typeof body.autoExtract !== "boolean") return c.json({ success: false, error: "无效的全文提取设置" }, 400);
      updates.autoExtract = body.autoExtract;
    }
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200) return c.json({success:false,error:"名称需为 1–200 个字符"},400);
      updates.title = body.title.trim();
    }
    if ("folderId" in body) {
      if (body.folderId !== null && (typeof body.folderId !== "string" || !body.folderId)) {
        return c.json({ success: false, error: "无效的文件夹" }, 400);
      }
      if (body.folderId) {
        const [folder] = await db.select({ id: folders.id }).from(folders)
          .where(and(eq(folders.id, body.folderId), eq(folders.userId, userId)));
        if (!folder) return c.json({ success: false, error: "目标文件夹不存在" }, 404);
      }
      updates.folderId = body.folderId;
    }
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    const [updated] = await db
      .update(feeds)
      .set(updates)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (err) {
      if (err instanceof HTTPException) throw err;
    return c.json({ success: false, error: err instanceof Error ? err.message : "更新订阅源失败" }, 500);
  }
});

// DELETE /api/feeds/:id — 删除订阅源
feedsRoute.delete("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));
    if (!existing) return c.json({ success: false, error: "订阅源不存在" }, 404);

    const result = await unsubscribeFeeds(db,userId,[id]);
    return c.json({ success: true, data: { id, ...result } });
  } catch (err) {
      if (err instanceof HTTPException) throw err;
    return c.json({ success: false, error: err instanceof Error ? err.message : "删除订阅源失败" }, 500);
  }
});

// POST /api/feeds/:id/mark-all-read — 标记某订阅源下所有文章为已读
feedsRoute.post("/:id/mark-all-read", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);

    // 验证订阅源是否属于当前用户
    const [existing] = await db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, id), eq(feeds.userId, userId)));
    if (!existing) return c.json({ success: false, error: "订阅源不存在" }, 404);

    // 标记该订阅源下所有文章为已读
    await db
      .update(articles)
      .set({ isRead: true })
      .where(and(eq(articles.feedId, id), eq(articles.userId, userId), eq(articles.isRead, false)));

    return c.json({
      success: true,
      data: {
        feedId: id,
      },
    });
  } catch (err) {
      if (err instanceof HTTPException) throw err;
    return c.json({ success: false, error: err instanceof Error ? err.message : "标记已读失败" }, 500);
  }
});

export default feedsRoute;
