import astroWorker from "@astrojs/cloudflare/entrypoints/server";
import { Hono } from "hono";
import apiApp from "../../api/src/app";
import { getDb } from "../../api/src/db";
import { RSSFetcher } from "../../api/src/lib/rss/fetcher";
import { sendPendingDigests } from "../../api/src/lib/scheduler/digest";
import {
  consumeFeedSyncBatch,
  enqueueFeedSyncMessages,
  type FeedSyncMessage,
} from "../../api/src/queue/feed-sync";
import { FeedSyncService } from "../../api/src/services/FeedSyncService";
import type { CloudflareEnv } from "../../api/src/types";

const app = new Hono<{ Bindings: CloudflareEnv }>();

app.route("/", apiApp);
app.all("/api/*", (c) => c.json({ success: false, error: "Not found" }, 404));
app.all("*", (c) => astroWorker.fetch(
  c.req.raw as Parameters<typeof astroWorker.fetch>[0],
  c.env,
  c.executionCtx as unknown as Parameters<typeof astroWorker.fetch>[2],
));

function createFeedSyncService(env: CloudflareEnv) {
  return new FeedSyncService(
    getDb(env.DB),
    env.COLLECT_KV,
    new RSSFetcher(),
  );
}

const worker = {
  fetch: app.fetch,
  async scheduled(controller, env) {
    if (controller.cron === "*/5 * * * *") {
      const feedIds = await createFeedSyncService(env).listDueFeedIds(200);
      const queued = await enqueueFeedSyncMessages(
        env.FEED_SYNC_QUEUE,
        feedIds,
        crypto.randomUUID(),
        "scheduled",
      );
      console.log(JSON.stringify({ event: "feed_sync_dispatched", queued }));
      return;
    }

    if (controller.cron === "0 * * * *") {
      const result = await sendPendingDigests(env);
      console.log(JSON.stringify({
        event: "digest_schedule_completed",
        sent: result.sent,
        failed: result.errors.length,
      }));
    }
  },
  async queue(batch, env) {
    const service = createFeedSyncService(env);
    await consumeFeedSyncBatch(batch, (feedId) => service.syncQueuedFeed(feedId));
  },
} satisfies ExportedHandler<CloudflareEnv, FeedSyncMessage>;

export default worker;
