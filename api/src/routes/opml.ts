import { Hono } from "hono";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { feeds, folders, articles } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { parseOpml, generateOpml } from "../lib/rss/opml";
import { RSSFetcher } from "../lib/rss/fetcher";
import type { CloudflareEnv } from "../types";

const opmlRoute = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();

opmlRoute.use("/*", authMiddleware);

/** 从 URL 推断 favicon URL */
function getFaviconUrl(siteUrl: string): string {
  try {
    const url = new URL(siteUrl);
    return `${url.protocol}//${url.hostname}/favicon.ico`;
  } catch {
    return "";
  }
}

/** 去除 HTML 标签 */
function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// GET /api/opml — 导出当前用户的 OPML
opmlRoute.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const db = getDb(c.env.DB);

    const [feedList, folderList] = await Promise.all([
      db.select().from(feeds).where(eq(feeds.userId, userId)).orderBy(asc(feeds.sortOrder)),
      db.select().from(folders).where(eq(folders.userId, userId)).orderBy(asc(folders.sortOrder)),
    ]);

    const folderMap = new Map(folderList.map((f) => [f.id, f.name]));

    const opmlFeeds = feedList.map((feed) => ({
      title: feed.title,
      feedUrl: feed.feedUrl,
      url: feed.url,
      folderName: feed.folderId ? folderMap.get(feed.folderId) : undefined,
    }));

    const opmlContent = generateOpml(opmlFeeds);

    return new Response(opmlContent, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="folio-feeds.opml"',
      },
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "导出 OPML 失败" }, 500);
  }
});

// POST /api/opml — 为当前用户导入 OPML
opmlRoute.post("/", async (c) => {
  try {
    const userId = c.get("userId");
    const text = await c.req.text();
    if (!text.trim()) return c.json({ success: false, error: "OPML 内容不能为空" }, 400);

    const parsedFeeds = parseOpml(text);
    if (parsedFeeds.length === 0) return c.json({ success: false, error: "未找到有效的订阅源" }, 400);

    const db = getDb(c.env.DB);

    // 创建文件夹映射（文件夹名 -> id），仅限当前用户
    const folderNameMap = new Map<string, string>();
    const existingFolders = await db.select().from(folders).where(eq(folders.userId, userId));
    for (const f of existingFolders) {
      folderNameMap.set(f.name, f.id);
    }

    // 创建不存在的文件夹
    const uniqueFolderNames = [...new Set(parsedFeeds.map((f) => f.folderName).filter(Boolean) as string[])];
    for (const name of uniqueFolderNames) {
      if (!folderNameMap.has(name)) {
        const [folder] = await db.insert(folders).values({ userId, name }).returning();
        folderNameMap.set(name, folder.id);
      }
    }

    // 导入订阅源
    const results = [];
    for (const opmlFeed of parsedFeeds) {
      try {
        // 检查当前用户是否已订阅该 Feed
        const [existing] = await db
          .select()
          .from(feeds)
          .where(and(eq(feeds.feedUrl, opmlFeed.xmlUrl), eq(feeds.userId, userId)));
        if (existing) {
          results.push({ url: opmlFeed.xmlUrl, success: false, error: "已存在" });
          continue;
        }

        // 抓取 Feed
        const fetcher = new RSSFetcher();
        const parsed = await fetcher.fetch(opmlFeed.xmlUrl);
        const folderId = opmlFeed.folderName ? folderNameMap.get(opmlFeed.folderName) : null;

        // 计算下次抓取时间
        const nextFetchAt = new Date();
        nextFetchAt.setHours(nextFetchAt.getHours() + 1);

        const [newFeed] = await db.insert(feeds).values({
          userId,
          folderId: folderId ?? null,
          title: parsed.title || opmlFeed.title,
          url: parsed.siteUrl || opmlFeed.htmlUrl || opmlFeed.xmlUrl,
          feedUrl: opmlFeed.xmlUrl,
          description: parsed.description,
          faviconUrl: getFaviconUrl(parsed.siteUrl || opmlFeed.xmlUrl),
          lastFetchedAt: new Date().toISOString(),
          nextFetchAt: nextFetchAt.toISOString(),
        }).returning();

        // 导入文章（新增）
        if (parsed.articles.length > 0) {
          await db.insert(articles).values(
            parsed.articles.slice(0, 50).map((a) => ({
              userId,
              feedId: newFeed.id,
              title: a.title,
              url: a.url,
              content: a.content,
              contentText: stripHtml(a.content),
              summary: a.summary,
              author: a.author,
              imageUrl: a.imageUrl,
              publishedAt: a.publishedAt,
            }))
          ).onConflictDoNothing();
        }

        results.push({ url: opmlFeed.xmlUrl, success: true });
      } catch (err) {
        results.push({
          url: opmlFeed.xmlUrl,
          success: false,
          error: err instanceof Error ? err.message : "导入失败",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return c.json({ success: true, data: { results, total: parsedFeeds.length, imported: successCount } });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "导入 OPML 失败" }, 500);
  }
});

export default opmlRoute;
