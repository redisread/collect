import { Hono } from "hono";
import { createAuth } from "../lib/auth";
import type { CloudflareEnv } from "../types";

const auth = new Hono<{ Bindings: CloudflareEnv }>();

/** Better Auth 处理所有 /api/auth/* 请求 */
auth.on(["POST", "GET"], "/*", async (c) => {
  const authInstance = createAuth(
    c.env.DB,
    c.env.BETTER_AUTH_SECRET,
    new URL(c.req.url).origin,
  );
  return authInstance.handler(c.req.raw);
});

export default auth;
