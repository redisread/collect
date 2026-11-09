import { nativeArticleFields } from "../lib/native-sync";
import { reorderFolders } from "../services/SubscriptionManagement";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { folders, feeds, articles } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const foldersRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

foldersRoute.use("/*", authMiddleware);

// GET /api/folders — 获取当前用户的所有文件夹
foldersRoute.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const db = getDb(c.env.DB);
    const result = await db
      .select()
      .from(folders)
      .where(eq(folders.userId, userId))
      .orderBy(asc(folders.sortOrder));
    return c.json({ success: true, data: result });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取文件夹失败" }, 500);
  }
});

foldersRoute.post("/:id/mark-all-read", async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const folderId = c.req.param("id");
  const folder = await db.select({ id: folders.id }).from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId))).get();
  if (!folder) return c.json({ success: false, error: "文件夹不存在" }, 404);
  const folderFeeds = db.select({ id: feeds.id }).from(feeds)
    .where(and(eq(feeds.userId, userId), eq(feeds.folderId, folderId), isNull(feeds.unsubscribedAt)));
  const scope = and(eq(articles.userId, userId), inArray(articles.feedId, folderFeeds));
  // Read the receipt after version/sync triggers have run, in the same atomic batch.
  const [, updated] = await db.batch([
    db.update(articles).set({ isRead: true }).where(and(scope, eq(articles.isRead, false))),
    db.select(nativeArticleFields).from(articles).where(scope),
  ]);
  return c.json({ success: true, data: { folderId, articles: updated } });
});

foldersRoute.post("/reorder", zValidator("json", z.object({ids:z.array(z.string().min(1)).min(1).max(500).refine(ids=>new Set(ids).size===ids.length)})), async c => {
  return c.json({success:true,data:{folders:await reorderFolders(getDb(c.env.DB),c.get("userId"),c.req.valid("json").ids)}});
});

// POST /api/folders — 为当前用户创建文件夹
foldersRoute.post(
  "/",
  zValidator("json", z.object({
    name: z.string().min(1, "文件夹名称不能为空"),
    color: z.string().optional(),
    icon: z.string().optional(),
  })),
  async (c) => {
    try {
      const userId = c.get("userId");
      const body = c.req.valid("json");
      if (!body.name.trim() || body.name.trim() === "未分类") return c.json({ success: false, error: "文件夹名称不可用" }, 400);
      const db = getDb(c.env.DB);

      const existing = await db
        .select()
        .from(folders)
        .where(eq(folders.userId, userId))
        .orderBy(asc(folders.sortOrder));
      const maxOrder = existing.length > 0 ? (existing[existing.length - 1].sortOrder ?? 0) + 1 : 0;

      const [folder] = await db
        .insert(folders)
        .values({
          userId,
          name: body.name.trim(),
          color: body.color ?? "#777777",
          icon: body.icon ?? null,
          sortOrder: maxOrder,
        })
        .returning();

      return c.json({ success: true, data: folder }, 201);
    } catch (err) {
      return c.json({ success: false, error: err instanceof Error ? err.message : "创建文件夹失败" }, 500);
    }
  }
);

// GET /api/folders/:id — 获取单个文件夹
foldersRoute.get("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const [folder] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)));
    if (!folder) return c.json({ success: false, error: "文件夹不存在" }, 404);
    return c.json({ success: true, data: folder });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取文件夹失败" }, 500);
  }
});

// PUT /api/folders/:id — 更新文件夹
foldersRoute.put("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json() as {
      name?: string;
      color?: string;
      icon?: string;
      sortOrder?: number;
      isCollapsed?: boolean;
    };
    if (body.name !== undefined && (!body.name.trim() || body.name.trim() === "未分类")) return c.json({ success: false, error: "文件夹名称不可用" }, 400);

    const db = getDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)));
    if (!existing) return c.json({ success: false, error: "文件夹不存在" }, 404);

    const updates: Partial<typeof existing> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.color !== undefined) updates.color = body.color;
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.isCollapsed !== undefined) updates.isCollapsed = body.isCollapsed;

    const [updated] = await db
      .update(folders)
      .set(updates)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "更新文件夹失败" }, 500);
  }
});

// DELETE /api/folders/:id — 删除文件夹
foldersRoute.delete("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)));
    if (!existing) return c.json({ success: false, error: "文件夹不存在" }, 404);

    await db.delete(folders).where(and(eq(folders.id, id), eq(folders.userId, userId)));
    return c.json({ success: true, data: { id } });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "删除文件夹失败" }, 500);
  }
});

export default foldersRoute;
