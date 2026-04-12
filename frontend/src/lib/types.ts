// 前端共用类型定义（对应后端 API 响应结构）

// ==================== Folder Types ====================
export interface Folder {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number | null;
  isCollapsed: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// ==================== Feed Types ====================
export interface Feed {
  id: string;
  userId: string;
  folderId: string | null;
  title: string;
  url: string;
  feedUrl: string;
  description: string | null;
  faviconUrl: string | null;
  lastFetchedAt: string | null;
  sortOrder: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type FeedWithUnreadCount = Feed & { unreadCount: number };

// ==================== Article Types ====================
export interface Article {
  id: string;
  feedId: string;
  title: string;
  url: string;
  content?: string | null;
  summary?: string | null;
  author?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  isRead: boolean;
  isStarred: boolean;
  isReadLater: boolean;
  // 新增字段
  readingProgress?: number | null;
  lastReadAt?: string | null;
  createdAt?: string | null;
}

// 文章列表项（不含全文内容）
export type ArticleListItem = Omit<Article, "content">;

// ==================== SelectedSource Types ====================
export type SelectedSource =
  | { type: "all" }
  | { type: "starred" }
  | { type: "read_later" }
  | { type: "feed"; feedId: string }
  | { type: "folder"; folderId: string };

// ==================== Translation Types ====================
export interface TranslationSegment {
  original: string;
  translated: string;
}

export interface TranslationResult {
  original: string;
  translated: string;
  detectedLang?: string;
  /** 分段翻译结果（新格式） */
  segments?: TranslationSegment[];
  /** 目标语言 */
  targetLang?: string;
  /** 缓存时间戳 */
  timestamp?: number;
}

export interface TranslationHistoryEntry {
  id: string;
  articleId: string;
  targetLang: string;
  sourceLang: string;
  articleTitle: string | null;
  feedName: string | null;
  translatedAt: string;
}

export interface TranslationHistoryResponse {
  items: TranslationHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// ==================== Annotation Types ====================
export interface TextRange {
  text: string;
  start: string;
  end: string;
}

export interface Annotation {
  id: string;
  articleId: string;
  type: "highlight" | "note";
  textRange: TextRange;
  color?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== UI Types ====================
export type ThemeMode = "light" | "dark" | "system";
export type ActiveColumn = "sidebar" | "list" | "detail";
