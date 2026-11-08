import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ArticleReader } from "../components/app/article/ArticleReader";
import { useArticleStore } from "../lib/store/articleStore";
import type { Article } from "../lib/types";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps the annotation toolbar available for the original text in bilingual view", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(useArticleStore.getState(), "loadAnnotations").mockResolvedValue();
  vi.spyOn(useArticleStore.getState(), "getReadingProgress").mockResolvedValue(null);
  useArticleStore.setState({
    selectedArticleId: "annotation-test",
    selectedArticle: { id: "annotation-test", title: "Reading", content: "<p>Hello world</p>" } as Article,
    detailError: null, isLoadingDetail: false, annotations: [], translations: {}, targetLanguage: "zh-CN",
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<ArticleReader />));
  await act(async () => useArticleStore.setState({ translations: {
    "annotation-test:zh-CN": {
      original: "<p>Hello world</p>", translated: "你好", targetLang: "zh-CN",
      bilingualHtml: '<p>Hello world<span class="translation-text">你好</span></p>',
    },
  } }));
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("双语");
  await act(async () => useArticleStore.getState().setTargetLanguage("ja"));
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("双语");
  expect(container.querySelector(".translation-text")?.textContent).toBe("你好");
  const paragraph = container.querySelector(".article-content p")!;
  const range = document.createRange();
  range.setStart(paragraph.firstChild!, 0);
  range.setEnd(paragraph.firstChild!, 5);
  Object.defineProperty(range, "getBoundingClientRect", { value: () => ({ top: 100, left: 100, width: 50 }) });
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  await act(async () => { paragraph.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
  expect(container.querySelector('button[title="黄色"]')).not.toBeNull();
  window.getSelection()!.removeAllRanges();
  await act(async () => root.unmount());
  container.remove();
});
