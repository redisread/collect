import { expect, it, vi, afterEach } from "vitest";
import { runScheduledTasks } from "../lib/scheduler/isolated-tasks";
import { RSSFetcher } from "../lib/rss/fetcher";
import { FeedFetchError, retryAfterSeconds } from "../lib/rss/feed-error";
import { fetchPublicFeed } from "../lib/rss/public-fetch";
vi.mock("../lib/rss/public-fetch", () => ({ fetchPublicFeed: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.mocked(fetchPublicFeed).mockReset(); });

it("isolates scheduled failures and never logs the upstream secret", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const other = vi.fn().mockResolvedValue(undefined);
  await expect(runScheduledTasks([{stage:"opml_dispatch",run:async()=>{throw new Error("https://secret?token=private");}},
    {stage:"feed_sync_dispatch",run:other}])).rejects.toThrow("scheduled_tasks_failed:1");
  expect(other).toHaveBeenCalledOnce();
  expect(log.mock.calls.flat().join()).not.toContain("private");
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({stage:"opml_dispatch",errorCode:"task_failed"});
});

it.each([408,429,500,503])("classifies HTTP %i for delayed queue retry with one fetch", async status => {
  vi.mocked(fetchPublicFeed).mockResolvedValue(new Response("private upstream body", {status,headers:{"Retry-After":"120"}}));
  await expect(new RSSFetcher().fetch("https://example.com/rss", {maxAttempts:1})).rejects.toMatchObject({code:"http_transient",retryable:true,retryAfterSeconds:120});
  expect(fetchPublicFeed).toHaveBeenCalledOnce();
});
it.each([401,403,404,410])("does not retry permanent HTTP %i", async status => {
  vi.mocked(fetchPublicFeed).mockResolvedValue(new Response("private",{status}));
  await expect(new RSSFetcher().fetch("https://example.com/rss")).rejects.toMatchObject({code:"http_permanent",retryable:false});
  expect(fetchPublicFeed).toHaveBeenCalledOnce();
});
it("distinguishes network, invalid feed and blocked URL errors", async () => {
  vi.mocked(fetchPublicFeed).mockRejectedValueOnce(new Error("network secret"));
  await expect(new RSSFetcher().fetch("https://example.com/rss",{maxAttempts:1})).rejects.toMatchObject({code:"network",retryable:true});
  vi.mocked(fetchPublicFeed).mockResolvedValueOnce(new Response("not XML"));
  await expect(new RSSFetcher().fetch("https://example.com/rss",{maxAttempts:1})).rejects.toMatchObject({code:"invalid_feed",retryable:false});
  vi.mocked(fetchPublicFeed).mockRejectedValueOnce(new FeedFetchError("blocked_feed",false));
  await expect(new RSSFetcher().fetch("https://example.com/rss")).rejects.toMatchObject({code:"blocked_feed",retryable:false});
});
it("bounds Retry-After including invalid and HTTP date values", () => {
  expect(retryAfterSeconds("999999")).toBe(900);
  expect(retryAfterSeconds("bad")).toBe(60);
  expect(retryAfterSeconds(new Date(Date.now()+120_000).toUTCString())).toBeGreaterThanOrEqual(119);
});
