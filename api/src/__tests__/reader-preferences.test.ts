import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { getDb } from "../db";
import { cleanupArticles } from "../lib/article-retention";
import settingsRoute from "../routes/settings";
import profileRoute from "../routes/profile";
import { createTestD1 } from "./helpers/d1";
import type { CloudflareEnv } from "../types";

vi.mock("../middleware/auth", () => ({ authMiddleware: async (c: { set: (key: string, value: string) => void }, next: () => Promise<void>) => { c.set("userId", "owner"); await next(); } }));
let database: ReturnType<typeof createTestD1>;
let env: CloudflareEnv;
const put = vi.fn();
const app = new Hono<{ Bindings: CloudflareEnv }>().route("/settings", settingsRoute).route("/profile", profileRoute);
beforeEach(() => {
  database = createTestD1();
  database.sqlite.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('owner','Owner','owner@test.invalid',0,0),('other','Other','other@test.invalid',0,0);
    INSERT INTO feeds(id,user_id,title,url,feed_url) VALUES ('f','owner','Feed','https://example.com','https://example.com/feed');
    INSERT INTO articles(id,user_id,feed_id,title,url,created_at) VALUES ('a','owner','f','Article','https://example.com/a',datetime('now','-120 days'));`);
  env = { DB: database.binding, COLLECT_R2: { put } } as unknown as CloudflareEnv;
});
afterEach(() => { database.close(); vi.clearAllMocks(); });
function request(path: string, body: unknown, method = "PUT") {
  return app.request('https://collect.test' + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, env);
}
it("cleans expired content and prevents feed polling from recreating it", async () => {
  expect(await cleanupArticles(getDb(env.DB))).toBe(1);
  database.sqlite.exec("INSERT INTO articles(id,user_id,feed_id,title,url) VALUES ('new-id','owner','f','Again','https://example.com/a')");
  expect(database.sqlite.prepare('SELECT count(*) AS n FROM articles').get().n).toBe(0);
  expect(database.sqlite.prepare('SELECT count(*) AS n FROM expired_article_urls').get().n).toBe(1);
  database.sqlite.exec("DELETE FROM feeds WHERE id='f'");
  expect(database.sqlite.prepare('SELECT count(*) AS n FROM expired_article_urls').get().n).toBe(0);
});
it("protects starred and later articles and grants grace when the last protection is removed", async () => {
  database.sqlite.exec("UPDATE articles SET is_starred=1,is_read_later=1 WHERE id='a'");
  expect(await cleanupArticles(getDb(env.DB))).toBe(0);
  database.sqlite.exec("UPDATE articles SET is_starred=0 WHERE id='a'");
  expect(database.sqlite.prepare("SELECT retention_grace_until AS grace FROM articles WHERE id='a'").get().grace).toBeNull();
  database.sqlite.exec("UPDATE articles SET is_read_later=0 WHERE id='a'");
  expect(await cleanupArticles(getDb(env.DB))).toBe(0);
  expect(database.sqlite.prepare("SELECT retention_grace_until > datetime('now','+6 days') AS protected FROM articles WHERE id='a'").get().protected).toBe(1);
});
it("honors the migration grace period and per-account expiry", async () => {
  database.sqlite.exec("UPDATE articles SET retention_grace_until=datetime('now','+30 days')");
  expect(await cleanupArticles(getDb(env.DB))).toBe(0);
  database.sqlite.exec("UPDATE articles SET retention_grace_until=NULL,created_at=datetime('now','-40 days'); INSERT INTO user_preferences(id,user_id,article_retention_days) VALUES ('prefs','owner',60)");
  expect(await cleanupArticles(getDb(env.DB))).toBe(0);
});
it("previews shortening, requires confirmation and rejects stale settings", async () => {
  const preview = await (await request('/settings/retention/preview', { days: 7 }, 'POST')).json() as {data: {count: number}};
  expect(preview.data.count).toBe(1);
  expect((await request('/settings/retention', {days:7,previousDays:30})).status).toBe(409);
  expect((await request('/settings/retention', {days:7,previousDays:30,confirmed:true})).status).toBe(200);
  expect((await request('/settings/retention', {days:60,previousDays:30})).status).toBe(409);
  expect((await request('/settings/retention', {days:120,previousDays:7})).status).toBe(400);
});
it("updates only the signed-in profile and rejects invalid avatar data", async () => {
  expect((await request('/profile', {name:' Reader ',id:'other'})).status).toBe(200);
  expect(database.sqlite.prepare("SELECT name FROM user WHERE id='owner'").get().name).toBe('Reader');
  expect(database.sqlite.prepare("SELECT name FROM user WHERE id='other'").get().name).toBe('Other');
  expect((await request('/profile', {name:'  '})).status).toBe(400);
  expect((await request('/profile/avatar', '<svg onload="alert(1)"></svg>', 'POST')).status).toBe(400);
  expect(put).not.toHaveBeenCalled();
});
