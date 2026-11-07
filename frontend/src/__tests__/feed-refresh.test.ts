import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFeedStore } from "../lib/store/feedStore";
import { useArticleStore } from "../lib/store/articleStore";

const baseline = { id: "feed-1", lastFetchedAt: null, lastErrorAt: null };
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });

describe("queued feed refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useFeedStore.setState({ isLoading: false, selectedSource: { type: "all" } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("waits for completion and reloads the currently selected source", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ queued: 1, feeds: [baseline] }, 202))
      .mockResolvedValueOnce(response([baseline]))
      .mockResolvedValueOnce(response([{ ...baseline, lastFetchedAt: "2026-11-07T10:00:00Z" }]));
    vi.stubGlobal("fetch", fetchMock);
    const articles = vi.spyOn(useArticleStore.getState(), "fetchArticles").mockResolvedValue(true);
    const pending = useFeedStore.getState().refresh();
    await vi.advanceTimersByTimeAsync(2000);
    expect(useFeedStore.getState().isLoading).toBe(true);
    expect(articles).not.toHaveBeenCalled();
    useFeedStore.getState().setSelectedSource({ type: "feed", feedId: "feed-2" });
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(articles).toHaveBeenCalledWith({ type: "feed", feedId: "feed-2" });
    expect(useFeedStore.getState().isLoading).toBe(false);
  });

  it("finishes an empty queue without polling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ queued: 0, feeds: [] }, 202));
    vi.stubGlobal("fetch", fetchMock);
    await useFeedStore.getState().refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useFeedStore.getState().isLoading).toBe(false);
  });

  it("bounds polling and reports a pending background refresh", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ queued: 1, feeds: [baseline] }, 202))
      .mockImplementation(() => Promise.resolve(response([baseline]))));
    const pending = useFeedStore.getState().refresh();
    await vi.advanceTimersByTimeAsync(60000);
    await pending;
    expect(useFeedStore.getState().isLoading).toBe(false);
    expect(useFeedStore.getState().refreshError).toContain("后台");
  });

  it("reports a feed failure and stops polling", async () => {
    vi.spyOn(useArticleStore.getState(), "fetchArticles").mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ queued: 1, feeds: [baseline] }, 202))
      .mockResolvedValueOnce(response([{ ...baseline, lastErrorAt: "2026-11-07T10:00:00Z" }])));
    const pending = useFeedStore.getState().refresh();
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(useFeedStore.getState().refreshError).toContain("失败");
    expect(useFeedStore.getState().isLoading).toBe(false);
  });
  it("waits for remaining feeds when one feed has already failed", async () => {
    const second = { ...baseline, id: "feed-2" };
    const failed = { ...baseline, lastErrorAt: "2026-11-07T10:00:00Z" };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ queued: 2, feeds: [baseline, second] }, 202))
      .mockResolvedValueOnce(response([failed, second]))
      .mockResolvedValueOnce(response([failed, { ...second, lastFetchedAt: "2026-11-07T10:00:01Z" }])));
    const articles = vi.spyOn(useArticleStore.getState(), "fetchArticles").mockResolvedValue(true);
    const pending = useFeedStore.getState().refresh();
    await vi.advanceTimersByTimeAsync(2000);
    expect(useFeedStore.getState().isLoading).toBe(true);
    expect(articles).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(articles).toHaveBeenCalledOnce();
    expect(useFeedStore.getState().refreshError).toContain("失败");
  });

  it.each([401, 500])("reports article loading failure after queue completion (%s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ queued: 1, feeds: [baseline] }, 202))
      .mockResolvedValueOnce(response([{ ...baseline, lastFetchedAt: "2026-11-07T10:00:00Z" }]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status })));
    const pending = useFeedStore.getState().refresh();
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(useFeedStore.getState().refreshError).toContain("文章列表加载失败");
    expect(useFeedStore.getState().isLoading).toBe(false);
  });

  it("returns a failure result when article loading rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));
    await expect(useArticleStore.getState().fetchArticles({ type: "all" })).resolves.toBe(false);
    expect(useArticleStore.getState().isLoading).toBe(false);
  });

  it("shows submission errors without starting polling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await useFeedStore.getState().refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useFeedStore.getState().refreshError).toContain("提交失败");
  });

  it("ignores overlapping refresh requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ queued: 0, feeds: [] }, 202));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([useFeedStore.getState().refresh(), useFeedStore.getState().refresh()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the newest source when an older article request completes later", async () => {
    let finishOld!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce(response({ articles: [{ id: "new" }], total: 1 })));
    const oldRequest = useArticleStore.getState().fetchArticles({ type: "feed", feedId: "old" });
    await useArticleStore.getState().fetchArticles({ type: "feed", feedId: "new" });
    finishOld(response({ articles: [{ id: "old" }], total: 1 }));
    await oldRequest;
    expect(useArticleStore.getState().articles.map((article) => article.id)).toEqual(["new"]);
  });
});
