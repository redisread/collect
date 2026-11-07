export type FeedSyncMessage = {
  feedId: string;
  requestId: string;
  source: "manual" | "scheduled";
};

export type FeedSyncOutcome = {
  feedId: string;
  newArticles?: number;
  duration: number;
  error?: string;
};

const MAX_QUEUE_BATCH_SIZE = 100;

export async function enqueueFeedSyncMessages(
  queue: Pick<Queue, "sendBatch">,
  feedIds: string[],
  requestId: string,
  source: FeedSyncMessage["source"],
): Promise<number> {
  if (feedIds.length === 0) {
    return 0;
  }

  for (let offset = 0; offset < feedIds.length; offset += MAX_QUEUE_BATCH_SIZE) {
    const batch = feedIds.slice(offset, offset + MAX_QUEUE_BATCH_SIZE);
    await queue.sendBatch(
      batch.map((feedId) => ({
        body: { feedId, requestId, source },
        contentType: "json" as const,
      })),
    );
  }

  return feedIds.length;
}

export async function consumeFeedSyncBatch(
  batch: MessageBatch<FeedSyncMessage>,
  syncFeed: (feedId: string) => Promise<FeedSyncOutcome>,
): Promise<void> {
  await Promise.all(batch.messages.map(async (message) => {
    try {
      const result = await syncFeed(message.body.feedId);
      if (result.error) {
        throw new Error(result.error);
      }
      message.ack();
      console.log(JSON.stringify({
        event: "feed_sync_completed",
        requestId: message.body.requestId,
        source: message.body.source,
        attempt: message.attempts,
        durationMs: result.duration,
        newArticles: result.newArticles ?? 0,
      }));
    } catch {
      const delaySeconds = Math.min(60 * (2 ** (message.attempts - 1)), 900);
      message.retry({ delaySeconds });
      console.warn(JSON.stringify({
        event: "feed_sync_retry_scheduled",
        requestId: message.body.requestId,
        source: message.body.source,
        attempt: message.attempts,
        delaySeconds,
      }));
    }
  }));
}
