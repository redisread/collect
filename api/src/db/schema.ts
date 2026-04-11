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
		lastFetchedAt: text("last_fetched_at"),
		sortOrder: integer("sort_order").default(0),
		createdAt: text("created_at").default(sql`(datetime('now'))`),
		updatedAt: text("updated_at").default(sql`(datetime('now'))`),
	},
	(table) => [
		uniqueIndex("idx_feeds_url_user").on(table.url, table.userId),
		index("idx_feeds_folder_id").on(table.folderId),
		index("idx_feeds_user_id").on(table.userId),
	]
);

// 文章表（通过 feedId → feeds.userId 间接隔离）
export const articles = sqliteTable(
  "articles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16)),
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    content: text("content"),
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
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_articles_feed_id").on(table.feedId),
    index("idx_articles_published_at").on(table.publishedAt),
    index("idx_articles_is_starred").on(table.isStarred),
    index("idx_articles_is_read_later").on(table.isReadLater),
    index("idx_articles_reading_progress").on(table.readingProgress),
    index("idx_articles_last_read_at").on(table.lastReadAt),
  ]
);

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
