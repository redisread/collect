import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import authRoute from "./routes/auth";
import foldersRoute from "./routes/folders";
import feedsRoute from "./routes/feeds";
import articlesRoute from "./routes/articles";
import opmlRoute from "./routes/opml";
import refreshRoute from "./routes/refresh";
import translateRoute from "./routes/translate";
import settingsRoute from "./routes/settings";
import smartFoldersRoute from "./routes/smart-folders";
import annotationsRoute from "./routes/annotations";
import statsRoute from "./routes/stats";
import { sendPendingDigests } from "./lib/scheduler/digest";
import type { CloudflareEnv } from "./types";

const app = new Hono<{ Bindings: CloudflareEnv }>();

// 中间件
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin, // 允许所有来源（生产环境应限制）
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposeHeaders: ["Set-Cookie"],
  })
);

// 健康检查
app.get("/", (c) => c.json({ status: "ok", service: "collect-api" }));

// 路由挂载
app.route("/api/auth", authRoute);
app.route("/api/folders", foldersRoute);
app.route("/api/feeds", feedsRoute);
app.route("/api/articles", articlesRoute);
app.route("/api/opml", opmlRoute);
app.route("/api/refresh", refreshRoute);
app.route("/api/translate", translateRoute);
app.route("/api/settings", settingsRoute);
app.route("/api/smart-folders", smartFoldersRoute);
app.route("/api/annotations", annotationsRoute);
app.route("/api/stats", statsRoute);

// Cron 任务处理器
export default {
  async fetch(request: Request, env: CloudflareEnv) {
    return app.fetch(request, env);
  },
  async scheduled(event: ScheduledEvent, env: CloudflareEnv) {
    console.log("[Cron] Scheduled event triggered:", event.cron);
    await handleScheduledTasks(env);
  },
};

/**
 * 处理定时任务
 */
async function handleScheduledTasks(env: CloudflareEnv) {
  console.log("[Cron] Starting scheduled tasks...");

  try {
    // 发送邮件摘要
    const result = await sendPendingDigests(env);
    console.log("[Cron] Digest task completed:", result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[Cron] Error in scheduled tasks:", errorMessage);
  }

  console.log("[Cron] All scheduled tasks completed");
}
