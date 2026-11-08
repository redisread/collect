import { create } from "zustand";
import { readTranslationLanguage } from "../settings";
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

interface ArticleStore {
	articles: ArticleListItem[];
	selectedArticleId: string | null;
	selectedArticle: Article | null;
	isLoading: boolean;
	isLoadingDetail: boolean;
	detailError: string | null;
	translationError: string | null;
	translationFallback: { articleId: string; content: string; targetLang: string } | null;
	translationMode: "server" | "browser";
	extractionError: string | null;
	total: number;
	page: number;
	hasMore: boolean;
	sortOrder: "desc" | "asc";

	// 翻译相关状态
	translations: Record<string, TranslationResult>;
	isTranslating: boolean;
	/** 当前选中的目标语言 */
	targetLanguage: string;
	displayedLanguages: Record<string, string>;
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
	selectArticle: (articleId: string | null) => Promise<void>;
	markRead: (articleId: string, isRead: boolean) => Promise<void>;
	toggleRead: (articleId: string) => Promise<void>;
	toggleStarred: (articleId: string) => Promise<void>;
	toggleReadLater: (articleId: string) => Promise<void>;
	setSortOrder: (sortOrder: "desc" | "asc") => void;
	navigateArticle: (direction: "next" | "prev") => Promise<void>;
	translateArticle: (articleId: string, content: string, targetLang?: string) => Promise<boolean>;
	translateFullArticle: () => Promise<boolean>;
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

function buildArticleUrl(source: SelectedSource, page: number, sortOrder: string): string {
	const params = new URLSearchParams({
		page: String(page),
		pageSize: String(PAGE_SIZE),
		sort: sortOrder,
	});

	if (source.type === "feed") params.set("feedId", source.feedId);
	else if (source.type === "folder") params.set("folderId", source.folderId);
	else if (source.type === "starred") params.set("filter", "starred");
	else if (source.type === "read_later") params.set("filter", "read_later");

	return `${API_BASE}/api/articles?${params.toString()}`;
}

export const useArticleStore = create<ArticleStore>((set, get) => ({
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
	sortOrder: "desc",

	// 翻译相关状态
	translations: {},
	isTranslating: false,
	targetLanguage: "zh-CN",
	displayedLanguages: {},
	isLoadingPreference: false,
	preferenceError: null,
	loadTargetLanguage: () => {
		if (preferenceRequest) return preferenceRequest;
		const requestId = ++preferenceRequestId;
		set({ isLoadingPreference: true, preferenceError: null });
		preferenceRequest = readTranslationLanguage().then(language => {
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

	// 搜索相关状态
	searchQuery: "",
	searchResults: [],
	isSearching: false,

	// 标注相关状态
	annotations: [],

	fetchArticles: async (source, reset = true) => {
		const requestId = ++articleListRequestId;
		set({ isLoading: true });
		try {
			const url = buildArticleUrl(source, 1, get().sortOrder);
			const res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(15_000) });
			const json = await res.json() as {
				success: boolean;
				data: { articles: ArticleListItem[]; total: number; page: number; pageSize: number };
			};
			if (!res.ok || !json.success) return false;
			if (requestId === articleListRequestId) {
				set({
					articles: json.data.articles,
					total: json.data.total,
					page: 1,
					hasMore: json.data.articles.length < json.data.total,
					selectedArticleId: null,
					selectedArticle: null,
				});
			}
			return true;
		} catch {
			return false;
		} finally {
			if (requestId === articleListRequestId) set({ isLoading: false });
		}
	},

	fetchMoreArticles: async (source) => {
		const { page, articles, total, isLoading } = get();
		if (isLoading || articles.length >= total) return;

		const requestId = ++articleListRequestId;
		set({ isLoading: true });
		try {
			const nextPage = page + 1;
			const url = buildArticleUrl(source, nextPage, get().sortOrder);
			const res = await fetch(url, { credentials: "include" });
			const json = await res.json() as {
				success: boolean;
				data: { articles: ArticleListItem[]; total: number };
			};
			if (requestId === articleListRequestId && json.success) {
				set((state) => ({
					articles: [...state.articles, ...json.data.articles],
					page: nextPage,
					hasMore: state.articles.length + json.data.articles.length < json.data.total,
				}));
			}
		} finally {
			if (requestId === articleListRequestId) set({ isLoading: false });
		}
	},

	selectArticle: async (articleId) => {
		browserTranslationController?.abort();
		const requestId = ++detailRequestId;
		++translationRequestId;
		++extractionRequestId;
		set({ selectedArticleId: articleId, selectedArticle: null, isLoadingDetail: !!articleId,
			detailError: null, translationError: null, translationFallback: null, extractionError: null,
			isTranslating: false, isExtracting: false, annotations: [] });
		if (!articleId) return;
		try {
			const res = await fetch(`${API_BASE}/api/articles/${articleId}`, {
				credentials: "include", signal: AbortSignal.timeout(15_000),
			});
			const json = await res.json() as { success: boolean; data: Article };
			if (!res.ok || !json.success) throw new Error("文章加载失败，请重试");
			if (requestId === detailRequestId && get().selectedArticleId === articleId) {
				set(state => ({ selectedArticle: json.data,
					articles: state.articles.map(article => article.id === articleId ? { ...article, isRead: true } : article) }));
			}
		} catch {
			if (requestId === detailRequestId && get().selectedArticleId === articleId) set({ detailError: "文章加载失败，请重试" });
		} finally {
			if (requestId === detailRequestId) set({ isLoadingDetail: false });
		}
	},

	markRead: async (articleId, isRead) => {
		set((state) => ({
			articles: state.articles.map((a) => (a.id === articleId ? { ...a, isRead } : a)),
			selectedArticle:
				state.selectedArticle?.id === articleId
					? { ...state.selectedArticle, isRead }
					: state.selectedArticle,
		}));
		await fetch(`${API_BASE}/api/articles/${articleId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ isRead }),
		});
	},

	toggleStarred: async (articleId) => {
		const article = get().articles.find((a) => a.id === articleId);
		const newValue = !article?.isStarred;
		set((state) => ({
			articles: state.articles.map((a) =>
				a.id === articleId ? { ...a, isStarred: newValue } : a
			),
			selectedArticle:
				state.selectedArticle?.id === articleId
					? { ...state.selectedArticle, isStarred: newValue }
					: state.selectedArticle,
		}));
		await fetch(`${API_BASE}/api/articles/${articleId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ isStarred: newValue }),
		});
	},

	toggleReadLater: async (articleId) => {
		const article = get().articles.find((a) => a.id === articleId);
		const newValue = !article?.isReadLater;
		set((state) => ({
			articles: state.articles.map((a) =>
				a.id === articleId ? { ...a, isReadLater: newValue } : a
			),
			selectedArticle:
				state.selectedArticle?.id === articleId
					? { ...state.selectedArticle, isReadLater: newValue }
					: state.selectedArticle,
		}));
		await fetch(`${API_BASE}/api/articles/${articleId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ isReadLater: newValue }),
		});
	},

	setSortOrder: (sortOrder) => set({ sortOrder }),

	navigateArticle: async (direction) => {
		const { articles, selectedArticleId } = get();
		if (articles.length === 0) return;

		const currentIndex = articles.findIndex((a) => a.id === selectedArticleId);
		let nextIndex: number;

		if (direction === "next") {
			nextIndex = currentIndex < articles.length - 1 ? currentIndex + 1 : 0;
		} else {
			nextIndex = currentIndex > 0 ? currentIndex - 1 : articles.length - 1;
		}

		const nextArticle = articles[nextIndex];
		if (nextArticle) await get().selectArticle(nextArticle.id);
	},

	translateFullArticle: async () => {
		const { selectedArticle, isExtracting, isTranslating, isLoadingPreference } = get();
		if (!selectedArticle || isExtracting || isTranslating || isLoadingPreference) return false;
		const requestId = detailRequestId;
		let targetLanguage: string;
		try { targetLanguage = await get().loadTargetLanguage(); } catch { return false; }
		if (requestId !== detailRequestId) return false;
		const content = selectedArticle.content || (await get().extractArticle(selectedArticle.id))?.content;
		if (!content || requestId !== detailRequestId) return false;
		return get().translateArticle(selectedArticle.id, content, targetLanguage);
	},

	translateArticle: async (articleId, content, targetLang) => {
		const detailId = detailRequestId;
		let lang: string;
		try { lang = targetLang || await get().loadTargetLanguage(); } catch { return false; }
		if (detailId !== detailRequestId || get().selectedArticleId !== articleId) return false;
		const key = `${articleId}:${lang}`;
		if (get().translations[key]?.original === content) {
			set(state => ({ translationError: null, translationFallback: null,
				displayedLanguages: { ...state.displayedLanguages, [articleId]: lang },
				translations: { ...state.translations, [key]: { ...state.translations[key] } },
			}));
			return true;
		}
		const requestId = ++translationRequestId;
		set({ isTranslating: true, translationError: null, translationFallback: null, translationMode: "server" });
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
		const updates: Record<string, boolean> = {};
		switch (action) {
			case "read":
				updates.isRead = true;
				break;
			case "unread":
				updates.isRead = false;
				break;
			case "star":
				updates.isStarred = true;
				break;
			case "unstar":
				updates.isStarred = false;
				break;
		}

		// 乐观更新
		set((state) => ({
			articles: state.articles.map((a) =>
				articleIds.includes(a.id) ? { ...a, ...updates } : a
			),
			selectedArticle:
				state.selectedArticle && articleIds.includes(state.selectedArticle.id)
					? { ...state.selectedArticle, ...updates }
					: state.selectedArticle,
		}));

		// 调用批量更新 API
		await fetch(`${API_BASE}/api/articles/batch`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ action, articleIds }),
		});
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
