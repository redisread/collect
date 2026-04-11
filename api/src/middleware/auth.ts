import { createMiddleware } from "hono/factory";
import { createAuth } from "../lib/auth";
import { getDb } from "../db";
import { session, user } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import type { CloudflareEnv } from "../types";

type Variables = {
  userId: string;
};

/** 验证 Better Auth session，注入 userId */
export const authMiddleware = createMiddleware<{
  Bindings: CloudflareEnv;
  Variables: Variables;
}>(async (c, next) => {
  // Try to get session from headers (supports both cookie and bearer token)
  const headers = c.req.raw.headers;
  const authHeader = headers.get("Authorization");

  let token = "";

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    // Try to get from cookie
    const cookieHeader = headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
      if (match) {
        token = match[1];
      }
    }
  }

  if (!token) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  // Direct database query to validate token
  const db = getDb(c.env.DB);

  try {
    // Use raw SQL to avoid drizzle-orm timestamp conversion issues
    const result = await db
      .select({
        id: session.id,
        userId: session.userId,
      })
      .from(session)
      .where(eq(session.token, token))
      .limit(1);

    if (!result.length) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const sessionRow = result[0];
    console.log("Found session for user:", sessionRow.userId);
    c.set("userId", sessionRow.userId);
    await next();
  } catch (err) {
    console.error("Auth error:", err);
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
});
