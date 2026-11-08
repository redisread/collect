import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { user } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const app = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();
app.use("*", authMiddleware);
app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
const fields = { id: user.id, name: user.name, email: user.email, image: user.image };
app.get("/", async c => c.json({ success: true, data: await getDb(c.env.DB).select(fields).from(user).where(eq(user.id, c.get("userId"))).get() }));
app.put("/", zValidator("json", z.object({ name: z.string().trim().min(1).max(40) })), async c => {
  const data = await getDb(c.env.DB).update(user).set({ name: c.req.valid("json").name, updatedAt: new Date() })
    .where(eq(user.id, c.get("userId"))).returning(fields).get();
  return c.json({ success: true, data });
});
app.post("/avatar", async c => {
  if (Number(c.req.header("content-length")) > 1_048_576) return c.json({ success: false, error: "头像不能超过 1 MB" }, 413);
  const reader = c.req.raw.body?.getReader();
  if (!reader) return c.json({ success: false, error: "缺少头像" }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 1_048_576) return c.json({ success: false, error: "头像不能超过 1 MB" }, 413);
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const view = new DataView(bytes.buffer);
  const valid = size >= 33 && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)
    && view.getUint32(12) === 0x49484452 && view.getUint32(16) > 0 && view.getUint32(16) <= 1024
    && view.getUint32(16) === view.getUint32(20);
  if (!valid) return c.json({ success: false, error: "请上传裁剪后的正方形 PNG 头像" }, 400);
  const id = crypto.randomUUID();
  const image = `/api/profile/avatar/${id}`;
  await c.env.COLLECT_R2.put(`avatars/${c.get("userId")}/${id}.png`, bytes, { httpMetadata: { contentType: "image/png" } });
  const data = await getDb(c.env.DB).update(user).set({ image, updatedAt: new Date() })
    .where(eq(user.id, c.get("userId"))).returning(fields).get();
  return c.json({ success: true, data });
});
app.delete("/avatar", async c => {
  const data = await getDb(c.env.DB).update(user).set({ image: null, updatedAt: new Date() })
    .where(eq(user.id, c.get("userId"))).returning(fields).get();
  return c.json({ success: true, data });
});
app.get("/avatar/:id", async c => {
  const id = c.req.param("id");
  if (!/^[\da-f-]{36}$/.test(id)) return c.notFound();
  const object = await c.env.COLLECT_R2.get(`avatars/${c.get("userId")}/${id}.png`);
  if (!object) return c.notFound();
  return new Response(object.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
});
export default app;
