import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useArticleStore } from "../lib/store/articleStore";
import { useAiSettingsStore } from "../lib/store/aiSettingsStore";
import type { Article } from "../lib/types";

const profile = { id: "profile", name: "DeepSeek", kind: "deepseek" as const, baseUrl: "https://api.deepseek.com", model: "deepseek-flash", revision: "v1", updatedAt: "now", hasKey: true };
const progress = (completed: number) => ({ id: "job", profileId: "profile", revision: "v1", targetLang: "zh-CN", completed, total: 2,
  complete: completed === 2, segments: Array.from({ length: completed }, () => ({ original: "Hello", translated: "你好" })),
  translatedHtml: "<p>你好</p>", bilingualHtml: "<p>Hello<span>你好</span></p>" });
const response = (data: unknown) => Response.json({ success: true, data });

beforeEach(async () => {
  await useArticleStore.getState().selectArticle(null);
  useArticleStore.getState().setTargetLanguage("zh-CN");
  useArticleStore.setState({ selectedArticleId: "a", selectedArticle: { id: "a", content: "<p>Hello</p>" } as Article,
    translations: {}, displayedKeys: {}, displayedLanguages: {}, aiProgress: null });
  useAiSettingsStore.setState({ profiles: [profile], activeProfileId: profile.id });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("resumes persisted progress and renders each completed run using a provider-specific cache key", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url === "/api/settings") return response({ translationTargetLanguage: "zh-CN" });
    if (url === "/api/ai-profiles") return response({ profiles: [profile], activeProfileId: profile.id });
    if (url === "/api/ai-translate/start") return response(progress(1));
    return response(progress(2));
  });
  vi.stubGlobal("fetch", fetchMock);
  expect(await useArticleStore.getState().translateFullArticle()).toBe(true);
  expect(fetchMock.mock.calls.filter(call => call[0].endsWith("/step"))).toHaveLength(1);
  expect(JSON.parse(fetchMock.mock.calls.find(call => call[0].endsWith("/step"))![1].body)).toEqual({ completed: 1 });
  expect(useArticleStore.getState().displayedKeys.a).toBe("a:zh-CN:ai:profile:v1");
  expect(useArticleStore.getState().aiProgress?.complete).toBe(true);
});

it("does not overwrite a new article with an old AI response", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    if (url === "/api/ai-translate/start") return response(progress(0));
    return new Promise(resolve => { finish = resolve; });
  }));
  const pending = useArticleStore.getState().translateArticle("a", "Hello", "zh-CN", profile);
  await vi.waitFor(() => expect(finish).toBeDefined());
  await useArticleStore.getState().selectArticle(null);
  finish(response(progress(1)));
  expect(await pending).toBe(false);
  expect(useArticleStore.getState().aiProgress).toBeNull();
  expect(useArticleStore.getState().isTranslating).toBe(false);
});

it("keeps saved partial output and exposes upstream errors for manual continuation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    if (url === "/api/ai-translate/start") return response(progress(1));
    return Response.json({ success: false, error: "额度不足" }, { status: 502 });
  }));
  expect(await useArticleStore.getState().translateArticle("a", "Hello", "zh-CN", profile)).toBe(false);
  expect(useArticleStore.getState().aiProgress?.completed).toBe(1);
  expect(useArticleStore.getState().translationError).toBe("额度不足");
  expect(useArticleStore.getState().translations["a:zh-CN:ai:profile:v1"].segments).toHaveLength(1);
});
