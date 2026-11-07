import { afterEach, expect, it, vi } from "vitest";
import { translateInBrowser } from "../lib/translate-browser";

afterEach(() => vi.unstubAllGlobals());
it("reuses successful segments when a browser retry follows an upstream failure", async () => {
  const fetchMock = vi.fn().mockImplementation((url: URL) => {
    const text = url.searchParams.get("q");
    return Promise.resolve(text === "Cache first" ? Response.json([[["第一段"]], null, "en"]) : new Response("denied", { status: 403 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const content = "<p>Cache first</p><p>Retry second</p>";
  await expect(translateInBrowser(content, "zh-CN", new AbortController().signal)).rejects.toThrow();
  fetchMock.mockClear().mockImplementation(() => Promise.resolve(Response.json([[["第二段"]], null, "en"])));
  const result = await translateInBrowser(content, "zh-CN", new AbortController().signal);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.segments.map(segment => segment.translated)).toEqual(["第一段", "第二段"]);
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("headers.Authorization");
});
