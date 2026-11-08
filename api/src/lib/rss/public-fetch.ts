import { FeedFetchError } from "./feed-error";
import { isIP } from "node:net";
import { isPublicAddress } from "../public-address";

export function normalizeFeedUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new FeedFetchError("blocked_feed", false, 60, "订阅地址必须指向公网"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    isIP(url.hostname) || url.hostname.includes(":") || !url.hostname.includes(".") ||
    /\.(localhost|local|internal|test|invalid)$/.test(url.hostname) || url.hostname.endsWith(".")) {
    throw new FeedFetchError("blocked_feed", false, 60, "订阅地址必须指向公网");
  }
  url.hash = "";
  return url.toString();
}

async function validateHost(host: string, signal?: AbortSignal | null) {
  const answers = await Promise.all(["A", "AAAA"].map(async type => {
    const url = new URL("https://cloudflare-dns.com/dns-query");
    url.search = new URLSearchParams({ name: host, type }).toString();
    const response = await fetch(url, { headers: { Accept: "application/dns-json" }, signal });
    if (!response.ok) throw new Error("订阅域名解析失败");
    const data = await response.json() as { Status: number; Answer?: { type: number; data: string }[] };
    if (data.Status !== 0) throw new Error("订阅域名解析失败");
    return (data.Answer ?? []).filter(answer => answer.type === 1 || answer.type === 28).map(answer => answer.data);
  }));
  if (!answers.flat().length || answers.flat().some(address => !isPublicAddress(address))) throw new FeedFetchError("blocked_feed", false, 60, "订阅地址必须指向公网");
}

/** Re-check redirect destinations and bound decompressed feed bodies. */
export async function fetchPublicFeed(input: string, options: RequestInit): Promise<Response> {
  let url = normalizeFeedUrl(input);
  for (let redirects = 0; redirects <= 5; redirects++) {
    await validateHost(new URL(url).hostname, options.signal);
    const response = await fetch(url, { ...options, redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      await response.body?.cancel();
      if (!location || redirects === 5) throw new FeedFetchError("blocked_feed", false, 60, "订阅地址必须指向公网");
      url = normalizeFeedUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) return response;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 5 * 1024 * 1024) throw new FeedFetchError("blocked_feed", false, 60, "订阅源内容超过 5 MB");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const content = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
    const headers = new Headers(response.headers);
    headers.delete("Content-Encoding");
    headers.delete("Content-Length");
    return new Response(content, { status: response.status, headers });
  }
  throw new FeedFetchError("blocked_feed", false, 60, "订阅地址必须指向公网");
}
