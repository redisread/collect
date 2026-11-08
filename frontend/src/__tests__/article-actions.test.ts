import { afterEach, expect, it, vi } from "vitest";
import { useArticleStore } from "../lib/store/articleStore";
import { useUiStore } from "../lib/store/uiStore";
import type { Article } from "../lib/types";

afterEach(() => { vi.unstubAllGlobals(); useUiStore.setState({ hideRead: false }); });

it("sends an independent hideRead filter and retains the currently selected article", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, data: { articles: [], total: 0 } }));
  vi.stubGlobal("fetch", fetchMock);
  useUiStore.setState({ hideRead: true });
  useArticleStore.setState({ selectedArticleId: "current", sortOrder: "desc" });
  await useArticleStore.getState().fetchArticles({ type: "starred" }, false);
  const query = new URL(fetchMock.mock.calls[0][0], "https://collect.test").searchParams;
  expect(query.get("filter")).toBe("starred");
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
