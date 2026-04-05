export interface CloudflareEnv {
  DB: D1Database;
  COLLECT_KV: KVNamespace;
  COLLECT_R2: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  FRONTEND_URL: string;
  RESEND_API_KEY?: string;
}
