import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import articles from "../routes/articles";
import articlesV2 from "../routes/v2/articles";
import settings from "../routes/settings";
import folders from "../routes/folders";
import { nativeSyncPage } from "../lib/native-sync";
import { getDb } from "../db";
import { createTestD1 } from "./helpers/d1";
import type { CloudflareEnv } from "../types";

vi.mock("../middleware/auth", () => ({ authMiddleware: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => { c.set("userId", "owner"); await next(); } }));
const app = new Hono<{ Bindings: CloudflareEnv }>().route("/articles", articles)
  .route("/v2", articlesV2).route("/settings", settings).route("/folders", folders);
let db: ReturnType<typeof createTestD1>;
let env: CloudflareEnv;
beforeEach(() => {
  db = createTestD1();
  env = { DB: db.binding } as CloudflareEnv;
  db.sqlite.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('owner','O','o@test',0,0),('other','X','x@test',0,0);
    INSERT INTO folders(id,user_id,name) VALUES ('folder','owner','F'),('foreign','other','X');
    INSERT INTO feeds(id,user_id,title,url,feed_url,folder_id) VALUES ('f','owner','F','https://f','https://f/rss','folder'),('outside','owner','O','https://o','https://o/rss',NULL),('x','other','X','https://x','https://x/rss','foreign');`);
  const insert = db.sqlite.prepare('INSERT INTO articles(id,user_id,feed_id,title,url,published_at) VALUES (?,?,?,?,?,?)');
  for (const [id, date] of [['a','2026-01-01T00:00:00Z'],['b','2026-01-01T00:00:00Z'],['c','2026-01-02T01:00:00+01:00'],['d',null],['e','invalid']]) {
    insert.run(id,'owner','f',id,`https://f/${id}`,date);
  }
  insert.run('other','other','x','Other','https://x/a',null);
  insert.run('outside','owner','outside','Outside','https://o/a',null);
});
afterEach(() => db.close());
const request = (path: string, body: unknown, method = 'PUT') => app.request(`https://test${path}`, {method,headers:{'content-type':'application/json'},body:JSON.stringify(body)},env);
it('persists isolated preferences and publishes subsequent changes to native sync', async () => {
  expect((await request('/settings/article-sort',{articleSortOrder:'asc'})).status).toBe(200);
  const first = await nativeSyncPage(getDb(env.DB),'owner',0);
  expect(first.preferences?.articleSortOrder).toBe('asc');
  await request('/settings/article-sort',{articleSortOrder:'desc'});
  const next = await nativeSyncPage(getDb(env.DB),'owner',first.cursor);
  expect(next.preferences?.articleSortOrder).toBe('desc');
  expect(db.sqlite.prepare("SELECT count(*) AS n FROM user_preferences WHERE user_id='other'").get().n).toBe(0);
  expect((await request('/settings/article-sort',{articleSortOrder:'bad'})).status).toBe(400);
});
it.each(['asc','desc'])('keeps offset and cursor pages stable in %s order including invalid dates', async order => {
  await request('/settings/article-sort',{articleSortOrder:order});
  const expected = order === 'asc' ? ['a','b','c','d','e'] : ['c','b','a','e','d'];
  const offsetIDs: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const result = await (await app.request(`https://test/articles?feedId=f&pageSize=2&page=${page}`,{},env)).json() as {data:{articles:{id:string}[]}};
    offsetIDs.push(...result.data.articles.map(a => a.id));
  }
  expect(offsetIDs).toEqual(expected);
  const cursorIDs: string[] = [];
  let cursor: string | null = null;
  do {
    const result = await (await app.request(`https://test/v2?feedId=f&limit=2${cursor ? '&cursor='+encodeURIComponent(cursor):''}`,{},env)).json() as {data:{items:{id:string}[];pagination:{nextCursor:string|null}}};
    cursorIDs.push(...result.data.items.map(a => a.id));
    cursor = result.data.pagination.nextCursor;
  } while (cursor);
  expect(cursorIDs).toEqual(expected);
});
it('marks the complete folder atomically and preserves other folders and accounts', async () => {
  for (let i = 0; i < 150; i++) db.sqlite.prepare("INSERT INTO articles(id,user_id,feed_id,title,url) VALUES (?,'owner','f','A',?)").run(`bulk-${i}`,`https://f/bulk-${i}`);
  const response = await request('/folders/folder/mark-all-read',{},'POST');
  expect(response.status).toBe(200);
  const receipt = await response.json() as {data:{articles:{id:string;isRead:boolean;readVersion:number}[]}};
  expect(receipt.data.articles).toHaveLength(155);
  expect(receipt.data.articles.every(article => article.isRead && article.readVersion > 0)).toBe(true);
  expect(db.sqlite.prepare("SELECT count(*) AS n FROM articles WHERE feed_id='f' AND is_read=0").get().n).toBe(0);
  expect(db.sqlite.prepare("SELECT count(*) AS n FROM articles WHERE feed_id!='f' AND is_read=0").get().n).toBe(2);
  expect((await request('/folders/foreign/mark-all-read',{},'POST')).status).toBe(404);
  expect((await request('/folders/folder/mark-all-read',{},'POST')).status).toBe(200);
});
it('lists articles for accounts and folders with more than 100 subscriptions', async () => {
  for (let index = 0; index < 119; index++) {
    db.sqlite.prepare("INSERT INTO feeds(id,user_id,title,url,feed_url,folder_id) VALUES (?,'owner','Many',?,?,'folder')").run(`feed-${index}`,`https://feed-${index}.test`,`https://feed-${index}.test/rss`);
  }
  for (const query of ['', '?folderId=folder', '?filter=starred']) {
    const result = await app.request(`https://test/articles${query}`,{},env);
    expect(result.status).toBe(200);
  }
});

it.each(['asc', 'desc'])('continues unread reading after a cursor without skipping when earlier items become read (%s)', async sort => {
  const expected = sort === 'asc' ? ['a','b','c','d','e'] : ['c','b','a','e','d'];
  const ids: string[] = [];
  let after: string | null = null;
  do {
    const query = new URLSearchParams({ folderId: 'folder', sort, hideRead: 'true', pageSize: '2' });
    if (after) query.set('after', after);
    const response = await app.request(`https://test/articles?${query}`, {}, env);
    expect(response.status).toBe(200);
    const result = await response.json() as {data:{articles:{id:string;publishedAt:string|null}[];total:number}};
    ids.push(...result.data.articles.map(item => item.id));
    for (const item of result.data.articles) db.sqlite.prepare('UPDATE articles SET is_read=1 WHERE id=?').run(item.id);
    const last = result.data.articles.at(-1);
    after = last && result.data.total > result.data.articles.length ? JSON.stringify({id:last.id,publishedAt:last.publishedAt}) : null;
  } while (after);
  expect(ids).toEqual(expected);
});
it('rejects malformed reading cursors and preserves feed ownership', async () => {
  expect((await app.request('https://test/articles?after=broken', {}, env)).status).toBe(400);
  const query = new URLSearchParams({ feedId: 'x', after: JSON.stringify({id:'a',publishedAt:null}) });
  const result = await (await app.request(`https://test/articles?${query}`, {}, env)).json() as {data:{articles:unknown[]}};
  expect(result.data.articles).toEqual([]);
});
