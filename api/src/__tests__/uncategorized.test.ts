import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import articlesRoute from "../routes/articles";
import { createTestD1 } from "./helpers/d1";
import type { CloudflareEnv } from "../types";

vi.mock("../middleware/auth", () => ({ authMiddleware: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => { c.set("userId", "owner"); await next(); } }));
const db = createTestD1();
afterEach(() => db.close());

it("merges existing folders while preserving feeds and articles, then filters unfiled articles", async () => {
  db.sqlite.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('owner','Owner','owner@test.invalid',0,0);
    INSERT INTO folders(id,user_id,name) VALUES ('old','owner','未分类'),('keep','owner','科技');
    INSERT INTO feeds(id,user_id,folder_id,title,url,feed_url) VALUES ('a','owner','old','A','https://a.test','https://a.test/rss'),('b','owner','keep','B','https://b.test','https://b.test/rss');
    INSERT INTO articles(id,user_id,feed_id,title,url) VALUES ('aa','owner','a','A','https://a.test/a'),('bb','owner','b','B','https://b.test/b');`);
  db.sqlite.exec(readFileSync(new URL("../../drizzle/migrations/0005_merge_uncategorized_folders.sql", import.meta.url), "utf8"));
  expect(db.sqlite.prepare("SELECT folder_id FROM feeds WHERE id='a'").get()).toEqual({ folder_id: null });
  expect(db.sqlite.prepare("SELECT count(*) AS n FROM folders WHERE id='old'").get()?.n).toBe(0);
  const app = new Hono<{ Bindings: CloudflareEnv }>().route("/articles", articlesRoute);
  const response = await app.request("/articles?uncategorized=true", {}, { DB: db.binding } as CloudflareEnv);
  const json = await response.json() as { data: { articles: { id: string }[]; total: number } };
  expect(json.data.total).toBe(1);
  expect(json.data.articles.map(a => a.id)).toEqual(["aa"]);
});
