import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { OpmlImportSettings } from "../components/app/OpmlImportSettings";
import { readOpmlFile } from "../lib/opml-import";

vi.mock("../lib/store/feedStore", () => ({ useFeedStore: { getState: () => ({ fetchFeeds: async () => {}, fetchFolders: async () => {}, selectedSource: { type: "all" } }) } }));
vi.mock("../lib/store/articleStore", () => ({ useArticleStore: { getState: () => ({ fetchArticles: async () => {} }) } }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function file(name: string, content: string): File {
  const bytes = new TextEncoder().encode(content);
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer } as File;
}

it("checks file extension and empty content", async () => {
  await expect(readOpmlFile(file("feeds.txt", "<opml/>"))).rejects.toThrow(".opml");
  await expect(readOpmlFile(file("feeds.OPML", ""))).rejects.toThrow("为空");
  expect(await readOpmlFile(file("feeds.xml", "<opml/>"))).toBe("<opml/>");
});

it("previews before confirmation and restores background results after remount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let job: Record<string, unknown> | null = null;
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/preview")) job = { id: "job", fileName: "feeds.opml", status: "preview", createdAt: 1, total: 1, folderCount: 0,
      ready: 1, pending: 0, imported: 0, failed: 0, skipped: 0, items: [] };
    if (url.endsWith("/confirm")) job = { ...job, status: "running", pending: 1, ready: 0 };
    return Response.json({ success: true, data: url.endsWith("/jobs") ? (job ? [job] : []) : job });
  });
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div"); document.body.appendChild(container);
  let root = createRoot(container);
  await act(async () => root.render(<OpmlImportSettings />));
  const input = container.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file("feeds.opml", "<opml/>")] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.textContent).toContain("可新增 1");
  expect(fetchMock.mock.calls.some(call => call[0].endsWith("/confirm"))).toBe(false);
  await act(async () => { Array.from(container.querySelectorAll("button")).find(button => button.textContent === "确认导入")!.click(); });
  expect(container.textContent).toContain("关闭页面后会继续");
  await act(async () => root.unmount());
  job = Object.assign({}, job, { status: "completed", imported: 1, pending: 0 });
  root = createRoot(container);
  await act(async () => root.render(<OpmlImportSettings />));
  expect(container.textContent).toContain("已新增 1");
  await act(async () => root.unmount()); container.remove();
});
