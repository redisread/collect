import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { generateOpml, parseOpml } from "../lib/rss/opml";
import { confirmImport, createImportPreview, dispatchImportItems, getImportJob, processImportItem } from "../services/OpmlImportService";
import opmlRoute from "../routes/opml";
import { createTestD1 } from "./helpers/d1";
import type { CloudflareEnv } from "../types";
import type { ParsedFeedWithMeta } from "../services/FeedSyncService";

vi.mock("../middleware/auth", () => ({ authMiddleware: async (c: { set: (key: string, value: string) => void }, next: () => Promise<void>) => { c.set("userId", "owner"); await next(); } }));
let database: ReturnType<typeof createTestD1>;
let env: CloudflareEnv;
const app = new Hono<{ Bindings: CloudflareEnv }>().route("/opml", opmlRoute);
const file = (outlines: string) => `<opml version="2.0"><body>${outlines}</body></opml>`;
const source = (url: string, title = "Feed") => `<outline text="${title}" xmlUrl="${url}"/>`;
const parsed: ParsedFeedWithMeta = { title: "Fetched title", description: "Feed", siteUrl: "https://example.com", faviconUrl: null, articles: [
  { title: "Article", url: "https://example.com/article", content: "<p>Content</p>", summary: "Content", author: "Author", imageUrl: null, publishedAt: null, guid: "article" },
] };
beforeEach(() => {
  database = createTestD1();
  database.sqlite.exec("INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('owner','Owner','owner@test.invalid',0,0),('other','Other','other@test.invalid',0,0)");
  env = { DB: database.binding, FEED_SYNC_QUEUE: { sendBatch: vi.fn().mockResolvedValue(undefined) } } as unknown as CloudflareEnv;
});
afterEach(() => { database.close(); vi.unstubAllGlobals(); });

it("round-trips escaped URLs and titles and maps nested siblings to full folder paths", () => {
  const xml = generateOpml([{ title: "Title & text", feedUrl: "https://example.com/rss?a=1&b=2", url: "https://example.com", folderName: "Tech & News" }]);
  expect(parseOpml(xml)).toEqual([{ title: "Title & text", xmlUrl: "https://example.com/rss?a=1&b=2", htmlUrl: "https://example.com", folderName: "Tech & News" }]);
  expect(parseOpml(file(`<outline text="科技"><outline text="AI">${source("https://example.com/a")}</outline>${source("https://example.com/b")}</outline>${source("https://example.com/c")}`)).map(item => item.folderName))
    .toEqual(["科技 / AI", "科技", undefined]);
  expect(() => parseOpml('<opml><body><outline xmlUrl="https://example.com"')).toThrow();
  expect(() => parseOpml('<!DOCTYPE opml [<!ENTITY x SYSTEM "file:///secret">]><opml><body/></opml>')).toThrow();
  expect(() => parseOpml("<other><body/></other>")).toThrow();
});

it("previews without creating subscriptions, skips duplicates, and validates account ownership", async () => {
  database.sqlite.exec("INSERT INTO feeds(id,user_id,title,url,feed_url) VALUES ('existing','owner','Keep','https://example.com','https://example.com/rss')");
  const id = await createImportPreview(env, "owner", file(source("https://example.com/rss") + source("https://EXAMPLE.com/new") + source("https://example.com/new") + source("file:///secret")), "test.opml");
  expect(await getImportJob(env, "owner", id)).toMatchObject({ total: 4, ready: 1, skipped: 2, failed: 1, status: "preview" });
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM feeds").get().n).toBe(1);
  expect(await getImportJob(env, "other", id)).toBeNull();
  expect(await confirmImport(env, "other", id)).toBe(false);
  expect((await app.request(`https://collect.test/opml/jobs/missing/confirm`, { method: "POST" }, env)).status).toBe(404);
});

it("imports successful sources from the same site atomically and leaves failed folders absent", async () => {
  const xml = file(`<outline text="Good">${source("https://example.com/a")}${source("https://example.com/b")}</outline><outline text="Bad">${source("https://example.com/bad")}</outline>`);
  const id = await createImportPreview(env, "owner", xml, "test.opml");
  await confirmImport(env, "owner", id);
  const job = (await getImportJob(env, "owner", id))!;
  const fetcher = { fetch: vi.fn().mockImplementation(async url => { if (url.endsWith("/bad")) throw new Error("private error"); return parsed; }) };
  for (const item of job.items) await processImportItem(env, item.id, fetcher);
  expect(await getImportJob(env, "owner", id)).toMatchObject({ status: "completed", imported: 2, failed: 1, folderCount: 2 });
  expect(database.sqlite.prepare("SELECT name FROM folders").all()).toEqual([{ name: "Good" }]);
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM articles").get().n).toBe(2);
  await processImportItem(env, job.items[0].id, fetcher);
  expect(fetcher.fetch).toHaveBeenCalledTimes(3);
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM articles").get().n).toBe(2);
});

it("rechecks duplicates after preview and recovers queue publication failure from the outbox", async () => {
  const id = await createImportPreview(env, "owner", file(source("https://example.com/a")), "test.opml");
  await confirmImport(env, "owner", id);
  vi.mocked(env.FEED_SYNC_QUEUE.sendBatch).mockRejectedValueOnce(new Error("queue down"));
  await expect(dispatchImportItems(env, id)).rejects.toThrow();
  database.sqlite.exec("UPDATE opml_import_items SET next_dispatch_at=0");
  await dispatchImportItems(env);
  expect(env.FEED_SYNC_QUEUE.sendBatch).toHaveBeenCalledTimes(2);
  database.sqlite.exec("INSERT INTO feeds(id,user_id,title,url,feed_url) VALUES ('existing','owner','Keep','https://example.com','https://example.com/a')");
  const fetcher = { fetch: vi.fn().mockResolvedValue(parsed) };
  const item = (await getImportJob(env, "owner", id))!.items[0];
  await processImportItem(env, item.id, fetcher);
  expect(fetcher.fetch).not.toHaveBeenCalled();
  expect(await getImportJob(env, "owner", id)).toMatchObject({ skipped: 1, imported: 0 });
  expect(database.sqlite.prepare("SELECT title FROM feeds").get().title).toBe("Keep");
});

it("rolls back a failed article write and retries without creating duplicate feeds or folders", async () => {
  const id = await createImportPreview(env, "owner", file(`<outline text="Folder">${source("https://example.com/a")}</outline>`), "test.opml");
  await confirmImport(env, "owner", id);
  const item = (await getImportJob(env, "owner", id))!.items[0];
  database.sqlite.exec("CREATE TRIGGER fail_article BEFORE INSERT ON articles BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  const fetcher = { fetch: vi.fn().mockResolvedValue(parsed) };
  await expect(processImportItem(env, item.id, fetcher)).rejects.toThrow();
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM feeds").get().n).toBe(0);
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM folders").get().n).toBe(0);
  database.sqlite.exec("DROP TRIGGER fail_article");
  await processImportItem(env, item.id, fetcher);
  expect(await getImportJob(env, "owner", id)).toMatchObject({ imported: 1, status: "completed" });
});

it("handles 1000-item previews within D1 binding limits", async () => {
  const id = await createImportPreview(env, "owner", file(Array.from({ length: 1000 }, (_, i) => source(`https://example.com/${i}`)).join("")), "large.opml");
  expect((await getImportJob(env, "owner", id))?.ready).toBe(1000);
  expect(() => parseOpml(file(Array.from({ length: 1001 }, (_, i) => source(`https://example.com/${i}`)).join("")))).toThrow("1000");
});

it("deduplicates two concurrently fetched copies and creates only the winning folder", async () => {
  const first = await createImportPreview(env, "owner", file(`<outline text="First">${source("https://example.com/same")}</outline>`), "first.opml");
  const second = await createImportPreview(env, "owner", file(`<outline text="Second">${source("https://example.com/same")}</outline>`), "second.opml");
  await confirmImport(env, "owner", first); await confirmImport(env, "owner", second);
  const firstItem = (await getImportJob(env, "owner", first))!.items[0];
  const secondItem = (await getImportJob(env, "owner", second))!.items[0];
  const finish: ((feed: ParsedFeedWithMeta) => void)[] = [];
  const fetcher = { fetch: vi.fn().mockImplementation(() => new Promise<ParsedFeedWithMeta>(resolve => finish.push(resolve))) };
  const pending = [processImportItem(env, firstItem.id, fetcher), processImportItem(env, secondItem.id, fetcher)];
  await vi.waitFor(() => expect(finish).toHaveLength(2));
  finish[0](parsed); finish[1](parsed); await Promise.all(pending);
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM feeds").get().n).toBe(1);
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM folders").get().n).toBe(1);
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM articles").get().n).toBe(1);
  expect([(await getImportJob(env, "owner", first))!.imported, (await getImportJob(env, "owner", second))!.imported].sort()).toEqual([0, 1]);
});

it("imports fifty initial articles without exceeding D1 bound parameters", async () => {
  const id = await createImportPreview(env, "owner", file(source("https://example.com/a")), "test.opml");
  await confirmImport(env, "owner", id);
  const item = (await getImportJob(env, "owner", id))!.items[0];
  await processImportItem(env, item.id, { fetch: vi.fn().mockResolvedValue({ ...parsed, articles: Array.from({ length: 50 }, (_, i) => ({ ...parsed.articles[0], url: `https://example.com/article/${i}` })) }) });
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM articles").get().n).toBe(50);
});
