import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import nativeRoute from "../routes/native";
import { extractArticle } from "../lib/extractor";
vi.mock("../lib/extractor", () => ({ extractArticle: vi.fn() }));
import { nativeContent } from "../lib/native-content";
import { createTestD1 } from "./helpers/d1";
import type { CloudflareEnv } from "../types";
vi.mock("../middleware/auth", () => ({ authMiddleware: async (c: { set: (key: string, value: string) => void }, next: () => Promise<void>) => { c.set("userId", "owner"); await next(); } }));
let database: ReturnType<typeof createTestD1>;
const app = new Hono<{ Bindings: CloudflareEnv }>().route("/native", nativeRoute);
const request = (path: string, init?: RequestInit) => app.request(path, init, { DB: database.binding } as CloudflareEnv);
beforeEach(() => {
  database = createTestD1();
  database.sqlite.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('owner','Owner','owner@test.invalid',0,0),('other','Other','other@test.invalid',0,0);
    INSERT INTO feeds(id,user_id,title,url,feed_url) VALUES ('feed','owner','Feed','https://a.test','https://a.test/rss'),('other-feed','other','Other','https://b.test','https://b.test/rss');
    INSERT INTO articles(id,user_id,feed_id,title,url,content) VALUES ('a','owner','feed','Article','https://a.test/post','<p>Body</p>'),('b','other','other-feed','Private','https://b.test/post','private');`);
});
afterEach(() => { database.close(); vi.clearAllMocks(); });
const change = (field: string, value: boolean | number, version: number) => request("/native/articles/a", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, value, version }),
});
it("prefetches a body without marking it read and isolates owners", async () => {
  expect((await request("/native/articles/a")).status).toBe(200);
  expect(database.sqlite.prepare("SELECT is_read FROM articles WHERE id='a'").get()?.is_read).toBe(0);
  expect((await request("/native/articles/b")).status).toBe(404);
  const json = await (await request("/native/articles")).json() as { data: { articles: { id: string }[] } };
  expect(json.data.articles.map(a => a.id)).toEqual(["a"]);
});
it("detects stale updates including a field changing back to its old value", async () => {
  database.sqlite.exec("UPDATE articles SET is_read=1 WHERE id='a'; UPDATE articles SET is_read=0 WHERE id='a';");
  expect((await change("isRead", true, 0)).status).toBe(409);
  expect((await change("isStarred", true, 0)).status).toBe(200);
  expect(database.sqlite.prepare("SELECT read_version,star_version FROM articles WHERE id='a'").get()).toEqual({ read_version: 2, star_version: 1 });
});
it("returns the post-trigger revision for the next offline edit", async () => {
  const json = await (await change("isRead", true, 0)).json() as { data: { readVersion: number } };
  expect(json.data.readVersion).toBe(1);
  expect((await change("isRead", false, 1)).status).toBe(200);
  expect((await change("readingProgress", 70, 0)).status).toBe(200);
  expect(database.sqlite.prepare("SELECT is_read,reading_progress FROM articles WHERE id='a'").get()).toEqual({ is_read: 0, reading_progress: 70 });
});
it("rejects invalid values", async () => {
  expect((await change("isRead", 1, 0)).status).toBe(400);
  expect((await change("readingProgress", 101, 0)).status).toBe(400);
});
it("removes active content and resolves image URLs", () => {
  const result = nativeContent('<script>alert(1)</script><p onclick="bad()">Hello<img src="/image.png" onerror="bad()"><a href="javascript:bad()">link</a></p>', "https://a.test/article");
  expect(result.images).toEqual(["https://a.test/image.png"]);
  expect(result.content).not.toMatch(/script|onclick|onerror|javascript/);
});

it("extracts opted-in historical articles only when explicitly opened and preserves feed fallback", async () => {
  database.sqlite.exec("UPDATE feeds SET auto_extract=1 WHERE id='feed'");
  vi.mocked(extractArticle).mockResolvedValue({ title: 'Article', content: '<p>Full text</p>', excerpt: '' });
  await request('/native/articles/a');
  expect(extractArticle).not.toHaveBeenCalled();
  const body = await (await request('/native/articles/a?extract=true')).json() as {data:{content:string}};
  expect(body.data.content).toContain('Full text');
  expect(database.sqlite.prepare("SELECT is_read FROM articles WHERE id='a'").get().is_read).toBe(0);
  await request('/native/articles/a?extract=true');
  expect(extractArticle).toHaveBeenCalledTimes(1);
  database.sqlite.exec("UPDATE articles SET is_extracted=0,content='<p>Fallback</p>' WHERE id='a'");
  vi.mocked(extractArticle).mockRejectedValue(new Error('origin unavailable'));
  const fallback = await (await request('/native/articles/a?extract=true')).json() as {data:{content:string}};
  expect(fallback.data.content).toContain('Fallback');
});

type SyncPage = { cursor: number; hasMore: boolean; articles: Array<{id:string; isRead:boolean; content?:string; contentVersion:number}>; feeds: Array<{id:string}>; folders: Array<{id:string}>; deleted: Array<{kind:string; id:string}>; preferences?: {articleRetentionDays:number} };
async function pull(after = 0) {
  const response = await request(`/native/sync?after=${after}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as {data: SyncPage}).data;
}
it("bootstraps owned metadata, then returns no unchanged data", async () => {
  const first = await pull();
  expect(first.articles.map(a => a.id)).toEqual(['a']);
  expect(first.articles[0].content).toBeUndefined();
  expect(first.feeds.map(f => f.id)).toEqual(['feed']);
  expect(first.preferences?.articleRetentionDays).toBe(30);
  const second = await pull(first.cursor);
  expect(second).toEqual({cursor:first.cursor, hasMore:false, articles:[], feeds:[], folders:[], deleted:[]});
});
it("coalesces edits and ignores feed scheduler updates and no-op writes", async () => {
  const initial = await pull();
  database.sqlite.exec("UPDATE feeds SET last_fetched_at=datetime('now'),last_etag='new' WHERE id='feed'; UPDATE articles SET is_read=is_read WHERE id='a';");
  expect((await pull(initial.cursor)).cursor).toBe(initial.cursor);
  database.sqlite.exec("UPDATE articles SET is_read=1 WHERE id='a'; UPDATE articles SET is_read=0 WHERE id='a'; UPDATE articles SET is_read=1 WHERE id='a';");
  const updated = await pull(initial.cursor);
  expect(updated.articles).toHaveLength(1);
  expect(updated.articles[0].isRead).toBe(true);
  expect(updated.feeds).toEqual([]);
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM native_changes WHERE kind='article' AND entity_id='a'").get().n).toBe(1);
});
it("delivers deletion tombstones including cascade deletions and safely deletes accounts", async () => {
  const first = await pull();
  database.sqlite.exec("PRAGMA foreign_keys=ON; DELETE FROM feeds WHERE id='feed';");
  const next = await pull(first.cursor);
  expect(next.deleted).toEqual(expect.arrayContaining([{kind:'article',id:'a'},{kind:'feed',id:'feed'}]));
  expect(next.articles).toEqual([]);
  database.sqlite.exec("DELETE FROM user WHERE id='other';");
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM native_changes WHERE user_id='other'").get().n).toBe(0);
});
it("continues keyset changes while earlier rows are edited between pages", async () => {
  const insert = database.sqlite.prepare("INSERT INTO articles(id,user_id,feed_id,title,url) VALUES (?, 'owner','feed','Title',?)");
  for (let i=0;i<230;i++) insert.run(`item-${i}`, `https://a.test/${i}`);
  const first = await pull();
  expect(first.hasMore).toBe(true);
  const changedID = first.articles[0].id;
  database.sqlite.prepare("UPDATE articles SET is_read=1 WHERE id=?").run(changedID);
  const second = await pull(first.cursor);
  expect(second.articles.find(a => a.id === changedID)?.isRead).toBe(true);
  expect(second.hasMore).toBe(false);
  expect(new Set([...first.articles,...second.articles].map(a => a.id)).size).toBe(231);
});
it("tracks content and settings changes and returns lightweight mutation receipts", async () => {
  const first = await pull();
  database.sqlite.exec("UPDATE articles SET content='<p>Changed</p>' WHERE id='a';");
  const changed = await pull(first.cursor);
  expect(changed.articles[0].contentVersion).toBe(1);
  database.sqlite.exec("INSERT INTO user_preferences(id,user_id,article_retention_days) VALUES ('prefs','owner',60);");
  const preferences = await pull(changed.cursor);
  expect(preferences.preferences?.articleRetentionDays).toBe(60);
  expect(preferences.articles.map(a => a.id)).toEqual(['a']);
  const receipt = await (await change('isRead',true,0)).json() as {data: {content?:string; readVersion:number}};
  expect(receipt.data.content).toBeUndefined();
  expect(receipt.data.readVersion).toBe(1);
  expect((await request('/native/sync?after=-1')).status).toBe(400);
  expect((await request('/native/sync?after=bad')).status).toBe(400);
});
