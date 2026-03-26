import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ─── Helper Functions ───────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Better Auth Tables ───────────────────────────────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ─── Business Tables ──────────────────────────────────────────────────────────

// Folders Table
export const folders = sqliteTable(
  "folders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#777777"),
    icon: text("icon"),
    sortOrder: integer("sort_order").default(0),
    isCollapsed: integer("is_collapsed", { mode: "boolean" }).default(false),
    cachedFeedCount: integer("cached_feed_count").default(0),
    cachedUnreadCount: integer("cached_unread_count").default(0),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_folders_user_id").on(table.userId),
    index("idx_folders_user_sort").on(table.userId, table.sortOrder),
  ]
);

// Feeds Table
export const feeds = sqliteTable(
  "feeds",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    feedUrl: text("feed_url").notNull(),
    description: text("description"),
    faviconUrl: text("favicon_url"),
    // Fetch configuration
    fetchIntervalMinutes: integer("fetch_interval_minutes").default(60),
    lastFetchedAt: text("last_fetched_at"),
    nextFetchAt: text("next_fetch_at"),
    // Health tracking
    healthStatus: text("health_status").default("healthy"),
    consecutiveErrors: integer("consecutive_errors").default(0),
    lastErrorMessage: text("last_error_message"),
    lastErrorAt: text("last_error_at"),
    // Incremental update
    lastEtag: text("last_etag"),
    lastModified: text("last_modified"),
    contentHash: text("content_hash"),
    // Statistics cache
    cachedArticleCount: integer("cached_article_count").default(0),
    cachedUnreadCount: integer("cached_unread_count").default(0),
    sortOrder: integer("sort_order").default(0),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
  },
  (table) => [
    uniqueIndex("idx_feeds_url_user").on(table.feedUrl, table.userId),
    index("idx_feeds_user_id").on(table.userId),
    index("idx_feeds_folder_id").on(table.folderId),
    index("idx_feeds_next_fetch").on(table.nextFetchAt, table.isActive),
    index("idx_feeds_health").on(table.healthStatus),
  ]
);

// Articles Table
export const articles = sqliteTable(
  "articles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    feedId: text("feed_id").notNull().references(() => feeds.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    content: text("content"),
    contentText: text("content_text"),
    summary: text("summary"),
    author: text("author"),
    imageUrl: text("image_url"),
    publishedAt: text("published_at"),
    isRead: integer("is_read", { mode: "boolean" }).default(false),
    isStarred: integer("is_starred", { mode: "boolean" }).default(false),
    isReadLater: integer("is_read_later", { mode: "boolean" }).default(false),
    readAt: text("read_at"),
    isContentFetched: integer("is_content_fetched", { mode: "boolean" }).default(false),
    contentFetchedAt: text("content_fetched_at"),
    retentionDate: text("retention_date"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_articles_user_id").on(table.userId),
    index("idx_articles_user_feed").on(table.userId, table.feedId),
    index("idx_articles_user_published").on(table.userId, table.publishedAt),
    index("idx_articles_user_read").on(table.userId, table.isRead),
    index("idx_articles_user_starred").on(table.userId, table.isStarred),
    index("idx_articles_user_read_later").on(table.userId, table.isReadLater),
    index("idx_articles_url").on(table.url),
    index("idx_articles_retention").on(table.retentionDate),
  ]
);

// Fetch Queue Table
export const fetchQueue = sqliteTable(
  "fetch_queue",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    feedId: text("feed_id").notNull().references(() => feeds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    status: text("status").notNull().default("pending"),
    priority: integer("priority").default(0),
    scheduledAt: text("scheduled_at").default(sql`(datetime('now'))`),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0),
    result: text("result"),
  },
  (table) => [
    index("idx_queue_status_scheduled").on(table.status, table.scheduledAt),
    index("idx_queue_feed").on(table.feedId),
    index("idx_queue_user").on(table.userId),
  ]
);

// User Preferences Table
export const userPreferences = sqliteTable(
  "user_preferences",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
    defaultView: text("default_view").default("unread"),
    articlesPerPage: integer("articles_per_page").default(30),
    markReadOnScroll: integer("mark_read_on_scroll", { mode: "boolean" }).default(false),
    showThumbnails: integer("show_thumbnails", { mode: "boolean" }).default(true),
    articleRetentionDays: integer("article_retention_days").default(30),
    maxArticlesPerFeed: integer("max_articles_per_feed").default(100),
    emailDigestEnabled: integer("email_digest_enabled", { mode: "boolean" }).default(false),
    emailDigestFrequency: text("email_digest_frequency").default("daily"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_prefs_user").on(table.userId),
  ]
);

// Sync States Table
export const syncStates = sqliteTable(
  "sync_states",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    lastSyncAt: text("last_sync_at").notNull(),
    syncToken: text("sync_token").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_sync_user_device").on(table.userId, table.deviceId),
  ]
);

// ─── Export Types ─────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type FetchQueue = typeof fetchQueue.$inferSelect;
export type NewFetchQueue = typeof fetchQueue.$inferInsert;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
export type SyncState = typeof syncStates.$inferSelect;
export type NewSyncState = typeof syncStates.$inferInsert;

// Extended types
export type FeedWithUnreadCount = Feed & { unreadCount: number };
export type FolderWithFeeds = Folder & { feeds: FeedWithUnreadCount[] };

// Feed health status
export const FeedHealthStatus = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  ERROR: "error",
  STALE: "stale",
} as const;

export type FeedHealthStatusType = typeof FeedHealthStatus[keyof typeof FeedHealthStatus];

// Queue status
export const QueueStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type QueueStatusType = typeof QueueStatus[keyof typeof QueueStatus];
