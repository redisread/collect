import { afterEach, expect, it, vi } from "vitest";
import { fetchPublicFeed, normalizeFeedUrl } from "../lib/rss/public-fetch";
import { isPublicAddress } from "../lib/public-address";

afterEach(() => vi.unstubAllGlobals());

it("normalizes feed identities without discarding meaningful query parameters", () => {
  expect(normalizeFeedUrl(" HTTPS://EXAMPLE.COM:443/rss?a=1&b=2#section ")).toBe("https://example.com/rss?a=1&b=2");
  for (const url of ["file:///secret", "http://127.0.0.1/rss", "https://[::1]/rss", "http://localhost/rss", "http://host.local/rss", "https://user:pass@example.com/rss"]) {
    expect(() => normalizeFeedUrl(url)).toThrow();
  }
  expect(isPublicAddress("198.51.1.1")).toBe(true);
  expect(isPublicAddress("203.0.114.1")).toBe(true);
  expect(isPublicAddress("198.51.100.1")).toBe(false);
  expect(isPublicAddress("203.0.113.1")).toBe(false);
});

it("blocks redirect targets that resolve to private addresses", async () => {
  const fetchMock = vi.fn().mockImplementation(async (input: URL | string) => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com") return Response.json({ Status: 0, Answer: [{ type: 1, data: url.searchParams.get("name") === "private.example.com" ? "127.0.0.1" : "8.8.8.8" }] });
    return new Response(null, { status: 302, headers: { Location: "https://private.example.com/rss" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  await expect(fetchPublicFeed("https://example.com/rss", {})).rejects.toThrow("公网");
  expect(fetchMock.mock.calls.some(call => String(call[0]).startsWith("https://private.example.com"))).toBe(false);
});

it("bounds feed response bodies", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: URL | string) => {
    if (String(input).startsWith("https://cloudflare-dns.com")) return Response.json({ Status: 0, Answer: [{ type: 1, data: "8.8.8.8" }] });
    return new Response("x".repeat(5 * 1024 * 1024 + 1));
  }));
  await expect(fetchPublicFeed("https://example.com/rss", {})).rejects.toThrow("5 MB");
});
