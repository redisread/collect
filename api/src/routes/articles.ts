import { afterArticle, articleOrder, readArticleOrder } from "../lib/article-order";
import { automaticallyExtract } from "../lib/automatic-extraction";
import { articleExpiry } from "../lib/article-retention";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql, inArray, like, or, isNull } from "drizzle-orm";
import { getDb, type DB } from "../db";
import { articles, feeds, readingStats } from "../db/schema";
import type { Article } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { extractArticle, isValidUrl } from "../lib/extractor";
import type { CloudflareEnv } from "../types";

const articlesRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

articlesRoute.use("/*", authMiddleware);

/** 验证文章归属当前用户（通过 feedId → feeds.userId） */
async function getArticleForUser(db: DB, articleId: string, userId: string) {
  const [result] = await db
    .select({ article: articles, feedUserId: feeds.userId })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(and(eq(articles.id, articleId), eq(feeds.userId, userId)));
  return result?.article ?? null;
}

// 批量操作请求验证 Schema
const batchActionSchema = z.object({
  action: z.enum([
    "markAsRead",
    "markAsUnread",
    "markAsStarred",
    "markAsUnstarred",
    "delete",
  ]),
  articleIds: z.array(z.string()).min(1).max(1000),
});

// 批量操作 Feed 请求验证 Schema（标记某 Feed 下所有文章）
const batchFeedActionSchema = z.object({
  action: z.enum([
    "markAsRead",
    "markAsUnread",
    "markAsStarred",
    "markAsUnstarred",
    "delete",
  ]),
  feedId: z.string(),
});

// GET /api/articles — 获取当前用户的文章列表（支持分页和筛选）
articlesRoute.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const feedId = c.req.query("feedId");
    const folderId = c.req.query("folderId");
    const filter = c.req.query("filter"); // "starred" | "read_later" | "unread"
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "30", 10), 100);
    const db = getDb(c.env.DB);
    const requestedSort = c.req.query("sort");
    const sortOrder = requestedSort === "asc" || requestedSort === "desc"
      ? requestedSort : await readArticleOrder(db, userId);

    // Keep the feed scope in SQL so large libraries use a bounded number of D1 parameters.
    const feedConditions = [eq(feeds.userId, userId)];
    if (feedId) {
      feedConditions.push(eq(feeds.id, feedId));
    } else if (folderId || c.req.query("uncategorized") === "true") {
      feedConditions.push(folderId ? eq(feeds.folderId, folderId) : isNull(feeds.folderId));
      feedConditions.push(isNull(feeds.unsubscribedAt));
    }
    const userFeeds = db.select({ id: feeds.id }).from(feeds).where(and(...feedConditions));
    const conditions = [inArray(articles.feedId, userFeeds)];

    if (filter === "starred") conditions.push(eq(articles.isStarred, true));
    if (filter === "read_later") conditions.push(eq(articles.isReadLater, true));
    if (filter === "unread" || c.req.query("hideRead") === "true") {
      const includeId = c.req.query("includeId");
      conditions.push(includeId ? or(eq(articles.isRead, false), eq(articles.id, includeId))! : eq(articles.isRead, false));
    }

    const after = c.req.query("after");
    if (after) {
      let cursor;
      try {
        cursor = z.object({ id: z.string().min(1), publishedAt: z.string().nullable() }).parse(JSON.parse(after));
      } catch { return c.json({ success: false, error: "无效的文章游标" }, 400); }
      conditions.push(afterArticle(sortOrder, cursor));
    }
    const where = and(...conditions);
    const orderBy = articleOrder(sortOrder);
    const offset = after ? 0 : (page - 1) * pageSize;

    const [articleList, countResult] = await Promise.all([
      db
        .select({
          expiresAt: articleExpiry(),
          id: articles.id,
          feedId: articles.feedId,
          title: articles.title,
          url: articles.url,
          summary: articles.summary,
          author: articles.author,
          imageUrl: articles.imageUrl,
          publishedAt: articles.publishedAt,
          isRead: articles.isRead,
          isStarred: articles.isStarred,
          isReadLater: articles.isReadLater,
          createdAt: articles.createdAt,
        })
        .from(articles)
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(articles)
        .where(where),
    ]);

    return c.json({
      success: true,
      data: {
        articles: articleList,
        total: countResult[0]?.count ?? 0,
        page,
        pageSize,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取文章失败" }, 500);
  }
});

// GET /api/articles/:id — 获取文章详情
articlesRoute.get("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    let article = await getArticleForUser(db, id, userId);
    if (!article) return c.json({ success: false, error: "文章不存在" }, 404);

    article = await automaticallyExtract(db, article);

    // 自动标记为已读
    if (!article.isRead) {
      await db.update(articles).set({ isRead: true }).where(eq(articles.id, id));
      article.isRead = true;
    }

    const expiry = await db.select({ expiresAt: articleExpiry() }).from(articles).where(eq(articles.id, id)).get();
    return c.json({ success: true, data: { ...article, expiresAt: expiry?.expiresAt } });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取文章失败" }, 500);
  }
});

// PUT /api/articles/:id — 更新文章状态（已读/收藏/稍后读）
articlesRoute.put("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json() as {
      isRead?: boolean;
      isStarred?: boolean;
      isReadLater?: boolean;
    };

    const db = getDb(c.env.DB);
    const existing = await getArticleForUser(db, id, userId);
    if (!existing) return c.json({ success: false, error: "文章不存在" }, 404);

    const updates: Partial<typeof existing> = {};
    if (body.isRead !== undefined) updates.isRead = body.isRead;
    if (body.isStarred !== undefined) updates.isStarred = body.isStarred;
    if (body.isReadLater !== undefined) updates.isReadLater = body.isReadLater;

    const [updated] = await db
      .update(articles)
      .set(updates)
      .where(eq(articles.id, id))
      .returning();

    const expiry = await db.select({ expiresAt: articleExpiry() }).from(articles).where(eq(articles.id, id)).get();
    return c.json({ success: true, data: { ...updated, expiresAt: expiry?.expiresAt } });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "更新文章失败" }, 500);
  }
});

// POST /api/articles/:id/extract — 触发正文提取
articlesRoute.post("/:id/extract", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);

    // 验证文章归属
    const article = await getArticleForUser(db, id, userId);
    if (!article) {
      return c.json({ success: false, error: "文章不存在" }, 404);
    }

    // 验证 URL
    if (!isValidUrl(article.url)) {
      return c.json({ success: false, error: "无效的文章链接" }, 400);
    }

    // 如果已提取过，直接返回
    if (article.isExtracted && article.content) {
      return c.json({
        success: true,
        data: {
          id: article.id,
          title: article.title,
          content: article.content,
          excerpt: article.summary,
          author: article.author,
          image: article.imageUrl,
          isExtracted: true,
          extractedAt: article.extractedAt,
        },
        message: "文章已提取",
      });
    }

    // 执行提取
    const extracted = await extractArticle(article.url);

    // 更新数据库
    const [updated] = await db
      .update(articles)
      .set({
        content: extracted.content,
        summary: extracted.excerpt || article.summary,
        author: extracted.author || article.author,
        imageUrl: extracted.image || article.imageUrl,
        isExtracted: true,
        extractedAt: sql`(datetime('now'))`,
      })
      .where(eq(articles.id, id))
      .returning();

    return c.json({
      success: true,
      data: {
        id: updated.id,
        title: extracted.title || article.title,
        content: updated.content,
        excerpt: updated.summary,
        author: updated.author,
        image: updated.imageUrl,
        isExtracted: true,
        extractedAt: updated.extractedAt,
      },
    });
  } catch (err) {
    // 处理提取错误
    if (err && typeof err === "object" && "code" in err) {
      const extractorError = err as unknown as { message: string; code: string };
      return c.json(
        {
          success: false,
          error: extractorError.message,
          code: extractorError.code,
        },
        500
      );
    }
    return c.json(
      { success: false, error: err instanceof Error ? err.message : "提取文章失败" },
      500
    );
  }
});

// POST /api/articles/batch — 批量操作文章
articlesRoute.post(
  "/batch",
  zValidator("json", batchActionSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { success: false, error: "无效的请求参数: " + result.error.message },
        400
      );
    }
  }),
  async (c) => {
    try {
      const userId = c.get("userId");
      const { action, articleIds } = c.req.valid("json");
      const db = getDb(c.env.DB);

      // 验证这些文章是否属于当前用户
      const userArticles = await db
        .select({ articleId: articles.id })
        .from(articles)
        .innerJoin(feeds, eq(articles.feedId, feeds.id))
        .where(
          and(
            inArray(articles.id, articleIds),
            eq(feeds.userId, userId)
          )
        );

      const validArticleIds = userArticles.map((a) => a.articleId);

      if (validArticleIds.length === 0) {
        return c.json({ success: false, error: "没有有效的文章" }, 400);
      }

      // 执行批量操作
      let updatedCount = 0;

      switch (action) {
        case "markAsRead":
          await db
            .update(articles)
            .set({ isRead: true })
            .where(inArray(articles.id, validArticleIds));
          updatedCount = validArticleIds.length;
          break;

        case "markAsUnread":
          await db
            .update(articles)
            .set({ isRead: false })
            .where(inArray(articles.id, validArticleIds));
          updatedCount = validArticleIds.length;
          break;

        case "markAsStarred":
          await db
            .update(articles)
            .set({ isStarred: true })
            .where(inArray(articles.id, validArticleIds));
          updatedCount = validArticleIds.length;
          break;

        case "markAsUnstarred":
          await db
            .update(articles)
            .set({ isStarred: false })
            .where(inArray(articles.id, validArticleIds));
          updatedCount = validArticleIds.length;
          break;

        case "delete":
          await db
            .delete(articles)
            .where(inArray(articles.id, validArticleIds));
          updatedCount = validArticleIds.length;
          break;
      }

      return c.json({
        success: true,
        data: {
          action,
          requestedCount: articleIds.length,
          processedCount: validArticleIds.length,
          updatedCount,
        },
      });
    } catch (err) {
      return c.json(
        { success: false, error: err instanceof Error ? err.message : "批量操作失败" },
        500
      );
    }
  }
);

// PUT /api/articles/:id/progress — 更新阅读进度
articlesRoute.put("/:id/progress", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json() as {
      progress: number;
      position?: string;
      timeSpent?: number;
    };

    const db = getDb(c.env.DB);
    const article = await getArticleForUser(db, id, userId);
    if (!article) return c.json({ success: false, error: "文章不存在" }, 404);

    const progress = Math.max(0, Math.min(100, Math.round(body.progress)));
    const now = new Date().toISOString();
    const shouldMarkAsRead = progress >= 95 && !article.isRead;

    const updates: Partial<typeof article> = {
      readingProgress: progress,
      lastReadAt: now,
    };

    if (body.position !== undefined) updates.lastReadPosition = body.position;
    if (shouldMarkAsRead) updates.isRead = true;

    const [updated] = await db
      .update(articles)
      .set(updates)
      .where(eq(articles.id, id))
      .returning();

    if (body.timeSpent && body.timeSpent > 0) {
      await updateReadingStats(db, userId, now, body.timeSpent, shouldMarkAsRead);
    }

    return c.json({
      success: true,
      data: { ...updated, markedAsRead: shouldMarkAsRead },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "更新阅读进度失败" }, 500);
  }
});

// GET /api/articles/:id/progress — 获取阅读进度
articlesRoute.get("/:id/progress", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const article = await getArticleForUser(db, id, userId);
    if (!article) return c.json({ success: false, error: "文章不存在" }, 404);

    return c.json({
      success: true,
      data: {
        articleId: article.id,
        readingProgress: article.readingProgress ?? 0,
        lastReadPosition: article.lastReadPosition,
        lastReadAt: article.lastReadAt,
        estimatedReadTime: article.estimatedReadTime,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取阅读进度失败" }, 500);
  }
});

// GET /api/articles/reading — 获取正在阅读的文章列表
articlesRoute.get("/reading", async (c) => {
  try {
    const userId = c.get("userId");
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "30", 10), 100);

    const db = getDb(c.env.DB);
    const userFeeds = await db.select({ id: feeds.id }).from(feeds).where(eq(feeds.userId, userId));
    if (userFeeds.length === 0) {
      return c.json({ success: true, data: { articles: [], total: 0, page, pageSize } });
    }

    const userFeedIds = userFeeds.map((f) => f.id);
    const offset = (page - 1) * pageSize;

    const conditions = [
      sql`${articles.feedId} IN (${sql.join(userFeedIds.map((id) => sql`${id}`), sql`, `)})`,
      sql`(${articles.readingProgress} > 0 AND ${articles.readingProgress} < 100) OR (${articles.lastReadAt} IS NOT NULL)`,
    ];

    const where = and(...conditions);

    const [articleList, countResult] = await Promise.all([
      db
        .select({
          id: articles.id,
          feedId: articles.feedId,
          title: articles.title,
          url: articles.url,
          summary: articles.summary,
          author: articles.author,
          imageUrl: articles.imageUrl,
          publishedAt: articles.publishedAt,
          isRead: articles.isRead,
          isStarred: articles.isStarred,
          isReadLater: articles.isReadLater,
          readingProgress: articles.readingProgress,
          lastReadPosition: articles.lastReadPosition,
          lastReadAt: articles.lastReadAt,
          estimatedReadTime: articles.estimatedReadTime,
          createdAt: articles.createdAt,
        })
        .from(articles)
        .where(where)
        .orderBy(desc(articles.lastReadAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(articles).where(where),
    ]);

    return c.json({
      success: true,
      data: {
        articles: articleList,
        total: countResult[0]?.count ?? 0,
        page,
        pageSize,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取阅读中文章失败" }, 500);
  }
});

// GET /api/articles/search — 全文搜索
articlesRoute.get("/search", async (c) => {
  try {
    const userId = c.get("userId");
    const query = c.req.query("q");
    const feedId = c.req.query("feedId");
    const folderId = c.req.query("folderId");
    const filter = c.req.query("filter");
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "30", 10), 100);

    if (!query || query.trim().length === 0) {
      return c.json({ success: false, error: "搜索关键词不能为空" }, 400);
    }

    const db = getDb(c.env.DB);
    const searchKeyword = `%${query.trim()}%`;

    let userFeedIds: string[];
    if (feedId) {
      const [feed] = await db.select({ id: feeds.id }).from(feeds).where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)));
      if (!feed) return c.json({ success: true, data: { articles: [], total: 0, page, pageSize } });
      userFeedIds = [feed.id];
    } else if (folderId) {
      const folderFeeds = await db.select({ id: feeds.id }).from(feeds).where(and(eq(feeds.folderId, folderId), eq(feeds.userId, userId)));
      if (folderFeeds.length === 0) return c.json({ success: true, data: { articles: [], total: 0, page, pageSize } });
      userFeedIds = folderFeeds.map((f) => f.id);
    } else {
      const userFeeds = await db.select({ id: feeds.id }).from(feeds).where(eq(feeds.userId, userId));
      if (userFeeds.length === 0) return c.json({ success: true, data: { articles: [], total: 0, page, pageSize } });
      userFeedIds = userFeeds.map((f) => f.id);
    }

    const conditions = [
      sql`${articles.feedId} IN (${sql.join(userFeedIds.map((id) => sql`${id}`), sql`, `)})`,
      or(
        like(articles.title, searchKeyword),
        like(articles.content, searchKeyword),
        like(articles.summary, searchKeyword)
      ),
    ];

    if (filter === "unread" || c.req.query("hideRead") === "true") {
      const includeId = c.req.query("includeId");
      conditions.push(includeId ? or(eq(articles.isRead, false), eq(articles.id, includeId))! : eq(articles.isRead, false));
    }
    if (filter === "starred") conditions.push(eq(articles.isStarred, true));
    if (filter === "read_later") conditions.push(eq(articles.isReadLater, true));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [articleList, countResult] = await Promise.all([
      db
        .select({
          id: articles.id,
          feedId: articles.feedId,
          title: articles.title,
          url: articles.url,
          summary: articles.summary,
          content: articles.content,
          author: articles.author,
          imageUrl: articles.imageUrl,
          publishedAt: articles.publishedAt,
          isRead: articles.isRead,
          isStarred: articles.isStarred,
          isReadLater: articles.isReadLater,
          createdAt: articles.createdAt,
        })
        .from(articles)
        .where(where)
        .orderBy(desc(articles.publishedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(articles).where(where),
    ]);

    const highlightedArticles = articleList.map((article) => ({
      ...article,
      highlightedTitle: highlightText(article.title, query),
      highlightedSummary: article.summary ? highlightText(article.summary, query) : null,
      matchScore: calculateMatchScore(article as Article, query),
    }));

    highlightedArticles.sort((a, b) => b.matchScore - a.matchScore);

    return c.json({
      success: true,
      data: {
        articles: highlightedArticles,
        total: countResult[0]?.count ?? 0,
        page,
        pageSize,
        query,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "搜索失败" }, 500);
  }
});

// 辅助函数
async function updateReadingStats(
  db: DB,
  userId: string,
  date: string,
  timeSpent: number,
  markAsRead: boolean
) {
  try {
    const dateStr = date.split("T")[0];
    const [existing] = await db
      .select()
      .from(readingStats)
      .where(and(eq(readingStats.userId, userId), eq(readingStats.date, dateStr)));

    if (existing) {
      await db
        .update(readingStats)
        .set({
          readingTimeMinutes: (existing.readingTimeMinutes ?? 0) + timeSpent,
          articlesRead: markAsRead ? (existing.articlesRead ?? 0) + 1 : (existing.articlesRead ?? 0),
        })
        .where(and(eq(readingStats.userId, userId), eq(readingStats.date, dateStr)));
    } else {
      await db.insert(readingStats).values({
        userId,
        date: dateStr,
        readingTimeMinutes: timeSpent,
        articlesRead: markAsRead ? 1 : 0,
        articlesStarred: 0,
      });
    }
  } catch (err) {
    console.error("更新阅读统计失败:", err);
  }
}

function highlightText(text: string, keyword: string): string {
  if (!keyword) return text;
  const regex = new RegExp(`(${escapeRegExp(keyword)})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function calculateMatchScore(article: typeof articles.$inferSelect, keyword: string): number {
  const lowerKeyword = keyword.toLowerCase();
  let score = 0;
  if (article.title?.toLowerCase().includes(lowerKeyword)) {
    score += 10;
    if (article.title.toLowerCase().startsWith(lowerKeyword)) score += 5;
  }
  if (article.summary?.toLowerCase().includes(lowerKeyword)) score += 5;
  if (article.content?.toLowerCase().includes(lowerKeyword)) {
    score += 3;
    const matches = article.content.toLowerCase().split(lowerKeyword).length - 1;
    score += Math.min(matches, 5);
  }
  return score;
}

export default articlesRoute;
