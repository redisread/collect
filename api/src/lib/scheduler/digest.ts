import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { articles, feeds, user } from "../../db/schema";
import type { User, Article } from "../../db/schema";
import { sendDigestEmail, mockSendDigestEmail } from "../email";
import type { CloudflareEnv } from "../../types";

interface ArticleWithFeed extends Article {
  feedTitle?: string;
}

/**
 * 发送待处理的邮件摘要
 * 根据用户配置的频率和时间发送
 */
export async function sendPendingDigests(env: CloudflareEnv): Promise<{
  success: boolean;
  sent: number;
  errors: string[];
}> {
  const db = getDb(env.DB);
  const errors: string[] = [];
  let sent = 0;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDay = now.getDay(); // 0-6, 0=Sunday
  const currentTimeStr = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

  console.log(JSON.stringify({
    event: "digest_scan_started",
    scheduledTime: currentTimeStr,
    scheduledDay: currentDay,
  }));

  try {
    // 查找所有启用了邮件摘要的用户
    const users = await db.query.user.findMany({
      where: eq(user.emailDigestEnabled, true),
    });

    console.log(JSON.stringify({
      event: "digest_candidates_loaded",
      candidates: users.length,
    }));

    for (const u of users) {
      try {
        // 检查是否应该发送
        if (!shouldSendDigest(u, currentTimeStr, currentDay)) {
          continue;
        }

        // 获取用户的未读文章
        const unreadArticles = await getUnreadArticles(db, u.id);

        if (unreadArticles.length === 0) {
          continue;
        }

        // 发送邮件
        const result = await sendDigestEmail(
          u,
          unreadArticles,
          env.RESEND_API_KEY || "",
          env.FRONTEND_URL
        );

        if (result.success) {
          sent++;
          // 更新最后发送时间
          await db
            .update(user)
            .set({ lastDigestSentAt: now.toISOString() })
            .where(eq(user.id, u.id));
        } else {
          errors.push(`Failed to send to ${u.email}: ${result.error}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push(`Error processing user ${u.email}: ${errorMessage}`);
        console.error(JSON.stringify({
          event: "digest_recipient_failed",
          error: err instanceof Error ? err.name : "UnknownError",
        }));
      }
    }

    console.log(JSON.stringify({
      event: "digest_scan_completed",
      sent,
      failed: errors.length,
    }));
    return { success: errors.length === 0, sent, errors };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      event: "digest_scan_failed",
      error: err instanceof Error ? err.name : "UnknownError",
    }));
    return { success: false, sent, errors: [...errors, errorMessage] };
  }
}

/**
 * 检查是否应该发送摘要邮件
 */
function shouldSendDigest(
  user: User,
  currentTimeStr: string,
  currentDay: number
): boolean {
  const frequency = user.emailDigestFrequency || "daily";

  // 如果设置为关闭，不发送
  if (frequency === "off") {
    return false;
  }

  // 检查发送时间
  const scheduledTime = user.emailDigestTime || "09:00";
  if (currentTimeStr !== scheduledTime) {
    return false;
  }

  // 检查频率
  if (frequency === "weekly") {
    // 每周发送，检查是否是配置的那天
    // 注意：JavaScript getDay() 返回 0-6 (周日=0)
    // 数据库存储 1-7 (周日=7)
    const scheduledDay = user.emailDigestDay || 1; // 默认周一
    const normalizedCurrentDay = currentDay === 0 ? 7 : currentDay;

    if (normalizedCurrentDay !== scheduledDay) {
      return false;
    }
  }

  // 检查是否已经发送过（避免重复发送）
  if (user.lastDigestSentAt) {
    const lastSent = new Date(user.lastDigestSentAt);
    const now = new Date();

    // 如果今天已经发送过，不再发送
    if (lastSent.toDateString() === now.toDateString()) {
      return false;
    }
  }

  return true;
}

/**
 * 获取用户的未读文章
 */
async function getUnreadArticles(
  db: ReturnType<typeof getDb>,
  userId: string
): Promise<ArticleWithFeed[]> {
  // 查询用户的所有未读文章，关联订阅源获取标题
  const result = await db
    .select({
      article: articles,
      feedTitle: feeds.title,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(
      and(
        eq(feeds.userId, userId),
        eq(articles.isRead, false)
      )
    )
    .orderBy(sql`${articles.publishedAt} DESC`)
    .limit(20); // 每封邮件最多 20 篇文章

  return result.map((r) => ({
    ...r.article,
    feedTitle: r.feedTitle,
  }));
}

/**
 * 立即发送测试邮件（用于手动测试）
 */
export async function sendTestDigest(
  env: CloudflareEnv,
  userId: string,
  options: { mock?: boolean } = {}
): Promise<{ success: boolean; html?: string; error?: string }> {
  const db = getDb(env.DB);

  try {
    const u = await db.query.user.findFirst({
      where: eq(user.id, userId),
    });

    if (!u) {
      return { success: false, error: "User not found" };
    }

    const unreadArticles = await getUnreadArticles(db, userId);

    if (unreadArticles.length === 0) {
      return { success: false, error: "No unread articles" };
    }

    if (options.mock) {
      return mockSendDigestEmail(
        u,
        unreadArticles,
        env.FRONTEND_URL
      );
    }

    const result = await sendDigestEmail(
      u,
      unreadArticles,
      env.RESEND_API_KEY || "",
      env.FRONTEND_URL
    );

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage };
  }
}
