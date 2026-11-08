import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { aiProfiles, userPreferences } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";
import { decryptApiKey, encryptApiKey, normalizeProviderUrl, requestAiTranslation, validateProviderDestination } from "../lib/ai-provider";
import { TranslationError } from "../lib/translate";

const app = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();
app.use("*", authMiddleware);
app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["deepseek", "openai-compatible"]),
  baseUrl: z.string().max(500).transform((value, ctx) => {
    try { return normalizeProviderUrl(value); }
    catch { ctx.addIssue({ code: "custom", message: "请填写公网 HTTPS API 地址" }); return z.NEVER; }
  }),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1).max(4096).regex(/^[\x21-\x7e]+$/).optional(),
  enable: z.boolean().default(false),
  revision: z.string().uuid().optional(),
  updatedAt: z.string().optional(),
}).refine(value => value.kind !== "deepseek" || value.baseUrl === "https://api.deepseek.com", "DeepSeek 快捷配置使用官方地址");

const safeColumns = {
  id: aiProfiles.id, name: aiProfiles.name, kind: aiProfiles.kind,
  baseUrl: aiProfiles.baseUrl, model: aiProfiles.model, revision: aiProfiles.revision,
  updatedAt: aiProfiles.updatedAt,
};

app.get("/", async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const profiles = await db.select(safeColumns).from(aiProfiles).where(eq(aiProfiles.userId, userId));
  const preference = await db.select({ id: userPreferences.translationProviderId }).from(userPreferences).where(eq(userPreferences.userId, userId)).get();
  return c.json({ success: true, data: { profiles: profiles.map(profile => ({ ...profile, hasKey: true })),
    activeProfileId: profiles.some(profile => profile.id === preference?.id) ? preference!.id : null } });
});

app.put("/active", zValidator("json", z.object({ profileId: z.string().min(1).nullable() })), async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const { profileId } = c.req.valid("json");
  if (profileId && !await db.select({ id: aiProfiles.id }).from(aiProfiles).where(and(eq(aiProfiles.id, profileId), eq(aiProfiles.userId, userId))).get()) {
    return c.json({ success: false, error: "配置不存在，请刷新后重试" }, 404);
  }
  await db.insert(userPreferences).values({ userId, translationProviderId: profileId }).onConflictDoUpdate({
    target: userPreferences.userId, set: { translationProviderId: profileId },
  });
  return c.json({ success: true });
});

app.post("/", zValidator("json", profileSchema), async c => {
  const body = c.req.valid("json");
  if (!body.apiKey) return c.json({ success: false, error: "请输入 API key" }, 400);
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const id = crypto.randomUUID();
  const encryptedKey = await encryptApiKey(body.apiKey, c.env.AI_KEYS_ENCRYPTION_SECRET, `${userId}:${id}`);
  const insert = db.insert(aiProfiles).values({ id, userId, name: body.name, kind: body.kind,
    baseUrl: body.baseUrl, model: body.model, encryptedKey, revision: crypto.randomUUID(), updatedAt: new Date().toISOString() });
  if (body.enable) {
    await db.batch([insert, db.insert(userPreferences).values({ userId, translationProviderId: id })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { translationProviderId: id } })]);
  } else { await insert; }
  return c.json({ success: true, data: { id } }, 201);
});

app.put("/:id", zValidator("json", profileSchema), async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const existing = await db.select().from(aiProfiles).where(and(eq(aiProfiles.id, id), eq(aiProfiles.userId, userId))).get();
  if (!existing) return c.json({ success: false, error: "配置不存在" }, 404);
  if (body.revision !== existing.revision || body.updatedAt !== existing.updatedAt) return c.json({ success: false, error: "配置已被修改，请刷新后重试" }, 409);
  if (body.baseUrl !== existing.baseUrl && !body.apiKey) return c.json({ success: false, error: "更换服务地址时请重新填写密钥" }, 400);
  const encryptedKey = body.apiKey ? await encryptApiKey(body.apiKey, c.env.AI_KEYS_ENCRYPTION_SECRET, `${userId}:${id}`) : existing.encryptedKey;
  // Key/name edits preserve translation identity; changing the model, URL or protocol creates a new revision.
  const changed = body.baseUrl !== existing.baseUrl || body.model !== existing.model || body.kind !== existing.kind;
  const updated = await db.update(aiProfiles).set({ name: body.name, kind: body.kind, baseUrl: body.baseUrl,
    model: body.model, encryptedKey, revision: changed ? crypto.randomUUID() : existing.revision,
    updatedAt: new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString() })
    .where(and(eq(aiProfiles.id, id), eq(aiProfiles.userId, userId), eq(aiProfiles.updatedAt, existing.updatedAt))).returning({ id: aiProfiles.id });
  if (!updated.length) return c.json({ success: false, error: "配置已被修改，请刷新后重试" }, 409);
  return c.json({ success: true });
});

app.delete("/:id", async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const id = c.req.param("id");
  await db.batch([
    db.update(userPreferences).set({ translationProviderId: null }).where(and(eq(userPreferences.userId, userId), eq(userPreferences.translationProviderId, id))),
    db.delete(aiProfiles).where(and(eq(aiProfiles.id, id), eq(aiProfiles.userId, userId))),
  ]);
  return c.json({ success: true });
});

app.post("/:id/test", async c => {
  const userId = c.get("userId");
  const profile = await getDb(c.env.DB).select().from(aiProfiles)
    .where(and(eq(aiProfiles.id, c.req.param("id")), eq(aiProfiles.userId, userId))).get();
  if (!profile) return c.json({ success: false, error: "配置不存在" }, 404);
  const rateKey = `ai-test:${userId}:${profile.id}`;
  if (await c.env.COLLECT_KV.get(rateKey)) return c.json({ success: false, error: "请稍后再测试连接" }, 429);
  await c.env.COLLECT_KV.put(rateKey, "1", { expirationTtl: 60 });
  try {
    const signal = AbortSignal.timeout(30_000);
    const endpoint = await validateProviderDestination(profile.baseUrl, signal);
    const key = await decryptApiKey(profile.encryptedKey, c.env.AI_KEYS_ENCRYPTION_SECRET, `${userId}:${profile.id}`);
    const result = await requestAiTranslation(profile, endpoint, key, "Hello", "zh-CN", "Connection test", signal);
    return c.json({ success: true, data: { text: result.translated } });
  } catch (error) {
    return c.json({ success: false, error: error instanceof TranslationError ? error.message : "测试失败，请检查配置后重试" }, 502);
  }
});

export default app;
