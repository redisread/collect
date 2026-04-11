import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb, type DB } from "../db";
import { annotations, articles, feeds } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const annotationsRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

annotationsRoute.use("/*", authMiddleware);

// 验证文章归属当前用户（通过 feedId → feeds.userId）
async function verifyArticleOwnership(db: DB, articleId: string, userId: string): Promise<boolean> {
  const [result] = await db
    .select({ feedUserId: feeds.userId })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(and(eq(articles.id, articleId), eq(feeds.userId, userId)));
  return !!result;
}

// 标注创建 Schema
const createAnnotationSchema = z.object({
  articleId: z.string(),
  type: z.enum(["highlight", "note"]),
  content: z.string().min(1, "内容不能为空"),
  textRange: z.object({
    start: z.string(),
    end: z.string(),
    text: z.string(),
  }).optional(),
  color: z.string().optional(),
});

// GET /api/annotations — 获取用户的所有标注
annotationsRoute.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const articleId = c.req.query("articleId");
    const type = c.req.query("type");
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "30", 10), 100);

    const db = getDb(c.env.DB);
    const offset = (page - 1) * pageSize;

    const conditions = [eq(annotations.userId, userId)];

    // 按文章过滤
    if (articleId) {
      conditions.push(eq(annotations.articleId, articleId));
    }

    // 按类型过滤
    if (type && (type === "highlight" || type === "note")) {
      conditions.push(eq(annotations.type, type));
    }

    const where = and(...conditions);

    const [annotationList, countResult] = await Promise.all([
      db
        .select({
          id: annotations.id,
          articleId: annotations.articleId,
          type: annotations.type,
          content: annotations.content,
          textRange: annotations.textRange,
          color: annotations.color,
          createdAt: annotations.createdAt,
          updatedAt: annotations.updatedAt,
        })
        .from(annotations)
        .where(where)
        .orderBy(desc(annotations.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(annotations)
        .where(where),
    ]);

    // 获取关联的文章信息
    const articleIds = annotationList.map((a) => a.articleId);
    const articleInfos = articleIds.length > 0
      ? await db
          .select({
            id: articles.id,
            title: articles.title,
            url: articles.url,
          })
          .from(articles)
          .where(sql`${articles.id} IN (${sql.join(articleIds.map((id) => sql`${id}`), sql`, `)})`)
      : [];

    const articleMap = new Map(articleInfos.map((a) => [a.id, a]));

    const enrichedAnnotations = annotationList.map((annotation) => ({
      ...annotation,
      article: articleMap.get(annotation.articleId) || null,
    }));

    return c.json({
      success: true,
      data: {
        annotations: enrichedAnnotations,
        total: countResult[0]?.count ?? 0,
        page,
        pageSize,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取标注失败" }, 500);
  }
});

// GET /api/annotations/article/:articleId — 获取文章的所有标注
annotationsRoute.get("/article/:articleId", async (c) => {
  try {
    const userId = c.get("userId");
    const articleId = c.req.param("articleId");
    const db = getDb(c.env.DB);

    // 验证文章归属
    const hasAccess = await verifyArticleOwnership(db, articleId, userId);
    if (!hasAccess) return c.json({ success: false, error: "文章不存在或无权限" }, 404);

    const annotationList = await db
      .select({
        id: annotations.id,
        articleId: annotations.articleId,
        type: annotations.type,
        content: annotations.content,
        textRange: annotations.textRange,
        color: annotations.color,
        createdAt: annotations.createdAt,
        updatedAt: annotations.updatedAt,
      })
      .from(annotations)
      .where(and(eq(annotations.articleId, articleId), eq(annotations.userId, userId)))
      .orderBy(asc(annotations.createdAt));

    return c.json({
      success: true,
      data: annotationList,
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取标注失败" }, 500);
  }
});

// POST /api/annotations — 创建标注
annotationsRoute.post(
  "/",
  zValidator("json", createAnnotationSchema),
  async (c) => {
    try {
      const userId = c.get("userId");
      const body = c.req.valid("json");
      const db = getDb(c.env.DB);

      // 验证文章归属
      const hasAccess = await verifyArticleOwnership(db, body.articleId, userId);
      if (!hasAccess) return c.json({ success: false, error: "文章不存在或无权限" }, 404);

      const [annotation] = await db
        .insert(annotations)
        .values({
          articleId: body.articleId,
          userId,
          type: body.type,
          content: body.content,
          textRange: body.textRange ? JSON.stringify(body.textRange) : null,
          color: body.color ?? "#FFEB3B",
        })
        .returning();

      return c.json({ success: true, data: annotation }, 201);
    } catch (err) {
      return c.json({ success: false, error: err instanceof Error ? err.message : "创建标注失败" }, 500);
    }
  }
);

// GET /api/annotations/:id — 获取单个标注
annotationsRoute.get("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);

    const [annotation] = await db
      .select()
      .from(annotations)
      .where(and(eq(annotations.id, id), eq(annotations.userId, userId)));

    if (!annotation) return c.json({ success: false, error: "标注不存在" }, 404);

    // 获取关联文章信息
    const [article] = await db
      .select({ id: articles.id, title: articles.title, url: articles.url })
      .from(articles)
      .where(eq(articles.id, annotation.articleId));

    return c.json({
      success: true,
      data: {
        ...annotation,
        article,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取标注失败" }, 500);
  }
});

// PUT /api/annotations/:id — 更新标注
annotationsRoute.put("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json() as {
      content?: string;
      color?: string;
      textRange?: { start: string; end: string; text: string };
    };

    const db = getDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(annotations)
      .where(and(eq(annotations.id, id), eq(annotations.userId, userId)));

    if (!existing) return c.json({ success: false, error: "标注不存在" }, 404);

    const updates: Partial<typeof existing> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.content !== undefined) updates.content = body.content;
    if (body.color !== undefined) updates.color = body.color;
    if (body.textRange !== undefined) updates.textRange = JSON.stringify(body.textRange);

    const [updated] = await db
      .update(annotations)
      .set(updates)
      .where(and(eq(annotations.id, id), eq(annotations.userId, userId)))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "更新标注失败" }, 500);
  }
});

// DELETE /api/annotations/:id — 删除标注
annotationsRoute.delete("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);

    const [existing] = await db
      .select()
      .from(annotations)
      .where(and(eq(annotations.id, id), eq(annotations.userId, userId)));

    if (!existing) return c.json({ success: false, error: "标注不存在" }, 404);

    await db.delete(annotations).where(and(eq(annotations.id, id), eq(annotations.userId, userId)));
    return c.json({ success: true, data: { id } });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "删除标注失败" }, 500);
  }
});

export default annotationsRoute;
