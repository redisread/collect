import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../db";
import { FeedSyncService, type ParsedFeedWithMeta } from "../services/FeedSyncService";

type Statement = {
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): { changes: number | bigint };
};
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
};
// Node 24 is used by CI. This local interface avoids changing production Node typings.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};
const databases: SqliteDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function setup(articleCount = 1) {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  sqlite.exec(readFileSync(new URL("../../drizzle/migrations/0000_complete_schema.sql", import.meta.url), "utf8"));
  sqlite.exec("INSERT INTO user (id,name,email,created_at,updated_at) VALUES ('user-1','Test','test@example.invalid',0,0)");
  sqlite.exec("INSERT INTO feeds (id,user_id,title,url,feed_url) VALUES ('feed-1','user-1','Feed','https://example.invalid','https://example.invalid/rss')");
  const parameterCounts: number[] = [];
  const d1 = {
    prepare(query: string) {
      return {
        bind(...params: unknown[]) {
          parameterCounts.push(params.length);
          if (params.length > 100) throw new Error("D1 parameter limit exceeded");
          const statement = sqlite.prepare(query);
          return {
            async raw() { return statement.all(...params).map(Object.values); },
            async all() { return { results: statement.all(...params) }; },
            async run() { return { meta: { changes: Number(statement.run(...params).changes) } }; },
          };
        },
      };
    },
  } as unknown as D1Database;
  const feed: ParsedFeedWithMeta = {
    title: "Feed", siteUrl: "https://example.invalid", description: "", faviconUrl: null,
    articles: Array.from({ length: articleCount }, (_, index) => ({
      title: `Article ${index}`, url: `https://example.invalid/${index}`, content: "Text",
      summary: "", author: "", imageUrl: null, publishedAt: null, guid: `article-${index}`,
    })),
  };
  const fetcher = { fetch: vi.fn().mockResolvedValue(feed) };
  const kv = { get: vi.fn().mockResolvedValue("[]"), put: vi.fn(), delete: vi.fn() } as unknown as KVNamespace;
  const service = new FeedSyncService(getDb(d1), kv, fetcher);
  return { sqlite, parameterCounts, service, fetcher, feed };
}

describe("FeedSyncService Queue delivery", () => {
  it("deduplicates concurrent deliveries and repeated messages without double-counting", async () => {
    const { service, sqlite } = setup();
    const results = await Promise.all([service.syncQueuedFeed("feed-1"), service.syncQueuedFeed("feed-1")]);
    expect(results.every((result) => !result.error)).toBe(true);
    expect(results.reduce((total, result) => total + (result.newArticles ?? 0), 0)).toBe(1);
    expect((await service.syncQueuedFeed("feed-1")).newArticles).toBe(0);
    expect(sqlite.prepare("SELECT count(*) AS count FROM articles").all()[0].count).toBe(1);
    expect(sqlite.prepare("SELECT cached_article_count, cached_unread_count FROM feeds").all()[0])
      .toEqual({ cached_article_count: 1, cached_unread_count: 1 });
  });

  it("preserves legacy random-ID articles even when KV contains stale URL data", async () => {
    const { service, sqlite } = setup();
    sqlite.exec("INSERT INTO articles (id,user_id,feed_id,title,url,is_read) VALUES ('legacy-id','user-1','feed-1','Existing','https://example.invalid/0',1)");
    expect((await service.syncQueuedFeed("feed-1")).newArticles).toBe(0);
    expect(sqlite.prepare("SELECT id FROM articles").all()).toEqual([{ id: "legacy-id" }]);
    expect(sqlite.prepare("SELECT cached_article_count, cached_unread_count FROM feeds").all()[0])
      .toEqual({ cached_article_count: 1, cached_unread_count: 0 });
  });

  it("chunks a full feed below D1's bound-parameter limit", async () => {
    const { service, parameterCounts } = setup(100);
    const result = await service.syncQueuedFeed("feed-1");
    expect(result.error).toBeUndefined();
    expect(result.newArticles).toBe(100);
    expect(Math.max(...parameterCounts)).toBeLessThanOrEqual(100);
  });

  it("retains conditional request metadata after a 304 response", async () => {
    const { service, sqlite, fetcher, feed } = setup();
    sqlite.exec("UPDATE feeds SET last_etag = 'etag', last_modified = 'date', content_hash = 'hash'");
    fetcher.fetch.mockResolvedValue({ ...feed, notModified: true });
    expect((await service.syncQueuedFeed("feed-1")).error).toBeUndefined();
    expect(sqlite.prepare("SELECT last_etag,last_modified,content_hash FROM feeds").all()[0])
      .toEqual({ last_etag: "etag", last_modified: "date", content_hash: "hash" });
  });
});
