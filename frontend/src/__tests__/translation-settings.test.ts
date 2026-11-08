import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useArticleStore } from "../lib/store/articleStore";
import { readTranslationLanguage } from "../lib/settings";
import type { Article } from "../lib/types";

vi.mock("../lib/settings", () => ({ readTranslationLanguage: vi.fn() }));
vi.mock("../lib/store/aiSettingsStore", () => ({ useAiSettingsStore: { getState: () => ({ load: async () => {}, profiles: [], activeProfileId: null }) } }));
beforeEach(async () => {
  await useArticleStore.getState().selectArticle(null);
  useArticleStore.getState().setTargetLanguage("zh-CN");
  useArticleStore.setState({
    selectedArticleId: "a", selectedArticle: { id: "a", content: "<p>Hello</p>" } as Article,
    displayedLanguages: { a: "zh-CN" }, translations: {},
  });
  vi.mocked(readTranslationLanguage).mockReset().mockResolvedValue("ja");
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("saves the default without replacing the displayed translation or cancelling work", () => {
  useArticleStore.setState({ isTranslating: true, translationFallback: { articleId: "a", content: "Hello", targetLang: "zh-CN" } });
  useArticleStore.getState().setTargetLanguage("ja");
  expect(useArticleStore.getState()).toMatchObject({ targetLanguage: "ja", displayedLanguages: { a: "zh-CN" }, isTranslating: true });
  expect(useArticleStore.getState().translationFallback?.targetLang).toBe("zh-CN");
});

it("uses the account preference for the next translation and preserves older cached languages", async () => {
  useArticleStore.setState({ translations: { "a:zh-CN": { original: "Hello", translated: "你好", targetLang: "zh-CN" } } });
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, data: { segments: [], targetLang: "ja" } }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await useArticleStore.getState().translateFullArticle()).toBe(true);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).targetLang).toBe("ja");
  expect(useArticleStore.getState().displayedLanguages.a).toBe("ja");
  expect(useArticleStore.getState().translations["a:zh-CN"].translated).toBe("你好");
});

it("retains the language captured by an in-flight translation after a settings save", async () => {
  let finish!: (value: Response) => void;
  const fetchMock = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  const pending = useArticleStore.getState().translateArticle("a", "Hello", "zh-CN");
  useArticleStore.getState().setTargetLanguage("ja");
  finish(Response.json({ success: true, data: { segments: [], targetLang: "zh-CN" } }));
  expect(await pending).toBe(true);
  expect(useArticleStore.getState()).toMatchObject({ targetLanguage: "ja", displayedLanguages: { a: "zh-CN" } });
});

it("prevents a late preference read from undoing a successful save", async () => {
  let finish!: (language: string) => void;
  vi.mocked(readTranslationLanguage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = useArticleStore.getState().loadTargetLanguage();
  useArticleStore.getState().setTargetLanguage("fr");
  finish("ja");
  expect(await pending).toBe("fr");
  expect(useArticleStore.getState().targetLanguage).toBe("fr");
});

it("ignores a translation requested for an article left while loading preferences", async () => {
  let finish!: (language: string) => void;
  vi.mocked(readTranslationLanguage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const pending = useArticleStore.getState().translateFullArticle();
  await useArticleStore.getState().selectArticle(null);
  finish("ja");
  expect(await pending).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("stops translation with a retryable message when account settings cannot load", async () => {
  vi.mocked(readTranslationLanguage).mockRejectedValueOnce(new Error("offline"));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(await useArticleStore.getState().translateFullArticle()).toBe(false);
  expect(useArticleStore.getState().preferenceError).toContain("重试");
  expect(fetchMock).not.toHaveBeenCalled();
});
