import { z } from "zod";

// ─── 用户类型 ─────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export type User = z.infer<typeof UserSchema>;

// ─── 文件夹类型 ───────────────────────────────────────────────────────────────

export const FolderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  isCollapsed: z.boolean().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export type Folder = z.infer<typeof FolderSchema>;

export const CreateFolderSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export type CreateFolderInput = z.infer<typeof CreateFolderSchema>;

// ─── 订阅源类型 ───────────────────────────────────────────────────────────────

export const FeedSchema = z.object({
  unsubscribedAt: z.string().nullable().optional(),
  id: z.string(),
  userId: z.string(),
  folderId: z.string().nullable().optional(),
  title: z.string(),
  url: z.string().url(),
  feedUrl: z.string().url(),
  description: z.string().nullable().optional(),
  faviconUrl: z.string().nullable().optional(),
  lastFetchedAt: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export type Feed = z.infer<typeof FeedSchema>;

export const FeedWithUnreadCountSchema = FeedSchema.extend({
  unreadCount: z.number(),
});

export type FeedWithUnreadCount = z.infer<typeof FeedWithUnreadCountSchema>;

export const CreateFeedSchema = z.object({
  url: z.string().url(),
  folderId: z.string().optional(),
});

export type CreateFeedInput = z.infer<typeof CreateFeedSchema>;

// ─── 文章类型 ─────────────────────────────────────────────────────────────────

export const ArticleSchema = z.object({
  id: z.string(),
  feedId: z.string(),
  title: z.string(),
  url: z.string().url(),
  content: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isReadLater: z.boolean().optional(),
  createdAt: z.string().nullable().optional(),
});

export type Article = z.infer<typeof ArticleSchema>;

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

export type FolderWithFeeds = Folder & { feeds: FeedWithUnreadCount[] };

// ─── OPML 类型 ────────────────────────────────────────────────────────────────

export const OPMLFeedSchema = z.object({
  title: z.string(),
  xmlUrl: z.string(),
  htmlUrl: z.string().optional(),
  folder: z.string().optional(),
});

export type OPMLFeed = z.infer<typeof OPMLFeedSchema>;
