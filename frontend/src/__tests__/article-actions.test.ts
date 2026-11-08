import { afterEach, expect, it, vi } from "vitest";
import { useArticleStore } from "../lib/store/articleStore";
import { useFeedStore } from "../lib/store/feedStore";
import { useUiStore } from "../lib/store/uiStore";
import type { Article } from "../lib/types";

afterEach(() => { vi.unstubAllGlobals(); useUiStore.setState({ hideRead: false }); });

it("sends an independent hideRead filter and retains the currently selected article", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, data: { articles: [], total: 0 } }));
  vi.stubGlobal("fetch", fetchMock);
  useUiStore.setState({ hideRead: true });
  useArticleStore.setState({ selectedArticleId: "current", sortOrder: "desc" });
  await useArticleStore.getState().fetchArticles({ type: "feed", feedId: "feed" }, false);
  const query = new URL(fetchMock.mock.calls[0][0], "https://collect.test").searchParams;
  expect(query.get("feedId")).toBe("feed");
  expect(query.get("hideRead")).toBe("true");
  expect(query.get("includeId")).toBe("current");
  expect(useArticleStore.getState().selectedArticleId).toBe("current");
});

it("preserves state and reports failed status writes", async () => {
  const article = { id: "one", isRead: false, isStarred: false } as Article;
  useArticleStore.setState({ articles: [article], selectedArticle: article, selectedArticleId: article.id, isLoadingDetail: false });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: false }, { status: 500 })));
  await useArticleStore.getState().markRead("one", true);
  expect(useArticleStore.getState().articles[0].isRead).toBe(false);
  expect(useArticleStore.getState().selectedArticle?.isRead).toBe(false);
  expect(useArticleStore.getState().articleActionError).toContain("保存失败");
  expect(useArticleStore.getState().pendingArticleIds).toEqual([]);
});

it("refreshes the loaded page range without dropping a selected article on page two", async () => {
  const articles = Array.from({ length: 65 }, (_, i) => ({ id: String(i), title: String(i), isRead: false, isStarred: true } as Article));
  useUiStore.setState({ hideRead: true });
  useArticleStore.setState({ page: 2, articles: articles.slice(0, 60), selectedArticleId: "39", selectedArticle: articles[39], isLoading: false });
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const page = Number(new URL(url, "https://collect.test").searchParams.get("page"));
    return Response.json({ success: true, data: { articles: articles.slice((page - 1) * 30, page * 30), total: 65 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  await useArticleStore.getState().fetchArticles({ type: "starred" }, false);
  expect(useArticleStore.getState().articles).toHaveLength(60);
  expect(useArticleStore.getState().articles[39].id).toBe("39");
  expect(useArticleStore.getState().selectedArticleId).toBe("39");
  expect(useArticleStore.getState().page).toBe(2);
  await useArticleStore.getState().fetchMoreArticles({ type: "starred" });
  expect(useArticleStore.getState().articles).toHaveLength(65);
  expect(useArticleStore.getState().hasMore).toBe(false);
});

it.each(["starred", "read_later"] as const)("keeps read articles visible in %s despite the global filter", async type => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, data: { articles: [], total: 0 } }));
  vi.stubGlobal("fetch", fetchMock);
  useUiStore.setState({ hideRead: true });
  await useArticleStore.getState().fetchArticles({ type });
  const query = new URL(fetchMock.mock.calls[0][0], "https://collect.test").searchParams;
  expect(query.get("filter")).toBe(type);
  expect(query.has("hideRead")).toBe(false);
  expect(useUiStore.getState().hideRead).toBe(true);
});
it("uses the server batch action names and preserves state on a rejected batch", async () => {
  const article = { id: "one", isRead: true, isStarred: false } as Article;
  useArticleStore.setState({ articles: [article], selectedArticle: article, pendingArticleIds: [] });
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: false }, { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);
  await useArticleStore.getState().batchUpdateArticles("star", ["one"]);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe("markAsStarred");
  expect(useArticleStore.getState().articles[0].isStarred).toBe(false);
  expect(useArticleStore.getState().pendingArticleIds).toEqual([]);
  expect(useArticleStore.getState().articleActionError).toContain("批量操作失败");
});

it.each(["starred", "read_later"] as const)("navigates visible read articles in %s", async type => {
  const articles = [{id:"a",isRead:true}, {id:"b",isRead:true}] as Article[];
  useUiStore.setState({ hideRead: true });
  useFeedStore.setState({ selectedSource: { type } });
  useArticleStore.setState({ articles, selectedArticleId: "a" });
  const select = vi.spyOn(useArticleStore.getState(), "selectArticle").mockResolvedValue();
  await useArticleStore.getState().navigateArticle("next");
  expect(select).toHaveBeenCalledWith("b");
  select.mockRestore();
});
