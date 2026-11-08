import { Hono } from "hono";
import annotationsRoute from "./routes/annotations";
import nativeRoute from "./routes/native";
import articlesRoute from "./routes/articles";
import authRoute from "./routes/auth";
import feedsRoute from "./routes/feeds";
import foldersRoute from "./routes/folders";
import opmlRoute from "./routes/opml";
import refreshRoute from "./routes/refresh";
import settingsRoute from "./routes/settings";
import aiProfilesRoute from "./routes/ai-profiles";
import aiTranslateRoute from "./routes/ai-translate";
import smartFoldersRoute from "./routes/smart-folders";
import statsRoute from "./routes/stats";
import translateRoute from "./routes/translate";
import translationsRoute from "./routes/translations";
import type { CloudflareEnv } from "./types";

type ApiVariables = {
  requestId: string;
};

function getRequestId(value: string | undefined): string {
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : crypto.randomUUID();
}

export function createApiApp() {
  const app = new Hono<{
    Bindings: CloudflareEnv;
    Variables: ApiVariables;
  }>();

  app.use("*", async (c, next) => {
    const requestId = getRequestId(c.req.header("x-request-id"));
    const startedAt = Date.now();
    c.set("requestId", requestId);

    await next();

    c.header("x-request-id", requestId);
    console.log(JSON.stringify({
      event: "api_request_completed",
      requestId,
      method: c.req.method,
      status: c.res.status,
      durationMs: Date.now() - startedAt,
    }));
  });

  app.get("/api", (c) => c.json({ status: "ok", service: "collect" }));
  app.get("/api/health", (c) => c.json({ status: "ok", service: "collect" }));

  app.route("/api/auth", authRoute);
  app.route("/api/native", nativeRoute);
  app.route("/api/folders", foldersRoute);
  app.route("/api/feeds", feedsRoute);
  app.route("/api/articles", articlesRoute);
  app.route("/api/opml", opmlRoute);
  app.route("/api/refresh", refreshRoute);
  app.route("/api/translate", translateRoute);
  app.route("/api/settings", settingsRoute);
  app.route("/api/ai-profiles", aiProfilesRoute);
  app.route("/api/ai-translate", aiTranslateRoute);
  app.route("/api/smart-folders", smartFoldersRoute);
  app.route("/api/annotations", annotationsRoute);
  app.route("/api/stats", statsRoute);
  app.route("/api/translations", translationsRoute);

  app.onError((error, c) => {
    console.error(JSON.stringify({
      event: "api_request_failed",
      requestId: c.get("requestId"),
      method: c.req.method,
      error: error instanceof Error ? error.name : "UnknownError",
    }));
    return c.json({ success: false, error: "Internal server error" }, 500);
  });

  return app;
}

const apiApp = createApiApp();

export default apiApp;
