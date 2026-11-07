import { createMiddleware } from "hono/factory";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { session } from "../db/schema";
import { createAuth } from "../lib/auth";
import type { CloudflareEnv } from "../types";

type Variables = {
  userId: string;
};

/** Validate signed Better Auth cookies or an unexpired native-client bearer token. */
export const authMiddleware = createMiddleware<{
  Bindings: CloudflareEnv;
  Variables: Variables;
}>(async (c, next) => {
  const headers = c.req.raw.headers;
  const authHeader = headers.get("Authorization");
  let userId: string | undefined;

  try {
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (!token) {
        return c.json({ success: false, error: "Unauthorized" }, 401);
      }
      const [activeSession] = await getDb(c.env.DB)
        .select({ userId: session.userId })
        .from(session)
        .where(and(eq(session.token, token), gt(session.expiresAt, new Date())))
        .limit(1);
      userId = activeSession?.userId;
    } else {
      const auth = createAuth(c.env.DB, c.env.BETTER_AUTH_SECRET, new URL(c.req.url).origin);
      const activeSession = await auth.api.getSession({ headers });
      userId = activeSession?.user.id;
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "auth_session_validation_failed",
      error: error instanceof Error ? error.name : "UnknownError",
    }));
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  if (!userId) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  c.set("userId", userId);
  await next();
});
