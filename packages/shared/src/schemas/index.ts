import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Extend Zod with OpenAPI
extendZodWithOpenApi(z);

// ─── 用户类型 ─────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().openapi({ example: "user_123" }),
  name: z.string().openapi({ example: "John Doe" }),
  email: z.string().email().openapi({ example: "john@example.com" }),
  emailVerified: z.boolean().openapi({ example: true }),
  image: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export type User = z.infer<typeof UserSchema>;

// ─── 文件夹类型 ───────────────────────────────────────────────────────────────

export const FolderSchema = z.object({
  id: z.string().openapi({ example: "folder_123" }),
  userId: z.string(),
  name: z.string().min(1).max(100).openapi({ example: "Tech News" }),
  color: z.string().nullable().optional().openapi({ example: "#6366f1" }),
  icon: z.string().nullable().optional().openapi({ example: "folder" }),
  sortOrder: z.number().optional().openapi({ example: 0 }),
  isCollapsed: z.boolean().optional().openapi({ example: false }),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export type Folder = z.infer<typeof FolderSchema>;

export const CreateFolderSchema = z.object({
  name: z.string().min(1).max(100).openapi({ example: "Tech News" }),
  color: z.string().optional().openapi({ example: "#6366f1" }),
  icon: z.string().optional().openapi({ example: "folder" }),
});

export type CreateFolderInput = z.infer<typeof CreateFolderSchema>;

export const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
  isCollapsed: z.boolean().optional(),
});

export type UpdateFolderInput = z.infer<typeof UpdateFolderSchema>;

// ─── 订阅源类型 ───────────────────────────────────────────────────────────────

export const FeedSchema = z.object({
  id: z.string().openapi({ example: "feed_123" }),
  userId: z.string(),
  folderId: z.string().nullable().optional(),
  title: z.string().openapi({ example: "TechCrunch" }),
  url: z.string().url().openapi({ example: "https://techcrunch.com" }),
  feedUrl: z.string().url().openapi({ example: "https://techcrunch.com/feed/" }),
  description: z.string().nullable().optional(),
  faviconUrl: z.string().nullable().optional(),
  lastFetchedAt: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export type Feed = z.infer<typeof FeedSchema>;

export const FeedWithUnreadCountSchema = FeedSchema.extend({
  unreadCount: z.number().openapi({ example: 5 }),
});

export type FeedWithUnreadCount = z.infer<typeof FeedWithUnreadCountSchema>;

export const CreateFeedSchema = z.object({
  url: z.string().url().openapi({ example: "https://example.com/rss.xml" }),
  folderId: z.string().optional(),
});

export type CreateFeedInput = z.infer<typeof CreateFeedSchema>;

export const UpdateFeedSchema = z.object({
  title: z.string().optional(),
  folderId: z.string().optional(),
  sortOrder: z.number().optional(),
});

export type UpdateFeedInput = z.infer<typeof UpdateFeedSchema>;

// ─── 文章类型 ─────────────────────────────────────────────────────────────────

export const ArticleSchema = z.object({
  id: z.string().openapi({ example: "article_123" }),
  feedId: z.string(),
  title: z.string().openapi({ example: "Breaking News" }),
  url: z.string().url(),
  content: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  isRead: z.boolean().optional().openapi({ example: false }),
  isStarred: z.boolean().optional().openapi({ example: false }),
  isReadLater: z.boolean().optional().openapi({ example: false }),
  createdAt: z.string().nullable().optional(),
});

export type Article = z.infer<typeof ArticleSchema>;

export const ArticleWithFeedSchema = ArticleSchema.extend({
  feed: FeedSchema,
});

export type ArticleWithFeed = z.infer<typeof ArticleWithFeedSchema>;

export const UpdateArticleSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isReadLater: z.boolean().optional(),
});

export type UpdateArticleInput = z.infer<typeof UpdateArticleSchema>;

// ─── API 响应类型 ─────────────────────────────────────────────────────────────

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ─── 文件夹带订阅源类型 ────────────────────────────────────────────────────────

export const FolderWithFeedsSchema = FolderSchema.extend({
  feeds: z.array(FeedWithUnreadCountSchema),
});

export type FolderWithFeeds = z.infer<typeof FolderWithFeedsSchema>;

// ─── OPML 类型 ────────────────────────────────────────────────────────────────

export const OPMLFeedSchema = z.object({
  title: z.string(),
  xmlUrl: z.string(),
  htmlUrl: z.string().optional(),
  folder: z.string().optional(),
});

export type OPMLFeed = z.infer<typeof OPMLFeedSchema>;

export const OPMLImportSchema = z.object({
  feeds: z.array(OPMLFeedSchema),
});

export type OPMLImportInput = z.infer<typeof OPMLImportSchema>;

// ─── 刷新 RSS 类型 ────────────────────────────────────────────────────────────

export const RefreshRSSResponseSchema = z.object({
  feedsProcessed: z.number(),
  articlesAdded: z.number(),
});

export type RefreshRSSResponse = z.infer<typeof RefreshRSSResponseSchema>;
