import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useArticleStore } from "../lib/store/articleStore";
import { translateInBrowser } from "../lib/translate-browser";

vi.mock("../lib/translate-browser", () => ({ translateInBrowser: vi.fn() }));
vi.mock("../lib/settings", () => ({ readTranslationLanguage: vi.fn().mockResolvedValue("zh-CN") }));
const result = {
  translatedHtml: "<p>你好</p>", bilingualHtml: "<p>Hello<span>你好</span></p>",
  segments: [{ original: "Hello", translated: "你好" }], detectedLang: "en", targetLang: "zh-CN", timestamp: 1,
};
beforeEach(async () => {
  await useArticleStore.getState().selectArticle(null);
  useArticleStore.setState({ selectedArticleId: "browser-test", translations: {}, targetLanguage: "zh-CN" });
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

it("offers browser retry on upstream limits, stores its result and records history", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
    success: false, error: "Google 限流", code: "google_rate_limited",
  }, { status: 502 })).mockResolvedValue(Response.json({ success: true }, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(translateInBrowser).mockResolvedValue(result);
  await useArticleStore.getState().translateArticle("browser-test", "<p>Hello</p>");
  expect(useArticleStore.getState().translationFallback?.content).toBe("<p>Hello</p>");
  expect(await useArticleStore.getState().translateInBrowser()).toBe(true);
  expect(useArticleStore.getState().translations["browser-test:zh-CN"].translated).toBe("你好");
  expect(useArticleStore.getState().translationFallback).toBeNull();
  expect(fetchMock.mock.calls[1][0]).toBe("/api/translations/history");
});

it("does not offer an upstream fallback for an authentication error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: false }, { status: 401 })));
  await useArticleStore.getState().translateArticle("browser-test", "<p>Hello</p>");
  expect(useArticleStore.getState().translationFallback).toBeNull();
});

it("cancels browser translation on navigation and ignores a late result", async () => {
  useArticleStore.setState({ translationFallback: { articleId: "browser-test", content: "Hello", targetLang: "zh-CN" } });
  let finish!: (value: typeof result) => void;
  let signal!: AbortSignal;
  vi.mocked(translateInBrowser).mockImplementation((_content, _lang, abortSignal) => {
    signal = abortSignal;
    return new Promise(resolve => { finish = resolve; });
  });
  const pending = useArticleStore.getState().translateInBrowser();
  await vi.waitFor(() => expect(translateInBrowser).toHaveBeenCalled());
  await useArticleStore.getState().selectArticle(null);
  expect(signal.aborted).toBe(true);
  finish(result);
  expect(await pending).toBe(false);
  expect(useArticleStore.getState().translations).toEqual({});
});
