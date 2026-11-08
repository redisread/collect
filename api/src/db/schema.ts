import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ─── Better Auth 四张表 ───────────────────────────────────────────────────────

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
	image: text("image"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	// 邮件订阅配置
	emailDigestEnabled: integer("email_digest_enabled", { mode: "boolean" }).default(false),
	emailDigestFrequency: text("email_digest_frequency").default("daily"), // "daily" | "weekly" | "off"
	emailDigestTime: text("email_digest_time").default("09:00"), // 发送时间 HH:MM
	emailDigestDay: integer("email_digest_day").default(1), // 每周几发送（1-7，周日=0或7）
	lastDigestSentAt: text("last_digest_sent_at"), // 上次发送时间
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
	issuer: text("issuer").notNull().default("local:credential"),
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
}, (table) => [uniqueIndex("account_issuer_account_id_unique").on(table.issuer, table.accountId)]);

export const verification = sqliteTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }),
	updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ─── 业务表 ───────────────────────────────────────────────────────────────────

// 文件夹表
export const folders = sqliteTable(
	"folders",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
		userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		color: text("color").default("#777777"),
		icon: text("icon"),
		sortOrder: integer("sort_order").default(0),
		isCollapsed: integer("is_collapsed", { mode: "boolean" }).default(false),
		createdAt: text("created_at").default(sql`(datetime('now'))`),
		updatedAt: text("updated_at").default(sql`(datetime('now'))`),
	},
	(table) => [index("idx_folders_user_id").on(table.userId)]
);

// 订阅源表
export const feeds = sqliteTable(
	"feeds",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
		userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
		folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
		title: text("title").notNull(),
		url: text("url").notNull(),
		feedUrl: text("feed_url").notNull(),
		description: text("description"),
		faviconUrl: text("favicon_url"),
		// 健康度追踪字段
		healthStatus: text("health_status").default("healthy"), // healthy | degraded | error | stale
		consecutiveErrors: integer("consecutive_errors").default(0),
		lastErrorMessage: text("last_error_message"),
		lastErrorAt: text("last_error_at"),
		// 增量更新字段
		lastEtag: text("last_etag"),
		lastModified: text("last_modified"),
		contentHash: text("content_hash"),
		// 调度字段
		nextFetchAt: text("next_fetch_at"),
		fetchIntervalMinutes: integer("fetch_interval_minutes").default(60),
		// 统计字段
		cachedArticleCount: integer("cached_article_count").default(0),
		cachedUnreadCount: integer("cached_unread_count").default(0),
		// 状态字段
		isActive: integer("is_active", { mode: "boolean" }).default(true),
		lastFetchedAt: text("last_fetched_at"),
		sortOrder: integer("sort_order").default(0),
		createdAt: text("created_at").default(sql`(datetime('now'))`),
		updatedAt: text("updated_at").default(sql`(datetime('now'))`),
	},
	(table) => [
		uniqueIndex("idx_feeds_feed_url_user").on(table.feedUrl, table.userId),
		index("idx_feeds_folder_id").on(table.folderId),
		index("idx_feeds_user_id").on(table.userId),
		index("idx_feeds_health_status").on(table.healthStatus),
		index("idx_feeds_next_fetch_at").on(table.nextFetchAt),
		index("idx_feeds_active").on(table.isActive),
	]
);

// 文章表（通过 feedId → feeds.userId 间接隔离）
export const articles = sqliteTable(
  "articles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    content: text("content"),
    contentText: text("content_text"), // 纯文本内容，用于搜索
    summary: text("summary"),
    author: text("author"),
    imageUrl: text("image_url"),
    publishedAt: text("published_at"),
    isRead: integer("is_read", { mode: "boolean" }).default(false),
    isStarred: integer("is_starred", { mode: "boolean" }).default(false),
    isReadLater: integer("is_read_later", { mode: "boolean" }).default(false),
    isExtracted: integer("is_extracted", { mode: "boolean" }).default(false),
    extractedAt: text("extracted_at"),
    // 阅读进度相关字段
    readingProgress: integer("reading_progress").default(0), // 0-100 阅读百分比
    lastReadPosition: text("last_read_position"), // 最后阅读位置（CSS selector 或 anchor）
    lastReadAt: text("last_read_at"), // 最后阅读时间
    estimatedReadTime: integer("estimated_read_time"), // 预估阅读时间（分钟）
    // 保留策略
    retentionDate: text("retention_date"), // 保留到此日期
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_articles_feed_id").on(table.feedId),
    index("idx_articles_user_id").on(table.userId),
    index("idx_articles_published_at").on(table.publishedAt),
    index("idx_articles_is_starred").on(table.isStarred),
    index("idx_articles_is_read_later").on(table.isReadLater),
    index("idx_articles_reading_progress").on(table.readingProgress),
    index("idx_articles_last_read_at").on(table.lastReadAt),
    index("idx_articles_user_published").on(table.userId, table.publishedAt),
  ]
);

export const opmlImportJobs = sqliteTable("opml_import_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  status: text("status").notNull().default("preview"),
  createdAt: integer("created_at").notNull(),
  confirmedAt: integer("confirmed_at"),
}, table => [index("idx_opml_jobs_user_created").on(table.userId, table.createdAt)]);

export const opmlImportItems = sqliteTable("opml_import_items", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => opmlImportJobs.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  feedUrl: text("feed_url").notNull(),
  siteUrl: text("site_url"),
  folderName: text("folder_name"),
  status: text("status").notNull(),
  message: text("message"),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: text("lease_token"),
  leaseUntil: integer("lease_until").notNull().default(0),
  nextDispatchAt: integer("next_dispatch_at").notNull().default(0),
}, table => [index("idx_opml_items_job").on(table.jobId), index("idx_opml_items_dispatch").on(table.status, table.nextDispatchAt)]);

// 智能文件夹表
export const smartFolders = sqliteTable(
  "smart_folders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#777777"),
    icon: text("icon"),
    rules: text("rules").notNull(), // JSON 字符串存储规则
    sortOrder: integer("sort_order").default(0),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_smart_folders_user_id").on(table.userId),
  ]
);

// 文章标注/笔记表
export const annotations = sqliteTable(
  "annotations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
    articleId: text("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "highlight" | "note"
    content: text("content").notNull(), // 标注内容或笔记内容
    textRange: text("text_range"), // 选中的文本范围（JSON：{ start: string, end: string, text: string }）
    color: text("color").default("#FFEB3B"), // 高亮颜色
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_annotations_article_id").on(table.articleId),
    index("idx_annotations_user_id").on(table.userId),
  ]
);

// 阅读统计表
export const readingStats = sqliteTable(
  "reading_stats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD 格式
    articlesRead: integer("articles_read").default(0),
    articlesStarred: integer("articles_starred").default(0),
    readingTimeMinutes: integer("reading_time_minutes").default(0),
  },
  (table) => [
    uniqueIndex("idx_stats_user_date").on(table.userId, table.date),
  ]
);

// ─── 导出类型 ─────────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type SmartFolder = typeof smartFolders.$inferSelect;
export type NewSmartFolder = typeof smartFolders.$inferInsert;
export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;
export type ReadingStat = typeof readingStats.$inferSelect;
export type NewReadingStat = typeof readingStats.$inferInsert;

// 带未读数的订阅源类型
export type FeedWithUnreadCount = Feed & { unreadCount: number };
// 带文章数的文件夹类型
export type FolderWithFeeds = Folder & { feeds: FeedWithUnreadCount[] };

// 智能文件夹规则类型
export interface SmartFolderCondition {
  field: "title" | "content" | "summary" | "author" | "feedId";
  operator: "contains" | "equals" | "startsWith" | "endsWith";
  value: string;
}

export interface SmartFolderRules {
  operator: "AND" | "OR";
  conditions: SmartFolderCondition[];
}

// ─── RSS 同步相关枚举和表 ──────────────────────────────────────────────────────

// 订阅源健康状态
export enum FeedHealthStatus {
  HEALTHY = "healthy",       // 正常
  DEGRADED = "degraded",     // 降级（偶尔失败）
  ERROR = "error",           // 错误（多次失败）
  STALE = "stale",           // 过期（长时间未更新）
}

// 队列状态
export enum QueueStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

// 用户偏好表
export const userPreferences = sqliteTable(
  "user_preferences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    // 文章设置
    maxArticlesPerFeed: integer("max_articles_per_feed").default(100), // 每个订阅源保留的最大文章数
    articleRetentionDays: integer("article_retention_days").default(30), // 文章保留天数（0=永久）
    defaultView: text("default_view").default("all"), // "all" | "unread" | "starred" | "read-later"
    // 刷新设置
    refreshIntervalMinutes: integer("refresh_interval_minutes").default(30), // 默认刷新间隔
    // 界面设置
    theme: text("theme").default("system"), // "light" | "dark" | "system"
    fontSize: integer("font_size").default(16),
    showImages: integer("show_images", { mode: "boolean" }).default(true),
    autoMarkAsRead: integer("auto_mark_as_read", { mode: "boolean" }).default(false),
    translationTargetLanguage: text("translation_target_language").notNull().default("zh-CN"),
    translationProviderId: text("translation_provider_id"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_user_prefs_user_id").on(table.userId),
  ]
);

export const aiProfiles = sqliteTable("ai_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  revision: text("revision").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("idx_ai_profiles_user").on(table.userId)]);

export const aiTranslationJobs = sqliteTable("ai_translation_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  articleId: text("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => aiProfiles.id, { onDelete: "cascade" }),
  revision: text("revision").notNull(),
  targetLang: text("target_lang").notNull(),
  contentHash: text("content_hash").notNull(),
  plan: text("plan").notNull(),
  results: text("results").notNull().default("[]"),
  completed: integer("completed").notNull().default(0),
  leaseToken: text("lease_token"),
  leaseUntil: integer("lease_until").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, table => [index("idx_ai_translation_jobs_user_article").on(table.userId, table.articleId)]);

// RSS 抓取任务队列表
export const fetchQueue = sqliteTable(
  "fetch_queue",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
    feedId: text("feed_id").notNull().references(() => feeds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default(QueueStatus.PENDING),
    priority: integer("priority").default(5), // 1-10，数字越大优先级越高
    retryCount: integer("retry_count").default(0),
    scheduledAt: text("scheduled_at").default(sql`(datetime('now'))`),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
    result: text("result"), // JSON 字符串存储结果
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_queue_status").on(table.status),
    index("idx_queue_scheduled").on(table.scheduledAt),
    index("idx_queue_feed").on(table.feedId),
    index("idx_queue_status_scheduled").on(table.status, table.scheduledAt),
  ]
);

// 同步状态表（用于多端同步追踪）
export const syncStates = sqliteTable(
  "sync_states",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    deviceId: text("device_id"), // 可选，用于区分不同设备
    lastSyncAt: text("last_sync_at"),
    lastArticleId: text("last_article_id"), // 最后同步的文章 ID
    lastFeedId: text("last_feed_id"), // 最后同步的订阅源 ID
    syncVersion: integer("sync_version").default(1),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_sync_states_user_device").on(table.userId, table.deviceId),
  ]
);

// 翻译历史表
export const translationHistory = sqliteTable(
  "translation_history",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    articleId: text("article_id").notNull(),
    targetLang: text("target_lang").notNull(),
    sourceLang: text("source_lang").default("auto"),
    articleTitle: text("article_title"),
    feedName: text("feed_name"),
    translatedAt: text("translated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_translation_history_user_id").on(table.userId),
    index("idx_translation_history_translated_at").on(table.translatedAt),
    index("idx_translation_history_user_article").on(table.userId, table.articleId),
  ]
);

export type TranslationHistory = typeof translationHistory.$inferSelect;
export type NewTranslationHistory = typeof translationHistory.$inferInsert;

// ─── 导出更多类型 ─────────────────────────────────────────────────────────────

export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
export type FetchQueue = typeof fetchQueue.$inferSelect;
export type NewFetchQueue = typeof fetchQueue.$inferInsert;
export type SyncState = typeof syncStates.$inferSelect;
export type NewSyncState = typeof syncStates.$inferInsert;
