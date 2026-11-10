import { useUiStore } from "./uiStore";
import { useFeedStore } from "./feedStore";
import { create } from "zustand";
import { readTranslationLanguage } from "../settings";
import { useAiSettingsStore, type AiProfile } from "./aiSettingsStore";
import { aiCacheKey, continueAiTranslation, loadAiProgress, type AiProgress } from "../ai-translation";
import { escapeHtml } from "../utils/sanitize";
import type {
	Article,
	ArticleListItem,
	TranslationResult,
	TranslationSegment,
	Annotation,
	SelectedSource,
} from "../types";

// Re-export types for backward compatibility
export type { ArticleListItem, TranslationResult, TranslationSegment, Annotation };

const API_BASE = "";
let sortPreferenceVersion = 0;
let readingSessionId = 0;
let readingPageRequest: { sessionId: number; promise: Promise<boolean> } | null = null;

// 支持的目标语言（与 api/src/config/languages.ts 保持一致）
export const SUPPORTED_LANGUAGES = [
	{ code: "zh-CN", label: "简体中文" },
	{ code: "zh-TW", label: "繁體中文" },
	{ code: "en", label: "English" },
	{ code: "ja", label: "日本語" },
	{ code: "ko", label: "한국어" },
	{ code: "fr", label: "Français" },
	{ code: "de", label: "Deutsch" },
	{ code: "es", label: "Español" },
	{ code: "pt", label: "Português" },
	{ code: "ru", label: "Русский" },
	{ code: "ar", label: "العربية" },
	{ code: "hi", label: "हिन्दी" },
	{ code: "it", label: "Italiano" },
	{ code: "nl", label: "Nederlands" },
	{ code: "th", label: "ไทย" },
] as const;

interface ReadingSession {
  id: number;
  items: ArticleListItem[];
  source: SelectedSource;
  sortOrder: "asc" | "desc";
  hideRead: boolean;
  hasMore: boolean;
}

interface ArticleStore {
  readingSession: ReadingSession | null;
  isNavigating: boolean;
  navigationMessage: string | null;
  navigationRetry: "next" | "prev" | null;
  readingPageError: string | null;
  loadReadingPage: () => Promise<boolean>;

  articleActionError: string | null;
  listError: string | null;
  pendingArticleIds: string[];
  updateArticleState: (id: string, change: Partial<Pick<Article, "isRead" | "isStarred" | "isReadLater">>) => Promise<void>;
	articles: ArticleListItem[];
	selectedArticleId: string | null;
	selectedArticle: Article | null;
	isLoading: boolean;
	isLoadingDetail: boolean;
	detailError: string | null;
	translationError: string | null;
	translationFallback: { articleId: string; content: string; targetLang: string } | null;
	translationMode: "server" | "browser" | "ai";
	extractionError: string | null;
	total: number;
	page: number;
	hasMore: boolean;
	sortOrder: "desc" | "asc";
  isSavingSort: boolean;
  loadSortOrder: () => Promise<void>;
  saveSortOrder: (order: "asc" | "desc") => Promise<void>;

	// 翻译相关状态
	translations: Record<string, TranslationResult>;
	isTranslating: boolean;
	isPausingTranslation: boolean;
	/** 当前选中的目标语言 */
	targetLanguage: string;
	displayedLanguages: Record<string, string>;
	displayedKeys: Record<string, string>;
	translationViewRequest: number;
	aiProgress: AiProgress | null;
	restoreAiTranslation: () => Promise<void>;
	pauseTranslation: () => void;
	isLoadingPreference: boolean;
	preferenceError: string | null;
	loadTargetLanguage: () => Promise<string>;

	// 提取相关状态
	isExtracting: boolean;

	// 搜索相关状态
	searchQuery: string;
	searchResults: ArticleListItem[];
	isSearching: boolean;

	// 标注相关状态
	annotations: Annotation[];

	// 方法
	fetchArticles: (source: SelectedSource, reset?: boolean) => Promise<boolean>;
	fetchMoreArticles: (source: SelectedSource) => Promise<void>;
	selectArticle: (articleId: string | null, context?: "sequence" | "search") => Promise<void>;
	markRead: (articleId: string, isRead: boolean) => Promise<void>;
	toggleRead: (articleId: string) => Promise<void>;
	toggleStarred: (articleId: string) => Promise<void>;
	toggleReadLater: (articleId: string) => Promise<void>;
	setSortOrder: (sortOrder: "desc" | "asc") => void;
	navigateArticle: (direction: "next" | "prev") => Promise<void>;
	translateArticle: (articleId: string, content: string, targetLang?: string, profile?: AiProfile | null) => Promise<boolean>;
	translateFullArticle: () => Promise<boolean>;
	continueTranslation: () => Promise<boolean>;
	translateInBrowser: () => Promise<boolean>;
	clearTranslation: (articleId: string) => void;
	setTargetLanguage: (lang: string) => void;
	extractArticle: (articleId: string) => Promise<Article | null>;
	batchUpdateArticles: (action: "read" | "unread" | "star" | "unstar", articleIds: string[]) => Promise<void>;
	setSearchQuery: (query: string) => void;
	performSearch: (query: string) => Promise<void>;
	clearSearch: () => void;
	saveReadingProgress: (articleId: string, progress: number) => Promise<void>;
	getReadingProgress: (articleId: string) => Promise<number | null>;
	loadAnnotations: (articleId: string) => Promise<void>;
	createAnnotation: (annotation: Omit<Annotation, "id" | "createdAt" | "updatedAt">) => Promise<void>;
	updateAnnotation: (id: string, data: Partial<Annotation>) => Promise<void>;
	deleteAnnotation: (id: string) => Promise<void>;
}

const PAGE_SIZE = 30;
let articleListRequestId = 0;
let detailRequestId = 0;
let translationRequestId = 0;
let extractionRequestId = 0;
let browserTranslationController: AbortController | null = null;
let preferenceRequestId = 0;
let preferenceRequest: Promise<string> | null = null;
let aiTranslationController: AbortController | null = null;

export function isSavedGroup(source: SelectedSource): boolean {
  return source.type === "starred" || source.type === "read_later";
}

function buildArticleUrl(source: SelectedSource, page: number, sortOrder: string, includeId?: string | null, hideRead = useUiStore.getState().hideRead): string {
	const params = new URLSearchParams({
		page: String(page),
		pageSize: String(PAGE_SIZE),
		sort: sortOrder,
	});

	if (source.type === "feed") params.set("feedId", source.feedId);
	else if (source.type === "folder") params.set("folderId", source.folderId);
	else if (source.type === "uncategorized") params.set("uncategorized", "true");
	else if (source.type === "starred") params.set("filter", "starred");
	else if (source.type === "read_later") params.set("filter", "read_later");

	if (hideRead && !isSavedGroup(source)) {
    params.set("hideRead", "true");
    if (includeId) params.set("includeId", includeId);
  }
  return `${API_BASE}/api/articles?${params.toString()}`;
}

export const useArticleStore = create<ArticleStore>((set, get) => ({
  readingSession: null,
  isNavigating: false,
  navigationMessage: null,
  navigationRetry: null,
  readingPageError: null,
  loadReadingPage: () => {
    const session = get().readingSession;
    if (!session?.hasMore) return Promise.resolve(true);
    if (readingPageRequest?.sessionId === session.id) return readingPageRequest.promise;
    const last = session.items.at(-1);
    if (!last) return Promise.resolve(false);
    set({ readingPageError: null });
    const promise = (async () => {
      try {
        const url = new URL(buildArticleUrl(session.source, 1, session.sortOrder, null, session.hideRead), "https://collect.invalid");
        url.searchParams.set("after", JSON.stringify({ id: last.id, publishedAt: last.publishedAt ?? null }));
        const response = await fetch(url.pathname + url.search, { credentials: "include", signal: AbortSignal.timeout(15_000) });
        const result = await response.json() as { success: boolean; data: { articles: ArticleListItem[]; total: number } };
        if (!response.ok || !result.success) throw new Error("加载失败");
        if (get().readingSession?.id !== session.id) return false;
        set({ readingSession: { ...session,
          items: [...session.items, ...result.data.articles.filter(item => !session.items.some(existing => existing.id === item.id))],
          hasMore: result.data.total > result.data.articles.length,
        } });
        return true;
      } catch {
        if (get().readingSession?.id === session.id) set({ readingPageError: "后续文章加载失败，请重试" });
        return false;
      } finally {
        if (readingPageRequest?.sessionId === session.id) readingPageRequest = null;
      }
    })();
    readingPageRequest = { sessionId: session.id, promise };
    return promise;
  },
  articleActionError: null,
  listError: null,
  pendingArticleIds: [],
  updateArticleState: async (id, change) => {
    if (get().pendingArticleIds.includes(id)) return;
    if (get().selectedArticleId === id && get().isLoadingDetail) {
      set({ articleActionError: "文章正在加载，请加载完成后操作" });
      return;
    }
    set(state => ({ pendingArticleIds: [...state.pendingArticleIds, id], articleActionError: null }));
    try {
      const response = await fetch(`/api/articles/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(change), signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json() as { success: boolean; data?: Article };
      if (!response.ok || !body.success) throw new Error("状态保存失败，请重试");
      set(state => ({
        articles: state.articles.map(article => article.id === id ? { ...article, ...change, ...(body.data ?? {}) } : article),
        selectedArticle: state.selectedArticle?.id === id ? { ...state.selectedArticle, ...change, ...(body.data ?? {}) } : state.selectedArticle,
      }));
      const refreshed = await Promise.allSettled([
        useFeedStore.getState().fetchFeeds(), get().fetchArticles(useFeedStore.getState().selectedSource, false),
      ]);
      if (refreshed.some(result => result.status === "rejected" || result.value === false)) {
        set({ articleActionError: "状态已保存，列表同步失败，请刷新页面" });
      }
    } catch {
      set({ articleActionError: "状态保存失败，请检查网络后重试" });
    } finally {
      set(state => ({ pendingArticleIds: state.pendingArticleIds.filter(value => value !== id) }));
    }
  },
	articles: [],
	selectedArticleId: null,
	selectedArticle: null,
	isLoading: false,
	isLoadingDetail: false,
	detailError: null,
	translationError: null,
	translationFallback: null,
	translationMode: "server",
	extractionError: null,
	isExtracting: false,
	total: 0,
	page: 1,
	hasMore: false,
  isSavingSort: false,
  loadSortOrder: async () => {
    if (get().isSavingSort) return;
    const version = sortPreferenceVersion;
    const response = await fetch("/api/settings", { credentials: "include", cache: "no-store" });
    const result = await response.json() as { success: boolean; data?: { articleSortOrder?: string } };
    if (!response.ok || !result.success) throw new Error("无法加载排序设置");
    if (version !== sortPreferenceVersion || get().isSavingSort) return;
    get().setSortOrder(result.data?.articleSortOrder === "asc" ? "asc" : "desc");
  },
  saveSortOrder: async (articleSortOrder) => {
    if (get().isSavingSort) return;
    ++sortPreferenceVersion;
    set({ isSavingSort: true, articleActionError: null });
    try {
      const response = await fetch("/api/settings/article-sort", { method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleSortOrder }) });
      const result = await response.json() as { success: boolean };
      if (!response.ok || !result.success) throw new Error("排序保存失败，请重试");
      get().setSortOrder(articleSortOrder);
    } catch {
      set({ articleActionError: "排序保存失败，请重试" });
    } finally { set({ isSavingSort: false }); }
  },
	sortOrder: "desc",

	// 翻译相关状态
	translations: {},
	isTranslating: false,
	isPausingTranslation: false,
	targetLanguage: "zh-CN",
	displayedLanguages: {},
	displayedKeys: {},
	translationViewRequest: 0,
	aiProgress: null,
	isLoadingPreference: false,
	preferenceError: null,
	loadTargetLanguage: () => {
		if (preferenceRequest) return preferenceRequest;
		const requestId = ++preferenceRequestId;
		set({ isLoadingPreference: true, preferenceError: null });
		preferenceRequest = Promise.all([readTranslationLanguage(), useAiSettingsStore.getState().load()]).then(([language]) => {
			if (requestId === preferenceRequestId) set({ targetLanguage: language });
			return get().targetLanguage;
		}).catch(() => {
			if (requestId !== preferenceRequestId) return get().targetLanguage;
			const message = "无法同步翻译语言，请检查网络后重试";
			set({ preferenceError: message });
			throw new Error(message);
		}).finally(() => {
			if (requestId === preferenceRequestId) {
				preferenceRequest = null;
				set({ isLoadingPreference: false });
			}
		});
		return preferenceRequest;
	},
	pauseTranslation: () => {
		aiTranslationController?.abort();
		set({ isPausingTranslation: get().isTranslating });
	},
	restoreAiTranslation: async () => {
		const { selectedArticle } = get();
		if (!selectedArticle || get().isTranslating) return;
		const content = selectedArticle.content || (selectedArticle.summary ? `<p>${escapeHtml(selectedArticle.summary)}</p>` : "");
		if (!content) return;
		const detailId = detailRequestId;
		const translationId = translationRequestId;
		try {
			const lang = await get().loadTargetLanguage();
			const { profiles, activeProfileId } = useAiSettingsStore.getState();
			const profile = profiles.find(item => item.id === activeProfileId);
			if (!profile || detailId !== detailRequestId) return;
			const progress = await loadAiProgress(selectedArticle.id, content, lang, profile, true);
			if (!progress || detailId !== detailRequestId || translationId !== translationRequestId ||
				get().selectedArticleId !== selectedArticle.id || get().isTranslating ||
				useAiSettingsStore.getState().activeProfileId !== profile.id) return;
			const key = aiCacheKey(selectedArticle.id, lang, profile);
			set(state => ({ aiProgress: progress,
          translationError: progress.halted ?? (progress.pending === 0 && progress.failed ? `${progress.failed} 段翻译失败，可重试失败段落` : null), translationMode: "ai",
				displayedLanguages: { ...state.displayedLanguages, [selectedArticle.id]: lang },
				displayedKeys: { ...state.displayedKeys, [selectedArticle.id]: key },
				translations: { ...state.translations, [key]: { ...progress, original: content, translated: progress.segments?.map(segment => segment.translated).join("\n\n") ?? "" } },
			}));
		} catch { /* Translation remains available for an explicit retry. */ }
	},

	// 搜索相关状态
	searchQuery: "",
	searchResults: [],
	isSearching: false,

	// 标注相关状态
	annotations: [],

	fetchArticles: async (source, reset = true) => {
		const requestId = ++articleListRequestId;
    if (reset) ++detailRequestId;
		set({ isLoading: true, listError: null,
      ...(reset ? { articles: [], total: 0, page: 1, hasMore: false, readingSession: null, isNavigating: false, navigationMessage: null, navigationRetry: null, readingPageError: null } : {}) });
		try {
      const pageCount = reset ? 1 : Math.max(1, get().page);
      const selectedId = reset ? null : get().selectedArticleId;
      const current = get().articles.find(article => article.id === selectedId) ?? get().selectedArticle;
      const pages = await Promise.all(Array.from({ length: pageCount }, async (_, index) => {
        const url = buildArticleUrl(source, index + 1, get().sortOrder, selectedId);
        const res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(15_000) });
        const json = await res.json() as { success: boolean; data: { articles: ArticleListItem[]; total: number } };
        if (!res.ok || !json.success) throw new Error("列表刷新失败");
        return json.data;
      }));
      if (requestId === articleListRequestId) {
        const refreshed = Array.from(new Map(pages.flatMap(page => page.articles).map(article => [article.id, article])).values());
        const matchesSource = current &&
          (source.type !== "starred" || current.isStarred) &&
          (source.type !== "read_later" || current.isReadLater) &&
          (source.type !== "feed" || current.feedId === source.feedId) &&
          (source.type !== "folder" || useFeedStore.getState().feeds.find(feed => feed.id === current.feedId)?.folderId === source.folderId) &&
          (source.type !== "uncategorized" || useFeedStore.getState().feeds.some(feed => feed.id === current.feedId && !feed.folderId));
        if (selectedId && useUiStore.getState().hideRead && matchesSource && !refreshed.some(article => article.id === selectedId)) {
          refreshed.push(current);
        }
        set({
          articles: refreshed, total: pages[0].total, page: pageCount,
          hasMore: pageCount * PAGE_SIZE < pages[0].total,
          ...(reset ? { selectedArticleId: null, selectedArticle: null } : {}),
        });
      }
			return true;
		} catch {
      if (requestId === articleListRequestId) set({ listError: "文章加载失败，请检查网络后重试" });
			return false;
		} finally {
			if (requestId === articleListRequestId) set({ isLoading: false });
		}
	},

	fetchMoreArticles: async (source) => {
		const { page, hasMore, isLoading } = get();
		if (isLoading || !hasMore) return;

		const requestId = ++articleListRequestId;
		set({ isLoading: true, listError: null });
		try {
			const nextPage = page + 1;
			const url = buildArticleUrl(source, nextPage, get().sortOrder, get().selectedArticleId);
			const res = await fetch(url, { credentials: "include" });
			const json = await res.json() as {
				success: boolean;
				data: { articles: ArticleListItem[]; total: number };
			};
			if (!res.ok || !json.success) throw new Error("加载失败");
			if (requestId === articleListRequestId) {
				set((state) => ({
					articles: Array.from(new Map([...state.articles, ...json.data.articles].map(article => [article.id, article])).values()),
					page: nextPage,
					hasMore: nextPage * PAGE_SIZE < json.data.total,
          total: json.data.total,
				}));
			}
		} catch {
      if (requestId === articleListRequestId) set({ listError: "更多文章加载失败，请重试" });
		} finally {
			if (requestId === articleListRequestId) set({ isLoading: false });
		}
	},

	selectArticle: async (articleId, context) => {
    const previous = get();
    if (context !== "sequence" && (!articleId || context === "search" || articleId !== previous.selectedArticleId || !previous.readingSession)) {
      const source = useFeedStore.getState().selectedSource;
      const items = context === "search" ? previous.searchResults : previous.articles.filter(item =>
        isSavedGroup(source) || !useUiStore.getState().hideRead || !item.isRead || item.id === articleId);
      set({ readingSession: articleId ? { id: ++readingSessionId, items: [...items], source,
        sortOrder: previous.sortOrder, hideRead: useUiStore.getState().hideRead,
        hasMore: context !== "search" && previous.hasMore && items.some(item => item.id === articleId),
      } : null, navigationMessage: null, navigationRetry: null, readingPageError: null, isNavigating: false });
    }
		browserTranslationController?.abort();
		aiTranslationController?.abort();
		const requestId = ++detailRequestId;
		++translationRequestId;
		++extractionRequestId;
		set({ ...(context === "sequence" ? {} : { selectedArticleId: articleId, selectedArticle: null }), isLoadingDetail: context !== "sequence" && !!articleId,
			detailError: null, translationError: null, translationFallback: null, extractionError: null,
			isTranslating: false, isPausingTranslation: false, aiProgress: null, isExtracting: false, annotations: [] });
		if (!articleId) return;
		try {
			const res = await fetch(`${API_BASE}/api/articles/${articleId}`, {
				credentials: "include", signal: AbortSignal.timeout(15_000),
			});
			const json = await res.json() as { success: boolean; data: Article };
			if (!res.ok || !json.success) throw new Error("文章加载失败，请重试");
			if (requestId === detailRequestId) {
        if (context === "sequence" && get().readingSession?.id !== previous.readingSession?.id) return;
				set(state => ({ selectedArticleId: articleId, selectedArticle: json.data,
					articles: state.articles.map(article => article.id === articleId ? { ...article, isRead: true } : article) }));
				const session = get().readingSession;
        const index = session?.items.findIndex(item => item.id === articleId) ?? -1;
        if (session && index >= session.items.length - 4 && !get().readingPageError) void get().loadReadingPage();
        void get().restoreAiTranslation();
				void useFeedStore.getState().fetchFeeds().catch(() => set({ articleActionError: "文章已打开，订阅数量同步失败，请刷新页面" }));
			}
		} catch {
			if (requestId === detailRequestId) {
        if (context === "sequence") set({ navigationMessage: "文章加载失败，请重试" });
        else if (get().selectedArticleId === articleId) set({ detailError: "文章加载失败，请重试" });
      }
		} finally {
			if (requestId === detailRequestId) set({ isLoadingDetail: false });
		}
	},

	markRead: (id, isRead) => get().updateArticleState(id, { isRead }),
	toggleStarred: id => {
    const article = get().articles.find(item => item.id === id) ?? (get().selectedArticle?.id === id ? get().selectedArticle : null);
    return get().updateArticleState(id, { isStarred: !article?.isStarred });
  },
	toggleReadLater: id => {
    const article = get().articles.find(item => item.id === id) ?? (get().selectedArticle?.id === id ? get().selectedArticle : null);
    return get().updateArticleState(id, { isReadLater: !article?.isReadLater });
  },

	setSortOrder: (sortOrder) => {
    if (sortOrder === get().sortOrder) return;
    ++articleListRequestId;
    set({ sortOrder, articles: [], page: 1, hasMore: false });
    void get().fetchArticles(useFeedStore.getState().selectedSource);
  },

  navigateArticle: async (direction) => {
    const initial = get();
    if (initial.isNavigating || initial.isLoadingDetail) return;
    if (!initial.selectedArticleId) {
      const first = initial.articles.find(item => !useUiStore.getState().hideRead || !item.isRead || isSavedGroup(useFeedStore.getState().selectedSource));
      if (first) await get().selectArticle(first.id);
      return;
    }
    const session = initial.readingSession;
    if (!session) return;
    const index = session.items.findIndex(item => item.id === initial.selectedArticleId);
    if (index < 0) return;
    set({ isNavigating: true, navigationMessage: null, navigationRetry: null });
    try {
      if (direction === "next" && index === session.items.length - 1 && session.hasMore) {
        const loaded = await get().loadReadingPage();
        if (get().readingSession?.id !== session.id) return;
        if (!loaded) {
          set({ navigationMessage: "后续文章加载失败，请重试", navigationRetry: direction });
          return;
        }
      }
      if (get().readingSession?.id !== session.id) return;
      const target = get().readingSession?.items[index + (direction === "next" ? 1 : -1)];
      if (!target) {
        set({ navigationMessage: direction === "next" ? "已经是最后一篇" : "已经是第一篇" });
        return;
      }
      await get().selectArticle(target.id, "sequence");
      if (get().readingSession?.id === session.id && get().selectedArticleId !== target.id) set({ navigationRetry: direction });
    } finally {
      if (get().readingSession?.id === session.id) set({ isNavigating: false });
    }
  },

	translateFullArticle: async () => {
		const { selectedArticle, isExtracting, isTranslating, isLoadingPreference } = get();
		if (!selectedArticle || isExtracting || isTranslating || isLoadingPreference) return false;
		const requestId = detailRequestId;
		let targetLanguage: string;
		try { targetLanguage = await get().loadTargetLanguage(); } catch { return false; }
		if (requestId !== detailRequestId) return false;
		const { profiles, activeProfileId } = useAiSettingsStore.getState();
		const profile = profiles.find(item => item.id === activeProfileId) ?? null;
		const content = selectedArticle.content || (await get().extractArticle(selectedArticle.id))?.content;
		if (!content || requestId !== detailRequestId) return false;
		return get().translateArticle(selectedArticle.id, content, targetLanguage, profile);
	},
	continueTranslation: async () => {
		const { selectedArticleId, displayedKeys, translations, isTranslating, isLoadingPreference } = get();
		if (!selectedArticleId || isTranslating || isLoadingPreference) return false;
		const content = translations[displayedKeys[selectedArticleId]]?.original;
		if (!content) return false;
		return get().translateArticle(selectedArticleId, content);
	},

	translateArticle: async (articleId, content, targetLang, profileOverride) => {
		const detailId = detailRequestId;
		let lang: string;
		try { lang = targetLang || await get().loadTargetLanguage(); } catch { return false; }
		if (detailId !== detailRequestId || get().selectedArticleId !== articleId) return false;
		const { profiles, activeProfileId } = useAiSettingsStore.getState();
		const profile = profileOverride === undefined ? profiles.find(item => item.id === activeProfileId) : profileOverride;
		if (profile) {
			const requestId = ++translationRequestId;
			aiTranslationController?.abort();
			const controller = new AbortController();
			aiTranslationController = controller;
			const key = aiCacheKey(articleId, lang, profile);
			let shown = false;
			const applyProgress = (progress: AiProgress) => {
				if (requestId !== translationRequestId || detailId !== detailRequestId || get().selectedArticleId !== articleId) { controller.abort(); return; }
				set(state => ({ aiProgress: progress,
          translationError: progress.halted ?? (progress.pending === 0 && progress.failed ? `${progress.failed} 段翻译失败，可重试失败段落` : null),
					translationViewRequest: state.translationViewRequest + (!shown && progress.completed > 0 ? 1 : 0),
					displayedLanguages: { ...state.displayedLanguages, [articleId]: lang },
					displayedKeys: { ...state.displayedKeys, [articleId]: key },
					translations: { ...state.translations, [key]: { ...progress, original: content,
						translated: progress.segments?.map(segment => segment.translated).join("\n\n") ?? "" } },
				}));
				shown ||= progress.completed > 0;
			};
			const pauseWhenHidden = () => { if (document.visibilityState === "hidden") get().pauseTranslation(); };
      document.addEventListener("visibilitychange", pauseWhenHidden);
      set({ isTranslating: true, isPausingTranslation: false, aiProgress: null, translationError: null, translationFallback: null, translationMode: "ai" });
			try {
				const progress = await loadAiProgress(articleId, content, lang, profile, false);
				if (!progress || controller.signal.aborted || detailId !== detailRequestId) return false;
				applyProgress(progress);
				return await continueAiTranslation(progress, applyProgress, controller.signal);
			} catch (error) {
				if (requestId === translationRequestId && !controller.signal.aborted) set({ translationError: error instanceof Error ? error.message : "AI 翻译失败，请继续重试" });
				return false;
			} finally {
				document.removeEventListener("visibilitychange", pauseWhenHidden);
        if (requestId === translationRequestId) set({ isTranslating: false, isPausingTranslation: false });
			}
		}
		const key = `${articleId}:${lang}`;
		if (get().translations[key]?.original === content) {
			set(state => ({ translationError: null, translationFallback: null,
				translationViewRequest: state.translationViewRequest + 1,
				aiProgress: null,
				displayedKeys: { ...state.displayedKeys, [articleId]: key },
				displayedLanguages: { ...state.displayedLanguages, [articleId]: lang },
				translations: { ...state.translations, [key]: { ...state.translations[key] } },
			}));
			return true;
		}
		const requestId = ++translationRequestId;
		set({ isTranslating: true, isPausingTranslation: false, aiProgress: null, translationError: null, translationFallback: null, translationMode: "server" });
		try {
			const res = await fetch(`${API_BASE}/api/translate`, {
				method: "POST", headers: { "Content-Type": "application/json" },
				credentials: "include", signal: AbortSignal.timeout(65_000),
				body: JSON.stringify({ articleId, content, targetLang: lang }),
			});
			const json = await res.json() as { success: boolean; data: TranslationResult; error?: string; code?: string };
			if (requestId === translationRequestId && get().selectedArticleId === articleId &&
				["google_rate_limited", "google_http_error", "translation_timeout"].includes(json.code || "")) {
				set({ translationFallback: { articleId, content, targetLang: lang } });
			}
			if (!res.ok || !json.success) throw new Error(json.error || "翻译失败，请重试");
			if (requestId !== translationRequestId || get().selectedArticleId !== articleId) return false;
			set(state => ({ extractionError: null,
				translationViewRequest: state.translationViewRequest + 1,
				displayedKeys: { ...state.displayedKeys, [articleId]: key },
				displayedLanguages: { ...state.displayedLanguages, [articleId]: lang },
				translations: { ...state.translations, [key]: {
				...json.data, original: content,
				translated: json.data.segments?.map(segment => segment.translated).join("\n\n") || "",
			} } }));
			return true;
		} catch (error) {
			if (requestId === translationRequestId) set({ translationError: error instanceof Error ? error.message : "翻译失败，请重试" });
			return false;
		} finally {
			if (requestId === translationRequestId) set({ isTranslating: false });
		}
	},

	translateInBrowser: async () => {
		const fallback = get().translationFallback;
		if (!fallback || get().isTranslating || get().isLoadingPreference || get().selectedArticleId !== fallback.articleId) return false;
		const detailId = detailRequestId;
		let targetLang: string;
		try { targetLang = await get().loadTargetLanguage(); } catch { return false; }
		if (detailId !== detailRequestId) return false;
		if (useAiSettingsStore.getState().activeProfileId) return get().translateArticle(fallback.articleId, fallback.content, targetLang);
		const pending = { ...fallback, targetLang };
		const requestId = ++translationRequestId;
		const controller = new AbortController();
		browserTranslationController?.abort();
		browserTranslationController = controller;
		const timer = setTimeout(() => controller.abort(), 120_000);
		set({ isTranslating: true, translationError: null, translationMode: "browser" });
		try {
			const { translateInBrowser } = await import("../translate-browser");
			const result = await translateInBrowser(pending.content, pending.targetLang, controller.signal);
			if (requestId !== translationRequestId || get().selectedArticleId !== pending.articleId) return false;
			set(state => ({
				translationFallback: null, extractionError: null,
				translationViewRequest: state.translationViewRequest + 1,
				displayedKeys: { ...state.displayedKeys, [pending.articleId]: `${pending.articleId}:${pending.targetLang}` },
				displayedLanguages: { ...state.displayedLanguages, [pending.articleId]: pending.targetLang },
				translations: { ...state.translations, [`${pending.articleId}:${pending.targetLang}`]: {
					...result, original: pending.content,
					translated: result.segments.map(segment => segment.translated).join("\n\n"),
				} },
			}));
			void fetch("/api/translations/history", {
				method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
				signal: AbortSignal.timeout(5000),
				body: JSON.stringify({ articleId: pending.articleId, targetLang: pending.targetLang, sourceLang: result.detectedLang }),
			}).then(response => {
				if (!response.ok) throw new Error("history");
			}).catch(() => console.warn("translation_history_write_failed"));
			return true;
		} catch (error) {
			if (requestId === translationRequestId) set({
				translationError: controller.signal.aborted || (error instanceof Error && error.name === "TimeoutError")
					? "Google 翻译响应超时，请重试；已完成的段落会继续复用"
					: error instanceof Error && error.name === "TranslationError"
						? error.message : "浏览器暂时无法连接 Google 翻译，请检查网络后重试",
			});
			return false;
		} finally {
			clearTimeout(timer);
			controller.abort();
			if (requestId === translationRequestId) set({ isTranslating: false });
		}
	},

	clearTranslation: (articleId) => {
		set(state => ({ translations: Object.fromEntries(
			Object.entries(state.translations).filter(([key]) => !key.startsWith(articleId + ":"))
		) }));
	},

	setTargetLanguage: (lang) => {
		++preferenceRequestId;
		preferenceRequest = null;
		set({ targetLanguage: lang, preferenceError: null, isLoadingPreference: false });
	},

	toggleRead: async (articleId) => {
		const article = get().articles.find((a) => a.id === articleId);
		const newValue = !article?.isRead;
		await get().markRead(articleId, newValue);
	},

	extractArticle: async (articleId) => {
		const requestId = ++extractionRequestId;
		set({ isExtracting: true, extractionError: null });
		try {
			const res = await fetch(`${API_BASE}/api/articles/${articleId}/extract`, {
				method: "POST", credentials: "include", signal: AbortSignal.timeout(30_000),
			});
			const json = await res.json() as { success: boolean; data: Article };
			if (!res.ok || !json.success || !json.data.content?.trim()) throw new Error("未能提取全文");
			if (requestId !== extractionRequestId || get().selectedArticleId !== articleId) return null;
			set(state => ({
				selectedArticle: state.selectedArticle?.id === articleId ? { ...state.selectedArticle, content: json.data.content } : state.selectedArticle,
				translations: Object.fromEntries(Object.entries(state.translations).filter(([key]) => !key.startsWith(articleId + ":"))),
				articles: state.articles.map(article => article.id === articleId ? { ...article, summary: json.data.summary || article.summary } : article),
			}));
			return json.data;
		} catch {
			if (requestId === extractionRequestId) set({ extractionError: "未能提取全文。可重试，或仅翻译摘要。" });
			return null;
		} finally {
			if (requestId === extractionRequestId) set({ isExtracting: false });
		}
	},

  batchUpdateArticles: async (action, articleIds) => {
    const ids = [...new Set(articleIds)];
    if (!ids.length || ids.some(id => get().pendingArticleIds.includes(id))) return;
    const actions = { read: "markAsRead", unread: "markAsUnread", star: "markAsStarred", unstar: "markAsUnstarred" };
    set(state => ({ pendingArticleIds: [...state.pendingArticleIds, ...ids], articleActionError: null }));
    try {
      const response = await fetch(`${API_BASE}/api/articles/batch`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actions[action], articleIds: ids }), signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json() as { success: boolean };
      if (!response.ok || !result.success) throw new Error("批量操作失败");
      await useFeedStore.getState().fetchFeeds();
      await get().fetchArticles(useFeedStore.getState().selectedSource, false);
      const updates = { read: { isRead: true }, unread: { isRead: false }, star: { isStarred: true }, unstar: { isStarred: false } }[action];
      set(state => ({ selectedArticle: state.selectedArticle && ids.includes(state.selectedArticle.id) ? { ...state.selectedArticle, ...updates } : state.selectedArticle }));
    } catch { set({ articleActionError: "批量操作失败，请刷新后重试" }); }
    finally { set(state => ({ pendingArticleIds: state.pendingArticleIds.filter(id => !ids.includes(id)) })); }
  },

	// 搜索相关方法
	setSearchQuery: (query) => set({ searchQuery: query }),

	performSearch: async (query) => {
		if (!query.trim()) {
			set({ searchResults: [], isSearching: false });
			return;
		}

		set({ isSearching: true });
		try {
			const params = new URLSearchParams({ q: query.trim() });
			const res = await fetch(`${API_BASE}/api/articles/search?${params.toString()}`, {
				credentials: "include",
			});
			const json = await res.json() as {
				success: boolean;
				data: { articles: ArticleListItem[] };
			};
			if (json.success) {
				set({ searchResults: json.data.articles });
			}
		} finally {
			set({ isSearching: false });
		}
	},

	clearSearch: () => set({ searchQuery: "", searchResults: [], isSearching: false }),

	// 阅读进度方法
	saveReadingProgress: async (articleId, progress) => {
		try {
			await fetch(`${API_BASE}/api/articles/${articleId}/progress`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ progress }),
			});
		} catch (error) {
			console.error("Failed to save reading progress:", error);
		}
	},

	getReadingProgress: async (articleId) => {
		try {
			const res = await fetch(`${API_BASE}/api/articles/${articleId}/progress`, {
				credentials: "include",
			});
			const json = await res.json() as { success: boolean; data: { progress: number } };
			if (json.success) {
				return json.data.progress;
			}
			return null;
		} catch (error) {
			console.error("Failed to get reading progress:", error);
			return null;
		}
	},

	// 标注相关方法
	loadAnnotations: async (articleId) => {
		try {
			const res = await fetch(`${API_BASE}/api/articles/${articleId}/annotations`, {
				credentials: "include",
			});
			const json = await res.json() as { success: boolean; data: { annotations: Annotation[] } };
			if (json.success && get().selectedArticleId === articleId) {
				set({ annotations: json.data.annotations });
			}
		} catch (error) {
			console.error("Failed to load annotations:", error);
		}
	},

	createAnnotation: async (annotation) => {
		try {
			const res = await fetch(`${API_BASE}/api/annotations`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(annotation),
			});
			const json = await res.json() as { success: boolean; data: Annotation };
			if (json.success) {
				set((state) => ({
					annotations: [...state.annotations, json.data],
				}));
			}
		} catch (error) {
			console.error("Failed to create annotation:", error);
		}
	},

	updateAnnotation: async (id, data) => {
		try {
			const res = await fetch(`${API_BASE}/api/annotations/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(data),
			});
			const json = await res.json() as { success: boolean; data: Annotation };
			if (json.success) {
				set((state) => ({
					annotations: state.annotations.map((a) =>
						a.id === id ? { ...a, ...json.data } : a
					),
				}));
			}
		} catch (error) {
			console.error("Failed to update annotation:", error);
		}
	},

	deleteAnnotation: async (id) => {
		try {
			await fetch(`${API_BASE}/api/annotations/${id}`, {
				method: "DELETE",
				credentials: "include",
			});
			set((state) => ({
				annotations: state.annotations.filter((a) => a.id !== id),
			}));
		} catch (error) {
			console.error("Failed to delete annotation:", error);
		}
	},
}));
