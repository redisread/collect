import { FeedFetchError, retryAfterSeconds } from "./feed-error";
import { parseFeedFromXML, type ParsedFeed } from "./parser";
import type { SyncOptions, ParsedFeedWithMeta } from "../../services/FeedSyncService";
import { fetchPublicFeed } from "./public-fetch";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1000;

interface FetchResult {
  success: boolean;
  data?: ParsedFeedWithMeta;
  notModified?: boolean;
  error?: string;
}

/** RSS Fetcher with incremental update support */
export class RSSFetcher {
  /**
   * Fetch feed with support for conditional requests
   */
  async fetch(
    feedUrl: string,
    options: SyncOptions & { maxAttempts?: number } = {}
  ): Promise<ParsedFeedWithMeta> {
    const result = await this.fetchWithRetry(feedUrl, options, 1, options.maxAttempts ?? MAX_RETRIES);

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch feed");
    }

    return result.data!;
  }

  /**
   * Fetch with retry logic and conditional headers
   */
  private async fetchWithRetry(
    feedUrl: string,
    options: SyncOptions,
    attempt: number = 1,
    maxAttempts = MAX_RETRIES
  ): Promise<FetchResult> {
    try {
      return await this.doFetch(feedUrl, options);
    } catch (err) {
      const error = err instanceof FeedFetchError ? err : new FeedFetchError("network", true);

      // HTTP backoff belongs to the queue consumer; keep inline retries for network errors only.
      if (error.code === "network" && attempt < maxAttempts) {
        await this.delay(RETRY_DELAY_MS * attempt);
        return this.fetchWithRetry(feedUrl, options, attempt + 1, maxAttempts);
      }

      throw error;
    }
  }

  /**
   * Perform the actual fetch with conditional headers
   */
  private async doFetch(
    feedUrl: string,
    options: SyncOptions
  ): Promise<FetchResult> {
    // Build request headers
    const headers: Record<string, string> = {
      "User-Agent": "Folio RSS Reader/1.0",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    };

    // Add conditional request headers
    if (options.etag) {
      headers["If-None-Match"] = options.etag;
    }
    if (options.lastModified) {
      headers["If-Modified-Since"] = options.lastModified;
    }

    const response = await fetchPublicFeed(feedUrl, {
      method: "GET",
      headers,
      // Cloudflare Workers supports AbortSignal.timeout
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // Handle 304 Not Modified
    if (response.status === 304) {
      return {
        success: true,
        notModified: true,
        data: {
          title: "",
          description: "",
          siteUrl: "",
          faviconUrl: null,
          articles: [],
          notModified: true,
        },
      };
    }

    if (!response.ok) {
      await response.body?.cancel();
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new FeedFetchError(retryable ? "http_transient" : "http_permanent", retryable,
        retryAfterSeconds(response.headers.get("Retry-After")));
    }

    // Get cache-related headers
    const etag = response.headers.get("ETag");
    const lastModified = response.headers.get("Last-Modified");

    // Get response body
    const xmlText = await response.text();

    if (!xmlText.trim()) {
      throw new FeedFetchError("invalid_feed", false);
    }

    // Parse the feed
    let parsed: ParsedFeed;
    try { parsed = await parseFeedFromXML(xmlText); } catch { throw new FeedFetchError("invalid_feed", false); }

    // Calculate content hash for additional change detection
    const hash = this.hashContent(xmlText);

    return {
      success: true,
      data: {
        ...parsed,
        etag: etag ?? undefined,
        lastModified: lastModified ?? undefined,
        hash,
        notModified: false,
      },
    };
  }

  /**
   * Hash content for change detection
   */
  private hashContent(content: string): string {
    // Simple hash - in production, use a proper hash function
    // Note: Cloudflare Workers supports crypto.subtle but not Node's crypto module
    // Using a simple hash for now
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Legacy fetch function for backward compatibility */
export async function fetchFeed(feedUrl: string): Promise<ParsedFeed> {
  const fetcher = new RSSFetcher();
  return await fetcher.fetch(feedUrl);
}
