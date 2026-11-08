import { articleIdForUrl } from "./FeedSyncService";
import { FeedFetchError } from "../lib/rss/feed-error";
import { and, asc, desc, eq, inArray, lt, sql, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { feeds, opmlImportItems, opmlImportJobs } from "../db/schema";
import { parseOpml, OpmlParseError } from "../lib/rss/opml";
import { normalizeFeedUrl } from "../lib/rss/public-fetch";
import { RSSFetcher } from "../lib/rss/fetcher";
import type { ParsedFeed } from "../lib/rss/parser";
import type { CloudflareEnv } from "../types";

export interface OpmlImportMessage { source: "opml-import"; itemId: string }
export class ImportRetry extends Error {
  constructor(readonly delaySeconds: number, readonly code: string) { super(code); }
}

export async function consumeImportMessage(env: CloudflareEnv, message: Pick<Message<OpmlImportMessage>, "body" | "ack" | "retry">,
  fetcher?: Pick<RSSFetcher, "fetch">) {
  try { await processImportItem(env, message.body.itemId, fetcher); message.ack(); }
  catch (error) {
    const retry = error instanceof ImportRetry ? error : new ImportRetry(60, "storage_or_runtime");
    console.warn(JSON.stringify({ event: "opml_item_retry", itemId: message.body.itemId,
      stage: "consume", errorCode: retry.code, delaySeconds: retry.delaySeconds }));
    message.retry({ delaySeconds: retry.delaySeconds });
  }
}

type Item = typeof opmlImportItems.$inferSelect;

function canonicalOrOriginal(url: string) {
  try { return normalizeFeedUrl(url); } catch { return url; }
}
function safeSiteUrl(url: string | undefined, fallback: string) {
  try { return normalizeFeedUrl(url || fallback); } catch { return fallback; }
}

export async function createImportPreview(env: CloudflareEnv, userId: string, xml: string, fileName: string) {
  const parsed = parseOpml(xml);
  if (!parsed.length) throw new OpmlParseError("文件中没有找到订阅源");
  const db = getDb(env.DB);
  const existing = await db.select({ url: feeds.feedUrl }).from(feeds).where(and(eq(feeds.userId, userId),isNull(feeds.unsubscribedAt)));
  const seen = new Set(existing.map(feed => canonicalOrOriginal(feed.url)));
  const jobId = crypto.randomUUID();
  const items = parsed.map((feed, position) => {
    let feedUrl = feed.xmlUrl;
    let status = "ready";
    let message: string | null = null;
    try {
      feedUrl = normalizeFeedUrl(feed.xmlUrl);
      if (seen.has(feedUrl)) { status = "skipped"; message = "已订阅或文件内重复"; }
      seen.add(feedUrl);
    } catch { status = "failed"; message = "订阅地址无效，需要公网 HTTP 或 HTTPS 地址"; }
    return { id: crypto.randomUUID(), jobId, position, title: feed.title, feedUrl,
      siteUrl: safeSiteUrl(feed.htmlUrl, feedUrl), folderName: feed.folderName ?? null, status, message };
  });
  const inserts = [env.DB.prepare("INSERT INTO opml_import_jobs(id,user_id,file_name,created_at) VALUES (?,?,?,?)")
    .bind(jobId, userId, fileName.slice(0, 120), Date.now())];
  // JSON batches stay within D1's parameter and per-invocation query limits.
  for (let offset = 0; offset < items.length; offset += 100) {
    inserts.push(env.DB.prepare(`INSERT INTO opml_import_items(id,job_id,position,title,feed_url,site_url,folder_name,status,message)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.jobId'),json_extract(value,'$.position'),json_extract(value,'$.title'),
      json_extract(value,'$.feedUrl'),json_extract(value,'$.siteUrl'),json_extract(value,'$.folderName'),json_extract(value,'$.status'),
      json_extract(value,'$.message') FROM json_each(?)`).bind(JSON.stringify(items.slice(offset, offset + 100))));
  }
  await env.DB.batch(inserts);
  return jobId;
}

export async function getImportJob(env: CloudflareEnv, userId: string, id: string) {
  const db = getDb(env.DB);
  const job = await db.select().from(opmlImportJobs).where(and(eq(opmlImportJobs.id, id), eq(opmlImportJobs.userId, userId))).get();
  if (!job) return null;
  const items = await db.select({ id: opmlImportItems.id, title: opmlImportItems.title, feedUrl: opmlImportItems.feedUrl,
    folderName: opmlImportItems.folderName, status: opmlImportItems.status, message: opmlImportItems.message })
    .from(opmlImportItems).where(eq(opmlImportItems.jobId, id)).orderBy(asc(opmlImportItems.position));
  const count = (status: string) => items.filter(item => item.status === status).length;
  return { ...job, items, total: items.length, imported: count("imported"), skipped: count("skipped"), failed: count("failed"),
    pending: count("pending") + count("processing"), ready: count("ready"),
    folderCount: new Set(items.map(item => item.folderName).filter(Boolean)).size };
}

export async function listImportJobs(env: CloudflareEnv, userId: string) {
  return getDb(env.DB).select().from(opmlImportJobs).where(eq(opmlImportJobs.userId, userId))
    .orderBy(desc(opmlImportJobs.createdAt)).limit(20);
}

export async function confirmImport(env: CloudflareEnv, userId: string, id: string) {
  const db = getDb(env.DB);
  const job = await db.select().from(opmlImportJobs).where(and(eq(opmlImportJobs.id, id), eq(opmlImportJobs.userId, userId))).get();
  if (!job) return false;
  await db.batch([
    db.update(opmlImportJobs).set({ status: "running", confirmedAt: Date.now() }).where(and(eq(opmlImportJobs.id, id), eq(opmlImportJobs.status, "preview"))),
    db.update(opmlImportItems).set({ status: "pending" }).where(and(eq(opmlImportItems.jobId, id), eq(opmlImportItems.status, "ready"))),
  ]);
  await finishImportJobs(env);
  return true;
}

export async function finishImportJobs(env: CloudflareEnv) {
  await getDb(env.DB).run(sql`UPDATE opml_import_jobs SET status='completed' WHERE status='running'
    AND NOT EXISTS (SELECT 1 FROM opml_import_items WHERE job_id=opml_import_jobs.id AND status IN ('ready','pending','processing'))`);
}

/** Durable pending rows also serve as an outbox if queue publication fails. */
export async function dispatchImportItems(env: CloudflareEnv, jobId?: string) {
  const db = getDb(env.DB);
  const now = Date.now();
  const backlog = await env.DB.prepare(`SELECT COUNT(*) AS pending, MIN(j.confirmed_at) AS oldest
    FROM opml_import_items i JOIN opml_import_jobs j ON j.id=i.job_id
    WHERE j.status='running' AND i.status IN ('pending','processing')`).first<{ pending: number; oldest: number | null }>();
  console.log(JSON.stringify({ event: "opml_backlog", pending: backlog?.pending ?? 0,
    oldestJobAgeMs: backlog?.oldest == null ? 0 : Math.max(0, now - backlog.oldest) }));
  const due = await db.select({ id: opmlImportItems.id }).from(opmlImportItems)
    .innerJoin(opmlImportJobs, eq(opmlImportJobs.id, opmlImportItems.jobId))
    .where(and(eq(opmlImportJobs.status, "running"), inArray(opmlImportItems.status, ["pending", "processing"]),
      lt(opmlImportItems.nextDispatchAt, now), lt(opmlImportItems.leaseUntil, now),
      jobId ? eq(opmlImportItems.jobId, jobId) : undefined)).orderBy(asc(opmlImportItems.nextDispatchAt)).limit(200);
  for (let offset = 0; offset < due.length; offset += 100) {
    const batch = due.slice(offset, offset + 100);
    // One JSON parameter for IDs leaves room for the timestamp under D1's 100-parameter limit.
    await db.update(opmlImportItems).set({ nextDispatchAt: now + 300_000 })
      .where(sql`${opmlImportItems.id} IN (SELECT value FROM json_each(${JSON.stringify(batch.map(item => item.id))}))`);
    try {
      await env.FEED_SYNC_QUEUE.sendBatch(batch.map(item => ({ body: { source: "opml-import", itemId: item.id }, contentType: "json" as const })));
      console.log(JSON.stringify({ event: "opml_batch_dispatched", stage: "queue_send", batchSize: batch.length, durationMs: Date.now() - now }));
    } catch (error) {
      console.error(JSON.stringify({ event: "opml_dispatch_failed", stage: "queue_send", errorCode: "queue_unavailable", batchSize: batch.length }));
      throw error;
    }
  }
  await finishImportJobs(env);
}

async function saveImportedFeed(env: CloudflareEnv, item: Item, userId: string, token: string, parsed: ParsedFeed, archivedID?: string) {
  const folderName = item.folderName?.trim() === "未分类" ? null : item.folderName;
  const feedId = archivedID ?? crypto.randomUUID();
  const folderId = crypto.randomUUID();
  const now = new Date().toISOString();
  const siteUrl = safeSiteUrl(parsed.siteUrl || item.siteUrl || undefined, item.feedUrl);
  const guard = "EXISTS (SELECT 1 FROM opml_import_items WHERE id=? AND lease_token=? AND status='processing')";
  const statements: D1PreparedStatement[] = [];
  if (folderName) {
    statements.push(env.DB.prepare(`INSERT INTO folders(id,user_id,name) SELECT ?,?,? WHERE ${guard}
      AND NOT EXISTS (SELECT 1 FROM folders WHERE user_id=? AND name=?)
      AND NOT EXISTS (SELECT 1 FROM feeds WHERE user_id=? AND feed_url=? AND unsubscribed_at IS NULL)`)
      .bind(folderId, userId, folderName, item.id, token, userId, folderName, userId, item.feedUrl));
  }
  statements.push(env.DB.prepare(`INSERT INTO feeds(id,user_id,folder_id,title,url,feed_url,description,favicon_url,last_fetched_at,next_fetch_at)
    SELECT ?,?,(SELECT id FROM folders WHERE user_id=? AND name=? ORDER BY id LIMIT 1),?,?,?,?,?,?,?
    WHERE ${guard} ON CONFLICT(feed_url,user_id) DO UPDATE SET unsubscribed_at=NULL,is_active=1,folder_id=excluded.folder_id,
      last_etag=NULL,last_modified=NULL,content_hash=NULL,next_fetch_at=excluded.next_fetch_at WHERE feeds.unsubscribed_at IS NOT NULL`)
    .bind(feedId, userId, userId, folderName, item.title || parsed.title || item.feedUrl, siteUrl, item.feedUrl,
      parsed.description || "", parsed.faviconUrl || new URL("/favicon.ico", siteUrl).href, now,
      new Date(Date.now() + 3_600_000).toISOString(), item.id, token));
  const initialArticles = parsed.articles.slice(0, 50);
  if (archivedID) statements.push(env.DB.prepare(`DELETE FROM expired_article_urls WHERE feed_id=? AND url IN (SELECT value FROM json_each(?)) AND ${guard}`)
    .bind(archivedID,JSON.stringify(initialArticles.map(a=>a.url)),item.id,token));
  const articleIDs = await Promise.all(initialArticles.map(a=>articleIdForUrl(feedId,a.url)));
  for (let offset = 0; offset < initialArticles.length; offset += 5) {
    const values: (string | null)[] = [];
    const selects = initialArticles.slice(offset, offset + 5).map((article,index) => {
      values.push(articleIDs[offset+index], userId, feedId, article.title, article.url, article.content,
        article.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), article.summary, article.author,
        article.imageUrl, article.publishedAt, feedId, item.id, token, feedId, article.url);
      return `SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM feeds WHERE id=?) AND ${guard} AND NOT EXISTS (SELECT 1 FROM articles WHERE feed_id=? AND url=?)`;
    });
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO articles(id,user_id,feed_id,title,url,content,content_text,summary,author,image_url,published_at)
      ${selects.join(" UNION ALL ")}`).bind(...values));
  }
  statements.push(env.DB.prepare(`UPDATE opml_import_items SET status=CASE WHEN EXISTS(SELECT 1 FROM feeds WHERE id=?) THEN 'imported' ELSE 'skipped' END,
    message=CASE WHEN EXISTS(SELECT 1 FROM feeds WHERE id=?) THEN NULL ELSE '已存在，保留已有订阅' END,
    lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=?`).bind(feedId, feedId, item.id, token));
  await env.DB.batch(statements);
}

export async function processImportItem(env: CloudflareEnv, id: string, fetcher: Pick<RSSFetcher, "fetch"> = new RSSFetcher()) {
  const db = getDb(env.DB);
  const item = await db.select().from(opmlImportItems).where(eq(opmlImportItems.id, id)).get();
  if (!item || !["pending", "processing"].includes(item.status)) { await finishImportJobs(env); return; }
  const job = await db.select().from(opmlImportJobs).where(and(eq(opmlImportJobs.id, item.jobId), eq(opmlImportJobs.status, "running"))).get();
  if (!job) return;
  if (item.leaseUntil > Date.now()) throw new ImportRetry(Math.max(1, Math.ceil((item.leaseUntil - Date.now()) / 1000)), "lease_wait");
  const token = crypto.randomUUID();
  const claimed = await db.update(opmlImportItems).set({ status: "processing", leaseToken: token, leaseUntil: Date.now() + 120_000,
    attempts: sql`${opmlImportItems.attempts} + 1` }).where(and(eq(opmlImportItems.id, id),
      inArray(opmlImportItems.status, ["pending", "processing"]), lt(opmlImportItems.leaseUntil, Date.now()))).returning();
  if (!claimed.length) return;
  if (claimed[0].attempts > 3) {
    await db.update(opmlImportItems).set({ status: "failed", message: "后台处理多次失败，请重新导入此订阅", leaseToken: null, leaseUntil: 0 })
      .where(and(eq(opmlImportItems.id, id), eq(opmlImportItems.leaseToken, token)));
    await finishImportJobs(env); return;
  }
  try {
    const existing = await db.select({ id: feeds.id, unsubscribedAt:feeds.unsubscribedAt }).from(feeds).where(and(eq(feeds.userId, job.userId), eq(feeds.feedUrl, item.feedUrl))).get();
    if (existing && !existing.unsubscribedAt) {
      await db.update(opmlImportItems).set({ status: "skipped", message: "已存在，保留已有订阅", leaseToken: null, leaseUntil: 0 })
        .where(and(eq(opmlImportItems.id, id), eq(opmlImportItems.leaseToken, token)));
    } else {
      let parsed: ParsedFeed;
      try { parsed = await fetcher.fetch(item.feedUrl, { maxAttempts: 1 }); }
      catch (error) {
        const failure = error instanceof FeedFetchError ? error : new FeedFetchError("invalid_feed", false);
        const attempt = claimed[0].attempts;
        if (failure.retryable && attempt < 3) {
          const delay = Math.max(failure.retryAfterSeconds, 60 * 2 ** (attempt - 1));
          const due = Date.now() + delay * 1000;
          await db.update(opmlImportItems).set({ status: "pending", message: "暂时无法抓取，稍后自动重试",
            leaseToken: null, leaseUntil: due, nextDispatchAt: due })
            .where(and(eq(opmlImportItems.id, id), eq(opmlImportItems.leaseToken, token)));
          console.warn(JSON.stringify({ event: "opml_fetch_retry", itemId: id, jobId: item.jobId,
            stage: "fetch", errorCode: failure.code, attempt, delaySeconds: delay }));
          throw new ImportRetry(delay, failure.code);
        }
        console.warn(JSON.stringify({ event: "opml_item_failed", itemId: id, jobId: item.jobId,
          stage: "fetch", errorCode: failure.code, attempt }));
        await db.update(opmlImportItems).set({ status: "failed", message: failure.retryable
          ? "多次抓取失败，请稍后重新导入" : "订阅地址或内容无法读取，请检查后重新导入", leaseToken: null, leaseUntil: 0 })
          .where(and(eq(opmlImportItems.id, id), eq(opmlImportItems.leaseToken, token)));
        await finishImportJobs(env); return;
      }
      await saveImportedFeed(env, item, job.userId, token, parsed, existing?.id);
    }
    await finishImportJobs(env);
  } catch (error) {
    if (error instanceof ImportRetry) throw error;
    console.error(JSON.stringify({ event: "opml_item_error", itemId: id, jobId: item.jobId,
      stage: "persist", errorCode: "storage_or_runtime", attempt: claimed[0].attempts }));
    await db.update(opmlImportItems).set({ status: "pending", leaseToken: null, leaseUntil: 0 })
      .where(and(eq(opmlImportItems.id, id), eq(opmlImportItems.leaseToken, token)));
    throw error;
  }
}
