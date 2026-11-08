import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { drizzle, type AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import { Hono } from "hono";
import { getDb } from "../db";
import articlesRoute from "../routes/articles";
import profilesRoute from "../routes/ai-profiles";
import translateRoute from "../routes/ai-translate";
import type { CloudflareEnv } from "../types";

// CI and local development use Node 24; the application's Node 20 type package predates node:sqlite.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../middleware/auth", () => ({ authMiddleware: async (c: { req: { header: (name: string) => string | undefined }; set: (key: string, value: string) => void }, next: () => Promise<void>) => {
  c.set("userId", c.req.header("test-user") ?? "owner"); await next();
} }));

const app = new Hono<{ Bindings: CloudflareEnv }>().route("/articles", articlesRoute).route("/profiles", profilesRoute).route("/translate", translateRoute);
let sqlite: ReturnType<typeof DatabaseSync>;
let providerCalls: number;
const env = { AI_KEYS_ENCRYPTION_SECRET: btoa("x".repeat(32)), DB: {}, COLLECT_KV: { get: async () => null, put: async () => {} } } as unknown as CloudflareEnv;
const profileInput = { name: "Reading", kind: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", apiKey: "private-key", enable: true };

async function request(path: string, method = "GET", body?: unknown, owner = "owner") {
  return app.request("https://collect.test" + path, { method, headers: { "Content-Type": "application/json", "test-user": owner },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env, { waitUntil: () => {}, passThroughOnException: () => {}, props: {} });
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../../drizzle/migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
  }
  sqlite.exec("INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('owner','Owner','owner@test.invalid',0,0),('other','Other','other@test.invalid',0,0)");
  sqlite.exec("INSERT INTO feeds(id,user_id,title,url,feed_url) VALUES ('feed','owner','Feed','https://example.com','https://example.com/feed')");
  sqlite.exec("INSERT INTO articles(id,user_id,feed_id,title,url) VALUES ('article','owner','feed','Article','https://example.com/article')");
  const execute: AsyncRemoteCallback = async (query, params, method) => {
    const statement = sqlite.prepare(query);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    statement.setReturnArrays(true);
    return { rows: method === "get" ? statement.get(...params) : statement.all(...params) };
  };
  const db = drizzle(execute, async batch => {
    sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const item of batch) results.push(await execute(item.sql, item.params, item.method));
      sqlite.exec("COMMIT");
      return results;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  });
  vi.mocked(getDb).mockReturnValue(db as never);
  providerCalls = 0;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: URL | string) => {
    if (String(url).startsWith("https://cloudflare-dns.com/")) return Response.json({ Status: 0, Answer: [{ type: 1, data: "8.8.8.8" }] });
    providerCalls++;
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "译文" } }] });
  }));
});
afterEach(() => { sqlite.close(); vi.unstubAllGlobals(); });

async function createProfile() {
  expect((await request("/profiles", "POST", profileInput)).status).toBe(201);
  const response = await (await request("/profiles")).json() as { data: { profiles: { id: string; revision: string; updatedAt: string }[]; activeProfileId: string } };
  return response.data.profiles[0];
}

it("stores encrypted keys, isolates profiles, and requires explicit key replacement for another endpoint", async () => {
  const profile = await createProfile();
  const response = await (await request("/profiles")).text();
  expect(response).not.toContain("private-key");
  expect(response).not.toContain("encryptedKey");
  expect(sqlite.prepare("SELECT encrypted_key FROM ai_profiles").get().encrypted_key).not.toContain("private-key");
  expect(await (await request("/profiles", "GET", undefined, "other")).json()).toMatchObject({ data: { profiles: [], activeProfileId: null } });
  expect((await request("/profiles/active", "PUT", { profileId: profile.id }, "other")).status).toBe(404);
  expect((await request(`/profiles/${profile.id}`, "PUT", { ...profileInput, ...profile, kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: undefined })).status).toBe(400);
});

it("persists each run, resumes idempotently, blocks other users, and writes history only on completion", async () => {
  const profile = await createProfile();
  const body = { articleId: "article", profileId: profile.id, revision: profile.revision, targetLang: "zh-CN", content: "<p>Hello</p><p>World</p>" };
  const started = await (await request("/translate/start", "POST", body)).json() as { data: { id: string; completed: number } };
  const id = started.data.id;
  expect((await request(`/translate/${id}/step`, "POST", { completed: 0 }, "other")).status).toBe(404);
  expect((await request("/translate/start", "POST", body, "other")).status).toBe(404);
  expect(await (await request(`/translate/${id}/step`, "POST", { completed: 0 })).json()).toMatchObject({ data: { completed: 1, complete: false } });
  expect(sqlite.prepare("SELECT count(*) AS total FROM translation_history").get().total).toBe(0);
  expect(await (await request("/translate/start", "POST", { ...body, restoreOnly: true })).json()).toMatchObject({ data: { completed: 1 } });
  await request(`/translate/${id}/step`, "POST", { completed: 0 });
  expect(providerCalls).toBe(1);
  expect(await (await request(`/translate/${id}/step`, "POST", { completed: 1 })).json()).toMatchObject({ data: { completed: 2, complete: true } });
  expect(providerCalls).toBe(2);
  expect(sqlite.prepare("SELECT count(*) AS total FROM translation_history").get().total).toBe(1);
  const changed = await (await request("/translate/start", "POST", { ...body, targetLang: "ja" })).json() as { data: { id: string } };
  expect(changed.data.id).not.toBe(id);
  expect((await request(`/profiles/${profile.id}`, "DELETE")).status).toBe(200);
  expect(sqlite.prepare("SELECT count(*) AS total FROM ai_translation_jobs").get().total).toBe(0);
  expect(await (await request("/profiles")).json()).toMatchObject({ data: { activeProfileId: null } });
});

it("retains completed runs when upstream fails and excludes concurrent duplicate requests", async () => {
  const profile = await createProfile();
  const body = { articleId: "article", profileId: profile.id, revision: profile.revision, targetLang: "zh-CN", content: "<p>Hello</p><p>World</p>" };
  const start = await (await request("/translate/start", "POST", body)).json() as { data: { id: string } };
  const id = start.data.id;
  await request(`/translate/${id}/step`, "POST", { completed: 0 });
  let finish!: (response: Response) => void;
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockImplementation(async url => {
    if (String(url).startsWith("https://cloudflare-dns.com/")) return Response.json({ Status: 0, Answer: [{ type: 1, data: "8.8.8.8" }] });
    return new Promise(resolve => { finish = resolve; });
  });
  const pending = request(`/translate/${id}/step`, "POST", { completed: 1 });
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect((await request(`/translate/${id}/step`, "POST", { completed: 1 })).status).toBe(409);
  finish(new Response("limited", { status: 429 }));
  expect((await pending).status).toBe(502);
  expect(sqlite.prepare("SELECT completed,lease_until FROM ai_translation_jobs WHERE id=?").get(id)).toMatchObject({ completed: 1, lease_until: 0 });
});

it("preserves progress for key edits and isolates new model revisions", async () => {
  const profile = await createProfile();
  const body = { articleId: "article", profileId: profile.id, revision: profile.revision, targetLang: "zh-CN", content: "<p>Hello</p><p>World</p>" };
  const started = await (await request("/translate/start", "POST", body)).json() as { data: { id: string } };
  await request(`/translate/${started.data.id}/step`, "POST", { completed: 0 });
  expect((await request(`/profiles/${profile.id}`, "PUT", { ...profileInput, ...profile, apiKey: "replacement-key" })).status).toBe(200);
  const keyEdited = await (await request("/profiles")).json() as { data: { profiles: typeof profile[] } };
  expect(keyEdited.data.profiles[0].revision).toBe(profile.revision);
  expect(await (await request("/translate/start", "POST", body)).json()).toMatchObject({ data: { id: started.data.id, completed: 1 } });
  expect((await request(`/profiles/${profile.id}`, "PUT", { ...profileInput, ...profile })).status).toBe(409);
  expect((await request(`/profiles/${profile.id}`, "PUT", { ...profileInput, ...keyEdited.data.profiles[0], model: "deepseek-v4-pro" })).status).toBe(200);
  const modelEdited = await (await request("/profiles")).json() as { data: { profiles: typeof profile[] } };
  expect(modelEdited.data.profiles[0].revision).not.toBe(profile.revision);
  expect((await request(`/translate/${started.data.id}/step`, "POST", { completed: 1 })).status).toBe(409);
  const newJob = await (await request("/translate/start", "POST", { ...body, revision: modelEdited.data.profiles[0].revision })).json() as { data: { id: string; completed: number } };
  expect(newJob.data.id).not.toBe(started.data.id);
  expect(newJob.data.completed).toBe(0);
});


it("batches three indexed segments, persists progress and rejects stale versions", async () => {
  const profile = await createProfile();
  const body = { articleId: "article", profileId: profile.id, revision: profile.revision, targetLang: "zh-CN", content: "<p>One</p><p>Two</p><p>Three</p><p>Four</p>" };
  const start = await (await request("/translate/start", "POST", body)).json() as { data: { id: string; completed: number; progressVersion: string } };
  const step = await (await request(`/translate/${start.data.id}/step`, "POST", start.data)).json() as { data: typeof start.data };
  expect(step).toMatchObject({ data: { completed: 3, pending: 1, failed: 0, complete: false } });
  expect(providerCalls).toBe(3);
  await request(`/translate/${start.data.id}/step`, "POST", start.data);
  expect(providerCalls).toBe(3);
  expect(await (await request(`/translate/${start.data.id}/step`, "POST", step.data)).json()).toMatchObject({ data: { completed: 4, complete: true } });
});

it("combines hideRead with favorites and retains only the selected read article", async () => {
  sqlite.exec("UPDATE articles SET is_read=1,is_starred=1 WHERE id='article'");
  sqlite.exec("INSERT INTO articles(id,user_id,feed_id,title,url,is_starred) VALUES ('unread','owner','feed','Unread','https://example.com/unread',1)");
  const filtered = await (await request("/articles?filter=starred&hideRead=true")).json() as { data: { articles: { id: string }[] } };
  expect(filtered.data.articles.map(article => article.id)).toEqual(["unread"]);
  const retained = await (await request("/articles?filter=starred&hideRead=true&includeId=article")).json() as { data: { total: number } };
  expect(retained.data.total).toBe(2);
  expect(await (await request("/articles?filter=starred&hideRead=true&includeId=article", "GET", undefined, "other")).json()).toMatchObject({ data: { total: 0 } });
});

it("persists partial batch failures and only retranslates missing segments on retry", async () => {
  const profile = await createProfile();
  const input = { articleId: "article", profileId: profile.id, revision: profile.revision, targetLang: "zh-CN", content: "<p>One</p><p>Fail</p><p>Three</p><p>Four</p>" };
  let fail = true;
  const passages: string[] = [];
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).startsWith("https://cloudflare-dns.com/")) return Response.json({ Status: 0, Answer: [{ type: 1, data: "8.8.8.8" }] });
    const passage = JSON.parse(JSON.parse(String(init?.body)).messages[1].content).passage as string;
    passages.push(passage);
    if (passage.includes("Fail") && fail) return new Response("temporary", { status: 503 });
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "译文" } }] });
  });
  type Progress = { id: string; completed: number; progressVersion: string; failed: number; pending: number };
  const started = await (await request("/translate/start", "POST", input)).json() as { data: Progress };
  const step = await (await request(`/translate/${started.data.id}/step`, "POST", started.data)).json() as { data: Progress };
  expect(step).toMatchObject({ data: { completed: 2, failed: 1, pending: 1 } });
  expect(passages.filter(text => text.includes("Fail"))).toHaveLength(3);
  const rest = await (await request(`/translate/${started.data.id}/step`, "POST", step.data)).json() as { data: Progress };
  expect(rest).toMatchObject({ data: { completed: 3, failed: 1, pending: 0 } });
  expect(sqlite.prepare("SELECT count(*) AS total FROM translation_history").get().total).toBe(0);
  fail = false;
  expect(await (await request(`/translate/${started.data.id}/step`, "POST", { ...rest.data, retryFailed: true })).json()).toMatchObject({ data: { completed: 4, complete: true, failed: 0 } });
  expect(passages.filter(text => text.includes("One"))).toHaveLength(1);
  expect(passages.filter(text => text.includes("Three"))).toHaveLength(1);
  expect(sqlite.prepare("SELECT count(*) AS total FROM translation_history").get().total).toBe(1);
});

it("saves finished runs and releases the lease when disconnect grace expires", async () => {
  const profile = await createProfile();
  const input = { articleId: "article", profileId: profile.id, revision: profile.revision, targetLang: "zh-CN", content: "<p>One</p><p>Two</p><p>Three</p>" };
  const started = await (await request("/translate/start", "POST", input)).json() as { data: { id: string; completed: number; progressVersion: string } };
  let calls = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).startsWith("https://cloudflare-dns.com/")) return Response.json({ Status: 0, Answer: [{ type: 1, data: "8.8.8.8" }] });
    if (++calls === 1) return Response.json({ choices: [{ finish_reason: "stop", message: { content: "译文" } }] });
    return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  });
  vi.useFakeTimers();
  try {
    const controller = new AbortController();
    const work = app.request(`https://collect.test/translate/${started.data.id}/step`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(started.data),
    }, env, { waitUntil: () => {}, passThroughOnException: () => {}, props: {} });
    await vi.waitFor(() => expect(sqlite.prepare("SELECT completed FROM ai_translation_jobs").get().completed).toBe(1));
    controller.abort();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await (await work).json()).toMatchObject({ data: { completed: 1, failed: 2 } });
    expect(sqlite.prepare("SELECT lease_until FROM ai_translation_jobs").get().lease_until).toBe(0);
  } finally { vi.useRealTimers(); }
});
