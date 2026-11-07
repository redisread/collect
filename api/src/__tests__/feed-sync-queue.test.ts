import { describe, expect, it, vi } from "vitest";
import {
  consumeFeedSyncBatch,
  enqueueFeedSyncMessages,
  type FeedSyncMessage,
} from "../queue/feed-sync";

function createMessage(body: FeedSyncMessage, attempts = 1): Message<FeedSyncMessage> {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date("2026-08-30T00:00:00.000Z"),
    body,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function createBatch(messages: Message<FeedSyncMessage>[]): MessageBatch<FeedSyncMessage> {
  return {
    queue: "collect-feed-sync",
    messages,
    metadata: {
      metrics: {
        backlogCount: messages.length,
        backlogBytes: 0,
      },
    },
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  };
}

describe("feed sync queue", () => {
  it("publishes one serializable message per feed", async () => {
    const sendBatch = vi.fn().mockResolvedValue({
      metadata: { metrics: { backlogCount: 2, backlogBytes: 100 } },
    });
    const queue = { sendBatch } as Pick<Queue<FeedSyncMessage>, "sendBatch">;

    const queued = await enqueueFeedSyncMessages(
      queue,
      ["feed-1", "feed-2"],
      "request-1",
      "manual",
    );

    expect(queued).toBe(2);
    expect(sendBatch).toHaveBeenCalledWith([
      {
        body: {
          feedId: "feed-1",
          requestId: "request-1",
          source: "manual",
        },
        contentType: "json",
      },
      {
        body: {
          feedId: "feed-2",
          requestId: "request-1",
          source: "manual",
        },
        contentType: "json",
      },
    ]);
  });

  it("splits large dispatches into Cloudflare Queue batches of at most 100", async () => {
    const sendBatch = vi.fn().mockResolvedValue({
      metadata: { metrics: { backlogCount: 205, backlogBytes: 1000 } },
    });
    const queue = { sendBatch } as Pick<Queue<FeedSyncMessage>, "sendBatch">;
    const feedIds = Array.from({ length: 205 }, (_, index) => `feed-${index}`);

    const queued = await enqueueFeedSyncMessages(
      queue,
      feedIds,
      "request-1",
      "scheduled",
    );

    expect(queued).toBe(205);
    expect(sendBatch).toHaveBeenCalledTimes(3);
    expect(sendBatch.mock.calls.map(([messages]) => messages.length)).toEqual([
      100,
      100,
      5,
    ]);
  });

  it("acknowledges successful messages independently", async () => {
    const message = createMessage({
      feedId: "feed-1",
      requestId: "request-1",
      source: "scheduled",
    });
    const syncFeed = vi.fn().mockResolvedValue({
      feedId: "feed-1",
      newArticles: 3,
      duration: 25,
    });

    await consumeFeedSyncBatch(createBatch([message]), syncFeed);

    expect(syncFeed).toHaveBeenCalledWith("feed-1");
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries failed messages without rejecting the whole batch", async () => {
    const message = createMessage({
      feedId: "feed-1",
      requestId: "request-1",
      source: "manual",
    }, 2);
    const syncFeed = vi.fn().mockRejectedValue(new Error("feed unavailable"));

    await consumeFeedSyncBatch(createBatch([message]), syncFeed);

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 120 });
  });
});
