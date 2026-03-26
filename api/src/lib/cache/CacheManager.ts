/**
 * Multi-tier Cache Strategy
 *
 * L1: Memory (request-level, not implemented due to Workers stateless nature)
 * L2: KV (warm data, cross-request)
 * L3: D1 (cold data, source of truth)
 */

export interface CacheConfig {
  ttl: number; // seconds
  staleWhileRevalidate?: number; // seconds
}

export const CACHE_CONFIGS = {
  // Feed list (changes infrequently)
  feedList: { ttl: 300, staleWhileRevalidate: 600 },

  // Unread counts (frequently changing but short staleness acceptable)
  unreadCount: { ttl: 60, staleWhileRevalidate: 120 },

  // Article list (cursor-based, cache cursor data)
  articleList: { ttl: 180 },

  // User preferences
  userPrefs: { ttl: 600 },

  // RSS content (origin-level cache)
  rssContent: { ttl: 300 },

  // Article URLs for deduplication
  articleUrls: { ttl: 3600 },
} as const;

export type CacheKey = keyof typeof CACHE_CONFIGS;

export class CacheManager {
  constructor(private kv: KVNamespace) {}

  /**
   * Get or set cache value
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    // Try KV first
    const cached = await this.kv.get(key, "json");
    if (cached) {
      return cached as T;
    }

    // Execute query
    const data = await factory();

    // Write to KV
    await this.kv.put(key, JSON.stringify(data), {
      expirationTtl: config.ttl,
    });

    return data;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    const cached = await this.kv.get(key, "json");
    return cached as T | null;
  }

  /**
   * Set cached value
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), {
      expirationTtl: ttl,
    });
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  /**
   * Batch get (reduce KV requests)
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    // Cloudflare KV doesn't support native mget, parallel requests
    const results = await Promise.all(
      keys.map(async (key) => {
        const value = await this.kv.get(key, "json");
        return { key, value: value as T | null };
      })
    );

    const map = new Map<string, T>();
    for (const { key, value } of results) {
      if (value) map.set(key, value);
    }
    return map;
  }

  /**
   * Batch delete
   */
  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.kv.delete(key)));
  }

  /**
   * Invalidate user-related caches
   */
  async invalidateUser(userId: string): Promise<void> {
    const keys = [
      CacheManager.key(["user", userId, "feeds"]),
      CacheManager.key(["user", userId, "folders"]),
      CacheManager.key(["user", userId, "unread_count"]),
      CacheManager.key(["user", userId, "prefs"]),
    ];
    await this.deleteMany(keys);
  }

  /**
   * Invalidate feed-related caches
   */
  async invalidateFeed(feedId: string, userId: string): Promise<void> {
    const keys = [
      CacheManager.key(["feed", feedId, "urls"]),
      CacheManager.key(["feed", feedId, "articles"]),
      CacheManager.key(["user", userId, "feeds"]),
      CacheManager.key(["user", userId, "unread_count"]),
    ];
    await this.deleteMany(keys);
  }

  /**
   * Build cache key
   */
  static key(parts: string[]): string {
    return parts.join(":");
  }

  /**
   * Build user feed list key
   */
  static userFeedsKey(userId: string): string {
    return CacheManager.key(["user", userId, "feeds"]);
  }

  /**
   * Build user folders key
   */
  static userFoldersKey(userId: string): string {
    return CacheManager.key(["user", userId, "folders"]);
  }

  /**
   * Build user unread count key
   */
  static userUnreadKey(userId: string): string {
    return CacheManager.key(["user", userId, "unread_count"]);
  }

  /**
   * Build user preferences key
   */
  static userPrefsKey(userId: string): string {
    return CacheManager.key(["user", userId, "prefs"]);
  }

  /**
   * Build feed article URLs key
   */
  static feedUrlsKey(feedId: string): string {
    return CacheManager.key(["feed", feedId, "urls"]);
  }

  /**
   * Build article list key
   */
  static articleListKey(userId: string, cursor?: string): string {
    const parts = ["user", userId, "articles"];
    if (cursor) parts.push(cursor);
    return CacheManager.key(parts);
  }
}
