import { afterEach, expect, it, vi } from "vitest";
import { useFeedStore } from "../lib/store/feedStore";
import { useArticleStore } from "../lib/store/articleStore";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("refreshes the unfiled article list after deleting a folder", async () => {
  useFeedStore.setState({ selectedSource: { type: "uncategorized" }, folders: [], feeds: [], moveStatus: "删除文件夹失败，请重试" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  const refresh = vi.spyOn(useArticleStore.getState(), "fetchArticles").mockResolvedValue(true);
  await useFeedStore.getState().deleteFolder("folder");
  expect(refresh).toHaveBeenCalledWith({ type: "uncategorized" });
  expect(useFeedStore.getState().moveStatus).toBeNull();
});
