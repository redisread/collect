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
import { dispatchImportItems, processImportItem, type OpmlImportMessage } from "../../api/src/services/OpmlImportService";

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
      await dispatchImportItems(env);
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
    const syncMessages = batch.messages.filter((message): message is Message<FeedSyncMessage> => message.body.source !== "opml-import");
    const importMessages = batch.messages.filter((message): message is Message<OpmlImportMessage> => message.body.source === "opml-import");
    await Promise.all([
      consumeFeedSyncBatch({ messages: syncMessages }, (feedId) => service.syncQueuedFeed(feedId)),
      ...importMessages.map(async message => {
        try { await processImportItem(env, message.body.itemId); message.ack(); }
        catch {
          console.warn(JSON.stringify({ event: "opml_item_retry", itemId: message.body.itemId }));
          message.retry({ delaySeconds: 60 });
        }
      }),
    ]);
  },
} satisfies ExportedHandler<CloudflareEnv, FeedSyncMessage | OpmlImportMessage>;

export default worker;
