import { Hono } from "hono";
import { eq, and, desc, asc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { readingStats, articles, feeds } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const statsRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

statsRoute.use("/*", authMiddleware);

// GET /api/stats/summary — 获取阅读统计概览
statsRoute.get("/summary", async (c) => {
  try {
    const userId = c.get("userId");
    const db = getDb(c.env.DB);

    // 获取用户所有文章统计
    const userFeeds = await db.select({ id: feeds.id }).from(feeds).where(eq(feeds.userId, userId));
    const userFeedIds = userFeeds.map((f) => f.id);

    // 总阅读数、总收藏数
    const [articleStats] = await db
      .select({
        totalArticles: sql<number>`count(*)`,
        totalRead: sql<number>`sum(case when ${articles.isRead} = 1 then 1 else 0 end)`,
        totalStarred: sql<number>`sum(case when ${articles.isStarred} = 1 then 1 else 0 end)`,
        totalReadLater: sql<number>`sum(case when ${articles.isReadLater} = 1 then 1 else 0 end)`,
      })
      .from(articles)
      .where(sql`${articles.feedId} IN (${sql.join(userFeedIds.map((id) => sql`${id}`), sql`, `)})`);

    // 本周阅读数
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weekAgoStr = oneWeekAgo.toISOString().split("T")[0];

    const [weekStats] = await db
      .select({
        totalRead: sql<number>`sum(${readingStats.articlesRead})`,
        totalTime: sql<number>`sum(${readingStats.readingTimeMinutes})`,
      })
      .from(readingStats)
      .where(and(eq(readingStats.userId, userId), gte(readingStats.date, weekAgoStr)));

    // 本月阅读数
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const monthAgoStr = oneMonthAgo.toISOString().split("T")[0];

    const [monthStats] = await db
      .select({
        totalRead: sql<number>`sum(${readingStats.articlesRead})`,
        totalTime: sql<number>`sum(${readingStats.readingTimeMinutes})`,
      })
      .from(readingStats)
      .where(and(eq(readingStats.userId, userId), gte(readingStats.date, monthAgoStr)));

    // 计算连续阅读天数
    const streakDays = await calculateReadingStreak(db, userId);

    // 总阅读时长（分钟）
    const [totalTimeStats] = await db
      .select({
        totalTime: sql<number>`sum(${readingStats.readingTimeMinutes})`,
      })
      .from(readingStats)
      .where(eq(readingStats.userId, userId));

    return c.json({
      success: true,
      data: {
        total: {
          articles: articleStats?.totalArticles ?? 0,
          read: articleStats?.totalRead ?? 0,
          starred: articleStats?.totalStarred ?? 0,
          readLater: articleStats?.totalReadLater ?? 0,
        },
        thisWeek: {
          articlesRead: weekStats?.totalRead ?? 0,
          readingTimeMinutes: weekStats?.totalTime ?? 0,
        },
        thisMonth: {
          articlesRead: monthStats?.totalRead ?? 0,
          readingTimeMinutes: monthStats?.totalTime ?? 0,
        },
        streakDays,
        totalReadingTimeMinutes: totalTimeStats?.totalTime ?? 0,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取统计失败" }, 500);
  }
});

// GET /api/stats/daily — 获取每日阅读数据
statsRoute.get("/daily", async (c) => {
  try {
    const userId = c.get("userId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    const db = getDb(c.env.DB);

    // 默认查询最近30天
    let start = startDate;
    let end = endDate;

    if (!start) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      start = thirtyDaysAgo.toISOString().split("T")[0];
    }

    if (!end) {
      end = new Date().toISOString().split("T")[0];
    }

    const stats = await db
      .select({
        date: readingStats.date,
        articlesRead: readingStats.articlesRead,
        articlesStarred: readingStats.articlesStarred,
        readingTimeMinutes: readingStats.readingTimeMinutes,
      })
      .from(readingStats)
      .where(
        and(
          eq(readingStats.userId, userId),
          gte(readingStats.date, start),
          lte(readingStats.date, end)
        )
      )
      .orderBy(asc(readingStats.date));

    return c.json({
      success: true,
      data: {
        startDate: start,
        endDate: end,
        stats,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取每日统计失败" }, 500);
  }
});

// GET /api/stats/heatmap — 获取阅读热力图数据（GitHub 风格，最近一年）
statsRoute.get("/heatmap", async (c) => {
  try {
    const userId = c.get("userId");
    const db = getDb(c.env.DB);

    // 计算最近一年的日期范围
    const endDate = new Date().toISOString().split("T")[0];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const startDate = oneYearAgo.toISOString().split("T")[0];

    const stats = await db
      .select({
        date: readingStats.date,
        articlesRead: readingStats.articlesRead,
        readingTimeMinutes: readingStats.readingTimeMinutes,
      })
      .from(readingStats)
      .where(
        and(
          eq(readingStats.userId, userId),
          gte(readingStats.date, startDate),
          lte(readingStats.date, endDate)
        )
      )
      .orderBy(asc(readingStats.date));

    // 计算等级（GitHub 风格热力图）
    const heatmapData = stats.map((stat) => {
      const count = stat.articlesRead ?? 0;
      let level = 0;
      if (count > 0) level = 1;
      if (count >= 3) level = 2;
      if (count >= 5) level = 3;
      if (count >= 10) level = 4;

      return {
        date: stat.date,
        count,
        readingTimeMinutes: stat.readingTimeMinutes ?? 0,
        level,
      };
    });

    return c.json({
      success: true,
      data: {
        startDate,
        endDate,
        heatmap: heatmapData,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取热力图失败" }, 500);
  }
});

// 计算连续阅读天数
async function calculateReadingStreak(
  db: ReturnType<typeof getDb>,
  userId: string
): Promise<number> {
  const stats = await db
    .select({
      date: readingStats.date,
      articlesRead: readingStats.articlesRead,
    })
    .from(readingStats)
    .where(and(eq(readingStats.userId, userId), gte(readingStats.articlesRead, 1)))
    .orderBy(desc(readingStats.date));

  if (stats.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // 检查今天或昨天是否有阅读记录
  const latestDate = new Date(stats[0].date);
  latestDate.setHours(0, 0, 0, 0);

  if (latestDate < yesterday) {
    return 0; // 已经超过一天没有阅读
  }

  // 计算连续天数
  let currentDate = latestDate;
  for (const stat of stats) {
    const statDate = new Date(stat.date);
    statDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((currentDate.getTime() - statDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0 || diffDays === 1) {
      streak++;
      currentDate = statDate;
    } else {
      break;
    }
  }

  return streak;
}

export default statsRoute;
