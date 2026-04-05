import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { user } from "../db/schema";
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

    return c.json({
      success: true,
      data: {
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
