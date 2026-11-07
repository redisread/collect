import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArticleStore } from "../lib/store/articleStore";
import { useFeedStore } from "../lib/store/feedStore";
import { sanitizeHtml } from "../lib/utils/sanitize";
import type { Article, FeedWithUnreadCount, Folder } from "../lib/types";

const response = (data: unknown) => Response.json({ success: true, data });
const article = (id: string) => ({ id, title: id, content: "<p>Hello</p>" } as Article);
beforeEach(async () => {
  await useArticleStore.getState().selectArticle(null);
  useArticleStore.setState({ translations: {}, targetLanguage: "zh-CN" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("reader request lifecycle", () => {
  it("clears old content immediately and ignores late article responses", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(response(article("b"))));
    useArticleStore.setState({ selectedArticle: article("old") });
    const first = useArticleStore.getState().selectArticle("a");
    expect(useArticleStore.getState().selectedArticle).toBeNull();
    expect(useArticleStore.getState().isLoadingDetail).toBe(true);
    await useArticleStore.getState().selectArticle("b");
    finish(response(article("a")));
    await first;
    expect(useArticleStore.getState().selectedArticle?.id).toBe("b");
  });

  it("exposes a retryable detail failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await useArticleStore.getState().selectArticle("a");
    expect(useArticleStore.getState().detailError).toContain("重试");
    expect(useArticleStore.getState().isLoadingDetail).toBe(false);
  });

  it("caches by language and content and reports translation errors", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response({ translatedHtml: "<p>你好</p>", segments: [] })));
    vi.stubGlobal("fetch", fetchMock);
    useArticleStore.setState({ selectedArticleId: "a", selectedArticle: article("a") });
    await useArticleStore.getState().translateArticle("a", "<p>Hello</p>");
    await useArticleStore.getState().translateArticle("a", "<p>Hello</p>");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await useArticleStore.getState().translateArticle("a", "<p>Hello</p>", "ja");
    await useArticleStore.getState().translateArticle("a", "<p>Changed</p>");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockRejectedValue(new Error("Google unavailable"));
    expect(await useArticleStore.getState().translateArticle("a", "new")).toBe(false);
    expect(useArticleStore.getState().translationError).toBe("Google unavailable");
    expect(useArticleStore.getState().translations["a:zh-CN"].original).toBe("<p>Changed</p>");
  });

  it("restores the original folder when a move fails", async () => {
    useFeedStore.setState({
      movingFeedId: null, feeds: [{ id: "f", folderId: null } as FeedWithUnreadCount],
      folders: [{ id: "folder", name: "文学" } as Folder], selectedSource: { type: "all" },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const pending = useFeedStore.getState().moveFeedToFolder("f", "folder");
    expect(useFeedStore.getState().feeds[0].folderId).toBe("folder");
    await pending;
    expect(useFeedStore.getState().feeds[0].folderId).toBeNull();
    expect(useFeedStore.getState().moveStatus).toContain("已恢复");
  });

  it("extracts full content before translating and never silently translates a summary", async () => {
    useArticleStore.setState({ selectedArticleId: "a", selectedArticle: { ...article("a"), content: null, summary: "Summary" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(article("a")))
      .mockResolvedValueOnce(response({ translatedHtml: "<p>你好</p>", segments: [] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await useArticleStore.getState().translateFullArticle()).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("/a/extract");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).content).toBe("<p>Hello</p>");
    useArticleStore.setState({ selectedArticle: { ...article("a"), content: null, summary: "Summary" } });
    fetchMock.mockReset().mockRejectedValue(new Error("unreachable"));
    expect(await useArticleStore.getState().translateFullArticle()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useArticleStore.getState().extractionError).toContain("仅翻译摘要");
  });

  it("removes encoded unsafe URLs while preserving bilingual markup", () => {
    const html = sanitizeHtml('<p onclick="evil()">Text<span class="translation-text" lang="zh-CN">译文</span><a href="jav&#x61;script:evil()">link</a><img src="https://example.com/a.png" onerror="evil()"></p>');
    expect(html).not.toMatch(/onclick|onerror|javascript/);
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain('src="https://example.com/a.png"');
  });
});
