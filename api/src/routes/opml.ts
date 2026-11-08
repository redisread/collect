import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { eq, asc } from "drizzle-orm";
import { getDb } from "../db";
import { feeds, folders } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { generateOpml, OpmlParseError } from "../lib/rss/opml";
import { confirmImport, createImportPreview, dispatchImportItems, getImportJob, listImportJobs } from "../services/OpmlImportService";
import type { CloudflareEnv } from "../types";

const app = new Hono<{ Bindings: CloudflareEnv; Variables: { userId: string } }>();
app.use("*", authMiddleware);
app.use("*", bodyLimit({ maxSize: 2 * 1024 * 1024, onError: c => c.json({ success: false, error: "OPML 文件不能超过 2 MB" }, 413) }));
app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });

app.get("/", async c => {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const [feedList, folderList] = await Promise.all([
    db.select().from(feeds).where(eq(feeds.userId, userId)).orderBy(asc(feeds.sortOrder)),
    db.select().from(folders).where(eq(folders.userId, userId)).orderBy(asc(folders.sortOrder)),
  ]);
  const folderMap = new Map(folderList.map(folder => [folder.id, folder.name]));
  return new Response(generateOpml(feedList.map(feed => ({ title: feed.title, feedUrl: feed.feedUrl, url: feed.url,
    folderName: feed.folderId ? folderMap.get(feed.folderId) : undefined }))), {
    headers: { "Content-Type": "text/xml; charset=utf-8", "Content-Disposition": 'attachment; filename="folio-feeds.opml"', "Cache-Control": "no-store" },
  });
});

app.get("/jobs", async c => c.json({ success: true, data: await listImportJobs(c.env, c.get("userId")) }));
app.get("/jobs/:id", async c => {
  const job = await getImportJob(c.env, c.get("userId"), c.req.param("id"));
  return job ? c.json({ success: true, data: job }) : c.json({ success: false, error: "导入任务不存在" }, 404);
});

app.post("/preview", async c => {
  try {
    const id = await createImportPreview(c.env, c.get("userId"), await c.req.text(), c.req.query("fileName") || "订阅列表.opml");
    return c.json({ success: true, data: await getImportJob(c.env, c.get("userId"), id) }, 201);
  } catch (error) {
    if (error instanceof OpmlParseError) return c.json({ success: false, error: error.message }, 400);
    throw error;
  }
});

app.post("/jobs/:id/confirm", async c => {
  const id = c.req.param("id");
  if (!await confirmImport(c.env, c.get("userId"), id)) return c.json({ success: false, error: "导入任务不存在" }, 404);
  try { await dispatchImportItems(c.env, id); }
  catch { console.warn(JSON.stringify({ event: "opml_dispatch_deferred", jobId: id })); }
  return c.json({ success: true, data: await getImportJob(c.env, c.get("userId"), id) }, 202);
});

// Existing raw-XML callers retain the import action; work now completes asynchronously.
app.post("/", async c => {
  try {
    const id = await createImportPreview(c.env, c.get("userId"), await c.req.text(), c.req.query("fileName") || "订阅列表.opml");
    await confirmImport(c.env, c.get("userId"), id);
    try { await dispatchImportItems(c.env, id); }
    catch { console.warn(JSON.stringify({ event: "opml_dispatch_deferred", jobId: id })); }
    return c.json({ success: true, data: await getImportJob(c.env, c.get("userId"), id) }, 202);
  } catch (error) {
    if (error instanceof OpmlParseError) return c.json({ success: false, error: error.message }, 400);
    throw error;
  }
});

export default app;
