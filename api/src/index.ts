import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { CloudflareEnv } from "./types";

// Existing routes (v1)
import authRoute from "./routes/auth";
import foldersRoute from "./routes/folders";
import feedsRoute from "./routes/feeds";
import articlesRoute from "./routes/articles";
import opmlRoute from "./routes/opml";
import refreshRoute from "./routes/refresh";

// New v2 routes
import v2Route from "./routes/v2";

// Middleware
import { metricsMiddleware } from "./middleware/metrics";

// Cron handlers
import { handleCron } from "./cron/handlers";

const app = new Hono<{ Bindings: CloudflareEnv }>();

// Global middleware
app.use("*", logger());
app.use("*", metricsMiddleware);
app.use(
  "*",
  cors({
    origin: (origin) => origin,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposeHeaders: ["Set-Cookie"],
  })
);

// Health check
app.get("/", (c) =>
  c.json({
    status: "ok",
    service: "collect-api",
    version: "2.0.0",
  })
);

// API v1 routes (backward compatibility)
app.route("/api/auth", authRoute);
app.route("/api/folders", foldersRoute);
app.route("/api/feeds", feedsRoute);
app.route("/api/articles", articlesRoute);
app.route("/api/opml", opmlRoute);
app.route("/api/refresh", refreshRoute);

// API v2 routes
app.route("/api/v2", v2Route);

// 404 handler
app.notFound((c) => c.json({ success: false, error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      success: false,
      error: err instanceof Error ? err.message : "Internal server error",
    },
    500
  );
});

// Export Hono app for Cloudflare Workers
export default {
  fetch: app.fetch,

  // Cron trigger handler
  async scheduled(
    event: ScheduledEvent,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleCron(event, env, ctx));
  },
};
