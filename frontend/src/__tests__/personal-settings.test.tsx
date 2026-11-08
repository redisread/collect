import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PersonalSettings } from "../components/app/PersonalSettings";
import { readTranslationLanguage, saveTranslationLanguage } from "../lib/settings";
import { useArticleStore } from "../lib/store/articleStore";

vi.mock("../lib/settings", () => ({ readTranslationLanguage: vi.fn(), saveTranslationLanguage: vi.fn() }));
vi.mock("../components/app/AiTranslationSettings", () => ({ AiTranslationSettings: () => null }));
vi.mock("../lib/store/aiSettingsStore", () => ({ useAiSettingsStore: { getState: () => ({ load: async () => {}, profiles: [], activeProfileId: null }) } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("loads the account preference, preserves failed edits, and confirms a successful save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useArticleStore.getState().setTargetLanguage("zh-CN");
  vi.mocked(readTranslationLanguage).mockResolvedValue("fr");
  vi.mocked(saveTranslationLanguage).mockRejectedValueOnce(new Error("offline")).mockResolvedValue("ja");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<PersonalSettings />));
  const select = container.querySelector("select")!;
  expect(select.value).toBe("fr");
  await act(async () => {
    select.value = "ja";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const submit = () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => { submit(); });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("保存失败");
  expect(select.value).toBe("ja");
  expect(useArticleStore.getState().targetLanguage).toBe("fr");
  await act(async () => { submit(); });
  expect(saveTranslationLanguage).toHaveBeenLastCalledWith("ja");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("下次翻译时生效");
  expect(useArticleStore.getState().targetLanguage).toBe("ja");
  await act(async () => root.unmount());
  container.remove();
});
