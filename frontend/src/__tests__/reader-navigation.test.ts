import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useArticleStore } from "../lib/store/articleStore";
import { useFeedStore } from "../lib/store/feedStore";
import { useUiStore } from "../lib/store/uiStore";
import type { Article } from "../lib/types";

const article = (id: string) => ({ id, title: id, content: "<p>Content</p>", publishedAt: "2026-01-01", isRead: false } as Article);
const ok = (data: unknown) => Response.json({ success: true, data });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await useArticleStore.getState().selectArticle(null);
  useArticleStore.setState({ articles: [article("a"), article("b"), article("c")], hasMore: false, isLoadingDetail: false });
  useUiStore.setState({ hideRead: true });
  useFeedStore.setState({ selectedSource: { type: "feed", feedId: "f" } });
  vi.spyOn(useFeedStore.getState(), "fetchFeeds").mockResolvedValue(true);
  vi.spyOn(useArticleStore.getState(), "restoreAiTranslation").mockResolvedValue();
  fetchMock = vi.fn(async (url: string) => ok(article(url.split("/").at(-1)!)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("retains the entrance sequence after read articles disappear from the list and stops at both ends", async () => {
  const store = useArticleStore.getState();
  await store.selectArticle("a");
  await store.navigateArticle("next");
  useArticleStore.setState({ articles: [article("c")] });
  await store.navigateArticle("prev");
  expect(useArticleStore.getState().selectedArticleId).toBe("a");
  await store.navigateArticle("prev");
  expect(useArticleStore.getState().navigationMessage).toBe("已经是第一篇");
  await store.navigateArticle("next");
  await store.navigateArticle("next");
  await store.navigateArticle("next");
  expect(useArticleStore.getState().selectedArticleId).toBe("c");
  expect(useArticleStore.getState().navigationMessage).toBe("已经是最后一篇");
});
it("preserves the current detail on failed navigation and retries without overlapping requests", async () => {
  await useArticleStore.getState().selectArticle("a");
  let finish!: (r: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = useArticleStore.getState().navigateArticle("next");
  await useArticleStore.getState().navigateArticle("next");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(useArticleStore.getState().selectedArticle?.id).toBe("a");
  finish(Response.json({ success: false }, { status: 503 }));
  await pending;
  expect(useArticleStore.getState().selectedArticleId).toBe("a");
  expect(useArticleStore.getState().navigationRetry).toBe("next");
  await useArticleStore.getState().navigateArticle("next");
  expect(useArticleStore.getState().selectedArticleId).toBe("b");
});
it("prefetches with a fixed source and timestamp cursor then continues beyond the loaded page", async () => {
  useArticleStore.setState({ hasMore: true });
  fetchMock.mockImplementation(async (url: string) => url.includes("?") ? ok({ articles: [article("d")], total: 1 }) : ok(article(url.split("/").at(-1)!)));
  await useArticleStore.getState().selectArticle("c");
  await useArticleStore.getState().loadReadingPage();
  const url = new URL(fetchMock.mock.calls.find(([url]) => String(url).includes("?"))![0], "https://test");
  expect(url.searchParams.get("feedId")).toBe("f");
  expect(JSON.parse(url.searchParams.get("after")!)).toEqual({ id: "c", publishedAt: "2026-01-01" });
  expect(url.searchParams.get("hideRead")).toBe("true");
  await useArticleStore.getState().navigateArticle("next");
  expect(useArticleStore.getState().selectedArticleId).toBe("d");
});
it("ignores a pending detail when the reader is closed", async () => {
  await useArticleStore.getState().selectArticle("a");
  let finish!: (r: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = useArticleStore.getState().navigateArticle("next");
  await useArticleStore.getState().selectArticle(null);
  finish(ok(article("b")));
  await pending;
  expect(useArticleStore.getState().selectedArticle).toBeNull();
  expect(useArticleStore.getState().readingSession).toBeNull();
});
it("keeps search navigation inside its result set", async () => {
  useArticleStore.setState({ searchResults: [article("s1"), article("s2")], hasMore: true });
  await useArticleStore.getState().selectArticle("s1", "search");
  await useArticleStore.getState().navigateArticle("next");
  expect(useArticleStore.getState().selectedArticleId).toBe("s2");
  await useArticleStore.getState().navigateArticle("next");
  expect(useArticleStore.getState().navigationMessage).toBe("已经是最后一篇");
});
it("keeps a failed page retryable and ignores its response after leaving the reader", async () => {
  useArticleStore.setState({ hasMore: true });
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('?')) throw new Error('offline');
    return ok(article(url.split('/').at(-1)!));
  });
  await useArticleStore.getState().selectArticle('c');
  await useArticleStore.getState().loadReadingPage();
  await useArticleStore.getState().navigateArticle('next');
  expect(useArticleStore.getState().selectedArticle?.id).toBe('c');
  expect(useArticleStore.getState().navigationRetry).toBe('next');
  let finish!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = useArticleStore.getState().navigateArticle('next');
  await useArticleStore.getState().selectArticle(null);
  finish(ok({articles:[article('d')],total:1}));
  await pending;
  expect(useArticleStore.getState().readingSession).toBeNull();
  expect(useArticleStore.getState().selectedArticleId).toBeNull();
});
it("starts the search result sequence even when its first article is already open", async () => {
  await useArticleStore.getState().selectArticle('a');
  useArticleStore.setState({ searchResults: [article('a'), article('search-only')] });
  await useArticleStore.getState().selectArticle('a', 'search');
  await useArticleStore.getState().navigateArticle('next');
  expect(useArticleStore.getState().selectedArticleId).toBe('search-only');
});
it("discards translation started on the retained article while the next detail loads", async () => {
  await useArticleStore.getState().selectArticle('a');
  let finishDetail!: (response: Response) => void;
  let finishTranslation!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finishDetail = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishTranslation = resolve; }));
  const navigation = useArticleStore.getState().navigateArticle('next');
  const translation = useArticleStore.getState().translateArticle('a', '<p>New text</p>', 'zh-CN', null);
  expect(useArticleStore.getState().isTranslating).toBe(true);
  finishDetail(ok(article('b')));
  await navigation;
  expect(useArticleStore.getState().isTranslating).toBe(false);
  finishTranslation(Response.json({success:false,error:'Old translation failed'}, {status:500}));
  await translation;
  expect(useArticleStore.getState().selectedArticleId).toBe('b');
  expect(useArticleStore.getState().translationError).toBeNull();
});
