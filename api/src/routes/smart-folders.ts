import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { smartFolders, articles, feeds } from "../db/schema";
import type { SmartFolderRules, Article } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import type { CloudflareEnv } from "../types";

const smartFoldersRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

smartFoldersRoute.use("/*", authMiddleware);

// 规则验证 Schema
const conditionSchema = z.object({
  field: z.enum(["title", "content", "summary", "author", "feedId"]),
  operator: z.enum(["contains", "equals", "startsWith", "endsWith"]),
  value: z.string(),
});

const rulesSchema = z.object({
  operator: z.enum(["AND", "OR"]),
  conditions: z.array(conditionSchema),
});

const createSmartFolderSchema = z.object({
  name: z.string().min(1, "文件夹名称不能为空"),
  color: z.string().optional(),
  icon: z.string().optional(),
  rules: rulesSchema,
});

// GET /api/smart-folders — 获取智能文件夹列表
smartFoldersRoute.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const db = getDb(c.env.DB);
    const result = await db
      .select()
      .from(smartFolders)
      .where(eq(smartFolders.userId, userId))
      .orderBy(asc(smartFolders.sortOrder));
    return c.json({ success: true, data: result });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取智能文件夹失败" }, 500);
  }
});

// POST /api/smart-folders — 创建智能文件夹
smartFoldersRoute.post(
  "/",
  zValidator("json", createSmartFolderSchema),
  async (c) => {
    try {
      const userId = c.get("userId");
      const body = c.req.valid("json");
      const db = getDb(c.env.DB);

      const existing = await db
        .select()
        .from(smartFolders)
        .where(eq(smartFolders.userId, userId))
        .orderBy(asc(smartFolders.sortOrder));
      const maxOrder = existing.length > 0 ? (existing[existing.length - 1].sortOrder ?? 0) + 1 : 0;

      const [folder] = await db
        .insert(smartFolders)
        .values({
          userId,
          name: body.name.trim(),
          color: body.color ?? "#777777",
          icon: body.icon ?? null,
          rules: JSON.stringify(body.rules),
          sortOrder: maxOrder,
        })
        .returning();

      return c.json({ success: true, data: folder }, 201);
    } catch (err) {
      return c.json({ success: false, error: err instanceof Error ? err.message : "创建智能文件夹失败" }, 500);
    }
  }
);

// GET /api/smart-folders/:id — 获取单个智能文件夹
smartFoldersRoute.get("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const [folder] = await db
      .select()
      .from(smartFolders)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, userId)));
    if (!folder) return c.json({ success: false, error: "智能文件夹不存在" }, 404);
    return c.json({ success: true, data: folder });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取智能文件夹失败" }, 500);
  }
});

// PUT /api/smart-folders/:id — 更新智能文件夹
smartFoldersRoute.put("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json() as {
      name?: string;
      color?: string;
      icon?: string;
      rules?: SmartFolderRules;
      sortOrder?: number;
    };

    const db = getDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(smartFolders)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, userId)));
    if (!existing) return c.json({ success: false, error: "智能文件夹不存在" }, 404);

    const updates: Partial<typeof existing> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.color !== undefined) updates.color = body.color;
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.rules !== undefined) updates.rules = JSON.stringify(body.rules);
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    const [updated] = await db
      .update(smartFolders)
      .set(updates)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, userId)))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "更新智能文件夹失败" }, 500);
  }
});

// DELETE /api/smart-folders/:id — 删除智能文件夹
smartFoldersRoute.delete("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const db = getDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(smartFolders)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, userId)));
    if (!existing) return c.json({ success: false, error: "智能文件夹不存在" }, 404);

    await db.delete(smartFolders).where(and(eq(smartFolders.id, id), eq(smartFolders.userId, userId)));
    return c.json({ success: true, data: { id } });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "删除智能文件夹失败" }, 500);
  }
});

// GET /api/smart-folders/:id/articles — 获取智能文件夹匹配的文章（实时计算）
smartFoldersRoute.get("/:id/articles", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "30", 10), 100);

    const db = getDb(c.env.DB);

    // 获取智能文件夹
    const [folder] = await db
      .select()
      .from(smartFolders)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, userId)));

    if (!folder) return c.json({ success: false, error: "智能文件夹不存在" }, 404);

    // 解析规则
    let rules: SmartFolderRules;
    try {
      rules = JSON.parse(folder.rules) as SmartFolderRules;
    } catch {
      return c.json({ success: false, error: "智能文件夹规则格式错误" }, 400);
    }

    // 获取用户所有文章
    const userFeeds = await db.select({ id: feeds.id }).from(feeds).where(eq(feeds.userId, userId));
    if (userFeeds.length === 0) {
      return c.json({ success: true, data: { articles: [], total: 0, page, pageSize } });
    }

    const userFeedIds = userFeeds.map((f) => f.id);

    const articleList = await db
      .select({
        id: articles.id,
        feedId: articles.feedId,
        title: articles.title,
        url: articles.url,
        summary: articles.summary,
        content: articles.content,
        author: articles.author,
        imageUrl: articles.imageUrl,
        publishedAt: articles.publishedAt,
        isRead: articles.isRead,
        isStarred: articles.isStarred,
        isReadLater: articles.isReadLater,
        createdAt: articles.createdAt,
      })
      .from(articles)
      .where(sql`${articles.feedId} IN (${sql.join(userFeedIds.map((fid) => sql`${fid}`), sql`, `)})`)
      .orderBy(desc(articles.publishedAt));

    // 实时过滤匹配规则的文章
    const matchedArticles = articleList.filter((article) => matchSmartFolder(article as Article, rules));

    // 分页
    const total = matchedArticles.length;
    const offset = (page - 1) * pageSize;
    const paginatedArticles = matchedArticles.slice(offset, offset + pageSize);

    return c.json({
      success: true,
      data: {
        articles: paginatedArticles,
        total,
        page,
        pageSize,
        folder: {
          id: folder.id,
          name: folder.name,
          color: folder.color,
          icon: folder.icon,
        },
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "获取文章失败" }, 500);
  }
});

// 规则匹配逻辑
function matchSmartFolder(article: Article, rules: SmartFolderRules): boolean {
  if (!rules.conditions || rules.conditions.length === 0) return true;

  const results = rules.conditions.map((condition) => {
    const fieldValue = getFieldValue(article, condition.field);
    if (fieldValue === undefined || fieldValue === null) return false;

    const value = String(fieldValue).toLowerCase();
    const compareValue = condition.value.toLowerCase();

    switch (condition.operator) {
      case "contains":
        return value.includes(compareValue);
      case "equals":
        return value === compareValue;
      case "startsWith":
        return value.startsWith(compareValue);
      case "endsWith":
        return value.endsWith(compareValue);
      default:
        return false;
    }
  });

  if (rules.operator === "AND") {
    return results.every(Boolean);
  } else {
    return results.some(Boolean);
  }
}

// 获取字段值
function getFieldValue(article: Article, field: string): string | undefined {
  switch (field) {
    case "title":
      return article.title;
    case "content":
      return article.content ?? undefined;
    case "summary":
      return article.summary ?? undefined;
    case "author":
      return article.author ?? undefined;
    case "feedId":
      return article.feedId;
    default:
      return undefined;
  }
}

export default smartFoldersRoute;
