import { RETENTION_DAYS, expiredArticles, retentionDays, cleanupArticles } from "../lib/article-retention";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { articles, user, userPreferences } from "../db/schema";
import { DEFAULT_TARGET_LANG, SUPPORTED_LANG_CODES } from "../config/languages";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const app = new Hono<{ Bindings: CloudflareEnv }>();

// 获取用户设置
app.get("/", authMiddleware, async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  try {
    const [u] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId));

    if (!u) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    const preference = await db.select({ targetLanguage: userPreferences.translationTargetLanguage, days: userPreferences.articleRetentionDays, articleSortOrder: userPreferences.articleSortOrder })
      .from(userPreferences).where(eq(userPreferences.userId, userId)).get();

    return c.json({
      success: true,
      data: {
        articleSortOrder: preference?.articleSortOrder === "asc" ? "asc" : "desc",
        articleRetentionDays: RETENTION_DAYS.includes(preference?.days as 30) ? preference!.days : 30,
        translationTargetLanguage: preference?.targetLanguage ?? DEFAULT_TARGET_LANG,
        emailDigest: {
          enabled: u.emailDigestEnabled ?? false,
          frequency: u.emailDigestFrequency || "daily",
          time: u.emailDigestTime || "09:00",
          day: u.emailDigestDay ?? 1,
        },
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

app.put("/article-sort", authMiddleware, zValidator("json", z.object({
  articleSortOrder: z.enum(["asc", "desc"]),
})), async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const { articleSortOrder } = c.req.valid("json");
  await db.insert(userPreferences).values({ userId, articleSortOrder })
    .onConflictDoUpdate({ target: userPreferences.userId,
      set: { articleSortOrder, updatedAt: new Date().toISOString() } });
  return c.json({ success: true, data: { articleSortOrder } });
});

app.put("/translation", authMiddleware, zValidator("json", z.object({
  targetLanguage: z.string().refine(value => SUPPORTED_LANG_CODES.has(value), "不支持的翻译语言"),
})), async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const { targetLanguage } = c.req.valid("json");
  await db.insert(userPreferences).values({ userId, translationTargetLanguage: targetLanguage })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { translationTargetLanguage: targetLanguage, updatedAt: new Date().toISOString() },
    });
  return c.json({ success: true, data: { translationTargetLanguage: targetLanguage } });
});


const retentionSchema = z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(60), z.literal(90)]) });
app.post("/retention/preview", authMiddleware, zValidator("json", retentionSchema), async c => {
  const db = getDb(c.env.DB);
  const days = c.req.valid("json").days;
  const count = await db.select({ count: sql<number>`count(*)` }).from(articles).where(expiredArticles(c.get("userId"), days)).get();
  return c.json({ success: true, data: { days, previousDays: await retentionDays(db, c.get("userId")), count: count?.count ?? 0 } });
});
app.put("/retention", authMiddleware, zValidator("json", retentionSchema.extend({ previousDays: z.number().int(), confirmed: z.boolean().default(false) })), async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const { days, previousDays, confirmed } = c.req.valid("json");
  if (days < previousDays && !confirmed) return c.json({ success: false, error: "请先预览并确认清理范围" }, 409);
  await db.insert(userPreferences).values({ userId }).onConflictDoNothing();
  const changed = await db.update(userPreferences).set({ articleRetentionDays: days, updatedAt: new Date().toISOString() })
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.articleRetentionDays, previousDays))).returning();
  if (!changed.length) return c.json({ success: false, error: "设置已在其他设备改变，请重新加载" }, 409);
  await cleanupArticles(db, userId);
  return c.json({ success: true, data: { articleRetentionDays: days } });
});

// 更新邮件摘要设置
const updateSettingsSchema = z.object({
  emailDigest: z.object({
    enabled: z.boolean(),
    frequency: z.enum(["daily", "weekly", "off"]),
    time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"),
    day: z.number().int().min(1).max(7).optional(), // 1-7 (周日=7)
  }),
});

app.put("/", authMiddleware, zValidator("json", updateSettingsSchema), async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const body = c.req.valid("json");

  try {
    const { emailDigest } = body;

    await db
      .update(user)
      .set({
        emailDigestEnabled: emailDigest.enabled && emailDigest.frequency !== "off",
        emailDigestFrequency: emailDigest.frequency,
        emailDigestTime: emailDigest.time,
        emailDigestDay: emailDigest.day ?? 1,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    return c.json({
      success: true,
      data: {
        emailDigest: {
          enabled: emailDigest.enabled,
          frequency: emailDigest.frequency,
          time: emailDigest.time,
          day: emailDigest.day ?? 1,
        },
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// 发送测试邮件（手动触发）
app.post("/test-digest", authMiddleware, async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  try {
    const { sendTestDigest } = await import("../lib/scheduler/digest");
    const result = await sendTestDigest(c.env, userId, { mock: !c.env.RESEND_API_KEY });

    if (result.success) {
      return c.json({
        success: true,
        data: {
          message: c.env.RESEND_API_KEY ? "Test email sent" : "Test email generated (mock mode)",
          html: result.html,
        },
      });
    } else {
      return c.json({ success: false, error: result.error }, 400);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

export default app;
