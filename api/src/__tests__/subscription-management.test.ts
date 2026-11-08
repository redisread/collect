import feedsV2Route from "../routes/v2/feeds";
import { saveSubscription } from "../services/SubscriptionCreation";
import { feeds } from "../db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import feedsRoute from "../routes/feeds";
import foldersRoute from "../routes/folders";
import { getDb } from "../db";
import { nativeSyncPage } from "../lib/native-sync";
import { createTestD1 } from "./helpers/d1";
import { RSSFetcher } from "../lib/rss/fetcher";
import {
  createImportPreview,
  confirmImport,
  processImportItem,
  getImportJob,
} from "../services/OpmlImportService";
import type { CloudflareEnv } from "../types";
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (
    c: { set: (key: string, value: string) => void },
    next: () => Promise<void>,
  ) => {
    c.set("userId", "owner");
    await next();
  },
}));
vi.mock("../lib/rss/fetcher", () => ({
  RSSFetcher: class {
    fetch = vi.fn().mockResolvedValue({
      title: "Discovered",
      siteUrl: "https://example.com",
      description: "",
      faviconUrl: null,
      articles: [
        { title: "Old", url: "https://example.com/ordinary", content: "Body" },
        { title: "Saved", url: "https://example.com/star", content: "Saved" },
        { title: "New", url: "https://example.com/new", content: "New" },
      ].map((a) => ({
        ...a,
        summary: "",
        author: "",
        imageUrl: null,
        publishedAt: null,
      })),
    });
  },
}));
vi.mock("../lib/rss/parser", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  discoverFeedUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock("../lib/cache/CacheManager", () => ({
  CacheManager: class {
    invalidateUser = vi.fn().mockResolvedValue(undefined);
  },
}));
let database: ReturnType<typeof createTestD1>;
let env: CloudflareEnv;
const app = new Hono<{ Bindings: CloudflareEnv }>()
  .route("/feeds", feedsRoute)
  .route("/folders", foldersRoute)
  .route("/v2/feeds", feedsV2Route);
const request = (path: string, body?: unknown, method = "POST") =>
  app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
beforeEach(() => {
  database = createTestD1();
  env = { DB: database.binding } as CloudflareEnv;
  database.sqlite.exec(`PRAGMA foreign_keys=ON;
 INSERT INTO user(id,name,email,created_at,updated_at) VALUES('owner','Owner','owner@test.invalid',0,0),('other','Other','other@test.invalid',0,0);
 INSERT INTO folders(id,user_id,name) VALUES('folder','owner','Folder'),('second','owner','Second'),('private','other','Private');
 INSERT INTO feeds(id,user_id,title,url,feed_url,folder_id) VALUES('f','owner','Feed','https://example.com','https://example.com/rss','folder'),('g','owner','Other feed','https://other.example.com','https://other.example.com/rss',NULL),('private','other','Private','https://private.example.com','https://private.example.com/rss','private');
 INSERT INTO articles(id,user_id,feed_id,title,url,is_starred,is_read_later) VALUES('ordinary','owner','f','Ordinary','https://example.com/ordinary',0,0),('star','owner','f','Star','https://example.com/star',1,0),('later','owner','f','Later','https://example.com/later',0,1);`);
});
afterEach(() => {
  database.close();
  vi.clearAllMocks();
});
it("keeps saved articles and source attribution, stops late inserts and syncs the archive", async () => {
  const before = await nativeSyncPage(getDb(env.DB), "owner", 0);
  const response = await request("/feeds/f", undefined, "DELETE");
  expect(response.status).toBe(200);
  const result = (await response.json()) as {
    data: { feeds: { unsubscribedAt: string }[]; articles: { id: string }[] };
  };
  expect(result.data.articles.map((a) => a.id).sort()).toEqual([
    "later",
    "star",
  ]);
  expect(result.data.feeds[0].unsubscribedAt).toBeTruthy();
  expect(
    database.sqlite
      .prepare("SELECT is_active,folder_id FROM feeds WHERE id='f'")
      .get(),
  ).toEqual({ is_active: 0, folder_id: null });
  database.sqlite.exec(
    "INSERT INTO articles(id,user_id,feed_id,title,url) VALUES('late','owner','f','Late','https://example.com/late')",
  );
  expect(
    database.sqlite.prepare("SELECT id FROM articles WHERE id='late'").get(),
  ).toBeUndefined();
  const changes = await nativeSyncPage(getDb(env.DB), "owner", before.cursor);
  expect(changes.deleted).toContainEqual({ kind: "article", id: "ordinary" });
  expect(changes.feeds.find((f) => f.id === "f")?.unsubscribedAt).toBeTruthy();
  expect((await request("/feeds/f", undefined, "DELETE")).status).toBe(200);
});
it("moves selected owned subscriptions atomically and rejects foreign targets or mixed owners", async () => {
  expect(
    (
      await request("/feeds/batch/move", {
        ids: ["f", "g"],
        folderId: "second",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request("/feeds/batch/move", {
        ids: ["f", "private"],
        folderId: "folder",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request("/feeds/batch/move", {
        ids: ["f", "g"],
        folderId: "private",
      })
    ).status,
  ).toBe(409);
  expect(
    database.sqlite.prepare("SELECT folder_id FROM feeds WHERE id='f'").get()
      .folder_id,
  ).toBe("second");
  expect(
    (await request("/feeds/batch/unsubscribe", { ids: ["f", "private"] }))
      .status,
  ).toBe(404);
  expect(
    database.sqlite
      .prepare("SELECT unsubscribed_at FROM feeds WHERE id='f'")
      .get().unsubscribed_at,
  ).toBeNull();
  expect(
    (await request("/feeds/batch/move", { ids: ["f", "f"], folderId: null }))
      .status,
  ).toBe(400);
});
it("persists folder order and folder deletion only removes grouping", async () => {
  expect(
    (await request("/folders/reorder", { ids: ["second", "folder"] })).status,
  ).toBe(200);
  expect(
    database.sqlite
      .prepare(
        "SELECT id FROM folders WHERE user_id='owner' ORDER BY sort_order",
      )
      .all()
      .map((r: { id: string }) => r.id),
  ).toEqual(["second", "folder"]);
  expect(
    (await request("/folders/reorder", { ids: ["folder", "private"] })).status,
  ).toBe(409);
  expect((await request("/folders/folder", undefined, "DELETE")).status).toBe(
    200,
  );
  expect(
    database.sqlite.prepare("SELECT folder_id FROM feeds WHERE id='f'").get()
      .folder_id,
  ).toBeNull();
  expect(
    database.sqlite.prepare("SELECT count(*) AS n FROM articles").get().n,
  ).toBe(3);
});
it("validates names and folder ownership, restores a subscription without duplicating saved articles", async () => {
  expect((await request("/feeds/f", { title: "  " }, "PUT")).status).toBe(400);
  expect(
    (
      await request("/feeds", {
        url: "https://example.com/rss",
        folderId: "private",
      })
    ).status,
  ).toBe(400);
  expect(
    (await request("/feeds", { url: "https://example.com/rss" })).status,
  ).toBe(409);
  await request("/feeds/f", undefined, "DELETE");
  expect(
    (
      await request("/feeds", {
        url: "https://example.com/rss",
        folderId: "second",
      })
    ).status,
  ).toBe(201);
  expect(
    database.sqlite
      .prepare(
        "SELECT is_active,unsubscribed_at,folder_id FROM feeds WHERE id='f'",
      )
      .get(),
  ).toEqual({ is_active: 1, unsubscribed_at: null, folder_id: "second" });
  expect(
    database.sqlite
      .prepare(
        "SELECT count(*) AS n FROM articles WHERE url='https://example.com/star'",
      )
      .get().n,
  ).toBe(1);
  expect(
    database.sqlite
      .prepare("SELECT is_starred FROM articles WHERE id='star'")
      .get().is_starred,
  ).toBe(1);
  expect(
    database.sqlite
      .prepare("SELECT count(*) AS n FROM articles WHERE feed_id='f'")
      .get().n,
  ).toBe(4);
});
it("allows OPML to restore an unsubscribed source while preserving saved articles", async () => {
  await request("/feeds/f", undefined, "DELETE");
  const preview = await createImportPreview(
    env,
    "owner",
    '<opml><body><outline text="Restored" xmlUrl="https://example.com/rss"/></body></opml>',
    "restore.opml",
  );
  await confirmImport(env, "owner", preview);
  const job = await getImportJob(env, "owner", preview);
  await processImportItem(env, job!.items[0].id, new RSSFetcher());
  expect((await getImportJob(env, "owner", preview))?.imported).toBe(1);
  expect(
    database.sqlite
      .prepare("SELECT unsubscribed_at FROM feeds WHERE id='f'")
      .get().unsubscribed_at,
  ).toBeNull();
  expect(
    database.sqlite
      .prepare(
        "SELECT count(*) AS n FROM articles WHERE url='https://example.com/star'",
      )
      .get().n,
  ).toBe(1);
});

it("rolls back restoration and expiry-ledger edits when an article write fails", async () => {
  await request("/feeds/f", undefined, "DELETE");
  const db = getDb(env.DB);
  const existing = await db.select().from(feeds).where(eq(feeds.id, "f")).get();
  database.sqlite.exec(
    "CREATE TRIGGER reject_restore BEFORE INSERT ON articles WHEN NEW.url='https://example.com/ordinary' BEGIN SELECT RAISE(ABORT,'test write failure'); END;",
  );
  const parsed = await new RSSFetcher().fetch("https://example.com/rss");
  await expect(
    saveSubscription(db, "owner", parsed, {
      feedUrl: "https://example.com/rss",
      existing,
    }),
  ).rejects.toThrow();
  expect(
    database.sqlite
      .prepare("SELECT unsubscribed_at FROM feeds WHERE id='f'")
      .get().unsubscribed_at,
  ).toBeTruthy();
  expect(
    database.sqlite
      .prepare(
        "SELECT count(*) AS n FROM expired_article_urls WHERE url='https://example.com/ordinary'",
      )
      .get().n,
  ).toBe(1);
  expect(
    database.sqlite
      .prepare("SELECT count(*) AS n FROM articles WHERE feed_id='f'")
      .get().n,
  ).toBe(2);
});

it("restores cancelled subscriptions through the v2 caller as well", async () => {
  await request("/feeds/f", undefined, "DELETE");
  const response = await request("/v2/feeds", {
    url: "https://example.com/rss",
    folderId: "second",
    fetchIntervalMinutes: 15,
  });
  expect(response.status).toBe(201);
  expect(
    database.sqlite
      .prepare(
        "SELECT fetch_interval_minutes,unsubscribed_at FROM feeds WHERE id='f'",
      )
      .get(),
  ).toEqual({ fetch_interval_minutes: 15, unsubscribed_at: null });
  expect(
    database.sqlite
      .prepare("SELECT is_starred FROM articles WHERE id='star'")
      .get().is_starred,
  ).toBe(1);
});

it("rejects legacy refresh on an archived source and supports account deletion cascades", async () => {
  await request("/feeds/f", undefined, "DELETE");
  expect((await request("/v2/feeds/f/refresh")).status).toBe(404);
  database.sqlite.exec(
    "DELETE FROM user WHERE id='other'; DELETE FROM user WHERE id='owner';",
  );
  expect(
    database.sqlite.prepare("SELECT count(*) AS n FROM native_changes").get().n,
  ).toBe(0);
});
