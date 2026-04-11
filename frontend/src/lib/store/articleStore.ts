import { create } from "zustand";
import type {
	Article,
	ArticleListItem,
	TranslationResult,
	Annotation,
	SelectedSource,
} from "../types";

// Re-export types for backward compatibility
export type { ArticleListItem, TranslationResult, Annotation };

const API_BASE = typeof import.meta !== 'undefined' && (import.meta as unknown as { env: Record<string, string> }).env?.PUBLIC_API_URL
  ? (import.meta as unknown as { env: Record<string, string> }).env.PUBLIC_API_URL
  : "http://localhost:8787";

interface ArticleStore {
	articles: ArticleListItem[];
	selectedArticleId: string | null;
	selectedArticle: Article | null;
	isLoading: boolean;
	isLoadingDetail: boolean;
	total: number;
	page: number;
	hasMore: boolean;
	sortOrder: "desc" | "asc";

	// 翻译相关状态
	translations: Record<string, TranslationResult>;
	isTranslating: boolean;

	// 提取相关状态
	isExtracting: boolean;

	// 搜索相关状态
	searchQuery: string;
	searchResults: ArticleListItem[];
	isSearching: boolean;

	// 标注相关状态
	annotations: Annotation[];

	// 方法
	fetchArticles: (source: SelectedSource, reset?: boolean) => Promise<void>;
	fetchMoreArticles: (source: SelectedSource) => Promise<void>;
	selectArticle: (articleId: string | null) => Promise<void>;
	markRead: (articleId: string, isRead: boolean) => Promise<void>;
	toggleRead: (articleId: string) => Promise<void>;
	toggleStarred: (articleId: string) => Promise<void>;
	toggleReadLater: (articleId: string) => Promise<void>;
	setSortOrder: (sortOrder: "desc" | "asc") => void;
	navigateArticle: (direction: "next" | "prev") => Promise<void>;
	translateArticle: (articleId: string, text: string) => Promise<void>;
	clearTranslation: (articleId: string) => void;
	extractArticle: (articleId: string) => Promise<void>;
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
	isExtracting: false,
	total: 0,
	page: 1,
	hasMore: false,
	sortOrder: "desc",

	// 翻译相关状态
	translations: {},
	isTranslating: false,

	// 搜索相关状态
	searchQuery: "",
	searchResults: [],
	isSearching: false,

	// 标注相关状态
	annotations: [],

	fetchArticles: async (source, reset = true) => {
		set({ isLoading: true });
		try {
			const url = buildArticleUrl(source, 1, get().sortOrder);
			const res = await fetch(url, { credentials: "include" });
			const json = await res.json() as {
				success: boolean;
				data: { articles: ArticleListItem[]; total: number; page: number; pageSize: number };
			};
			if (json.success) {
				set({
					articles: json.data.articles,
					total: json.data.total,
					page: 1,
					hasMore: json.data.articles.length < json.data.total,
					selectedArticleId: null,
					selectedArticle: null,
				});
			}
		} finally {
			set({ isLoading: false });
		}
	},

	fetchMoreArticles: async (source) => {
		const { page, articles, total, isLoading } = get();
		if (isLoading || articles.length >= total) return;

		set({ isLoading: true });
		try {
			const nextPage = page + 1;
			const url = buildArticleUrl(source, nextPage, get().sortOrder);
			const res = await fetch(url, { credentials: "include" });
			const json = await res.json() as {
				success: boolean;
				data: { articles: ArticleListItem[]; total: number };
			};
			if (json.success) {
				set((state) => ({
					articles: [...state.articles, ...json.data.articles],
					page: nextPage,
					hasMore: state.articles.length + json.data.articles.length < json.data.total,
				}));
			}
		} finally {
			set({ isLoading: false });
		}
	},

	selectArticle: async (articleId) => {
		if (!articleId) {
			set({ selectedArticleId: null, selectedArticle: null });
			return;
		}

		set({ selectedArticleId: articleId, isLoadingDetail: true });

		// 乐观更新已读状态
		set((state) => ({
			articles: state.articles.map((a) =>
				a.id === articleId ? { ...a, isRead: true } : a
			),
		}));

		try {
			const res = await fetch(`${API_BASE}/api/articles/${articleId}`, { credentials: "include" });
			const json = await res.json() as { success: boolean; data: Article };
			if (json.success) set({ selectedArticle: json.data });
		} finally {
			set({ isLoadingDetail: false });
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

	translateArticle: async (articleId, text) => {
		set({ isTranslating: true });
		try {
			const res = await fetch(`${API_BASE}/api/translate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ text, targetLang: "zh-CN" }),
			});
			const json = await res.json() as { success: boolean; data: TranslationResult };
			if (json.success) {
				set((state) => ({
					translations: {
						...state.translations,
						[articleId]: json.data,
					},
				}));
			}
		} finally {
			set({ isTranslating: false });
		}
	},

	clearTranslation: (articleId) => {
		set((state) => {
			const newTranslations = { ...state.translations };
			delete newTranslations[articleId];
			return { translations: newTranslations };
		});
	},

	toggleRead: async (articleId) => {
		const article = get().articles.find((a) => a.id === articleId);
		const newValue = !article?.isRead;
		await get().markRead(articleId, newValue);
	},

	extractArticle: async (articleId) => {
		set({ isExtracting: true });
		try {
			const res = await fetch(`${API_BASE}/api/articles/${articleId}/extract`, {
				method: "POST",
				credentials: "include",
			});
			const json = await res.json() as { success: boolean; data: Article };
			if (json.success) {
				set((state) => ({
					selectedArticle:
						state.selectedArticle?.id === articleId
							? { ...state.selectedArticle, content: json.data.content }
							: state.selectedArticle,
					articles: state.articles.map((a) =>
						a.id === articleId && json.data.summary
							? { ...a, summary: json.data.summary }
							: a
					),
				}));
			}
		} finally {
			set({ isExtracting: false });
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
			if (json.success) {
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
