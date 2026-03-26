import { Hono } from "hono";
import type { CloudflareEnv } from "../../types";

import articlesRoute from "./articles";
import feedsRoute from "./feeds";
import syncRoute from "./sync";

const v2Route = new Hono<{ Bindings: CloudflareEnv }>();

// Mount v2 routes
v2Route.route("/articles", articlesRoute);
v2Route.route("/feeds", feedsRoute);
v2Route.route("/sync", syncRoute);

// Health check for v2 API
v2Route.get("/health", (c) => {
  return c.json({
    success: true,
    data: {
      version: "2.0.0",
      status: "ok",
    },
  });
});

export default v2Route;
