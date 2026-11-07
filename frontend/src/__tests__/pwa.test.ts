import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { URL as NodeURL } from "node:url";
import { expect, it, vi } from "vitest";

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const offline = new Response("offline");
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(offline) };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(["collect-public-old", "another-cache"]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  const self = {
    location: { origin: "https://collect.test" },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener: (type: string, handler: (event: any) => void) => { handlers[type] = handler; },
  };
  runInNewContext(readFileSync(new NodeURL("../../public/sw.js", import.meta.url), "utf8"), { self, caches, fetch, URL, Response });
  return { handlers, cache, caches, self };
}

it("precaches only public PWA files and serves a fallback when navigation is offline", async () => {
  const { handlers, cache } = worker();
  let pending!: Promise<unknown>;
  handlers.install({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending;
  expect(cache.addAll.mock.calls[0][0]).toContain("/offline");
  expect(cache.addAll.mock.calls[0][0]).not.toContain("/offline.html");
  expect(cache.addAll.mock.calls[0][0]).not.toContain("/");
  handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://collect.test/" },
    respondWith: (promise: Promise<unknown>) => { pending = promise; } });
  expect(await (await pending as Response).text()).toBe("offline");
});

it.each(["https://collect.test/api/auth/get-session", "https://collect.test/api/articles/one", "https://translate.googleapis.com/translate_a/single"])("does not cache %s", url => {
  const { handlers } = worker();
  const respondWith = vi.fn();
  handlers.fetch({ request: { method: "GET", mode: "navigate", url }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
});

it("cleans only its own old public cache and activates updates on request", async () => {
  const { handlers, caches, self } = worker();
  let pending!: Promise<unknown>;
  const waitUntil = (promise: Promise<unknown>) => { pending = promise; };
  handlers.activate({ waitUntil });
  await pending;
  expect(caches.delete).toHaveBeenCalledExactlyOnceWith("collect-public-old");
  handlers.message({ data: { type: "SKIP_WAITING" }, waitUntil });
  await pending;
  expect(self.skipWaiting).toHaveBeenCalledOnce();
});

it("declares standalone installation with valid raster icon dimensions", () => {
  const manifest = JSON.parse(readFileSync(new NodeURL("../../public/manifest.webmanifest", import.meta.url), "utf8"));
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  for (const icon of manifest.icons) {
    const png = readFileSync(new NodeURL("../../public" + icon.src, import.meta.url));
    const size = Number(icon.sizes.split("x")[0]);
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
});
