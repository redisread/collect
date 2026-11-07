import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "../db";
import * as schema from "../db/schema";

export function createAuth(d1: D1Database, secret: string, baseURL: string) {
  const origin = new URL(baseURL).origin;

  return betterAuth({
    database: drizzleAdapter(getDb(d1), {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    secret,
    baseURL: origin,
    trustedOrigins: [origin],
  });
}

export type Auth = ReturnType<typeof createAuth>;
