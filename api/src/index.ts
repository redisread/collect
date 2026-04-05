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

export default app;
