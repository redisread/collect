import { createMiddleware } from "hono/factory";
import { createAuth } from "../lib/auth";
import type { CloudflareEnv } from "../types";

type Variables = {
  userId: string;
};

/** 验证 Better Auth session，注入 userId */
export const authMiddleware = createMiddleware<{
  Bindings: CloudflareEnv;
  Variables: Variables;
}>(async (c, next) => {
  const auth = createAuth(
    c.env.DB,
    c.env.BETTER_AUTH_SECRET,
    c.env.BETTER_AUTH_URL
  );

  // Try to get session from headers (supports both cookie and bearer token)
  const headers = c.req.raw.headers;
  const authHeader = headers.get("Authorization");

  // If Bearer token provided, convert to cookie format for Better Auth
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Create new headers with cookie
    const newHeaders = new Headers(headers);
    newHeaders.set("Cookie", `better-auth.session-token=${token}`);

    const session = await auth.api.getSession({ headers: newHeaders });
    if (session?.user) {
      c.set("userId", session.user.id);
      await next();
      return;
    }
  }

  // Fall back to cookie-based session
  const session = await auth.api.getSession({ headers });

  if (!session?.user) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  c.set("userId", session.user.id);
  await next();
});
