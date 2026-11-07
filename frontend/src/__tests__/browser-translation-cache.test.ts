import { afterEach, expect, it, vi } from "vitest";
import { translateInBrowser } from "../lib/translate-browser";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("uses two concurrent requests and a thirty-second request timeout in the browser", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
  const finish: (() => void)[] = [];
  const fetchMock = vi.fn().mockImplementation((url: URL) => new Promise(resolve => {
    finish.push(() => resolve(Response.json([[["译" + url.searchParams.get("q")]], null, "en"])));
  }));
  vi.stubGlobal("fetch", fetchMock);
  const pending = translateInBrowser("<p>Concurrency first</p><p>Concurrency second</p><p>Concurrency third</p>", "zh-CN", new AbortController().signal);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(timeout).toHaveBeenCalledWith(30_000);
  finish[0]();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  finish[1]();
  finish[2]();
  expect((await pending).segments).toHaveLength(3);
});
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
