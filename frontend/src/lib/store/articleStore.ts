import { create } from "zustand";
import type { Article } from "../types";
import type { SelectedSource } from "./feedStore";

const API_BASE = import.meta.env.PUBLIC_API_URL ?? "http://localhost:8787";

// 文章列表项（不含全文内容）
export type ArticleListItem = Omit<Article, "content">;

interface ArticleStore {
	articles: ArticleListItem[];
	selectedArticleId: string | null;
	selectedArticle: Article | null;
	isLoading: boolean;
	isLoadingDetail: boolean;
	originalContent: string | null; // 抓取的原文内容
	isLoadingOriginal: boolean;
	total: number;
	page: number;
	hasMore: boolean;
	sortOrder: "desc" | "asc";

	// Actions
	fetchArticles: (source: SelectedSource, reset?: boolean) => Promise<void>;
	fetchMoreArticles: (source: SelectedSource) => Promise<void>;
	selectArticle: (articleId: string | null) => Promise<void>;
	markRead: (articleId: string, isRead: boolean) => Promise<void>;
	toggleStarred: (articleId: string) => Promise<void>;
	toggleReadLater: (articleId: string) => Promise<void>;
	setSortOrder: (order: "desc" | "asc") => void;
	navigateArticle: (direction: "prev" | "next") => Promise<void>;
	fetchArticleContent: (url: string) => Promise<void>;
	clearOriginalContent: () => void;
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
	originalContent: null,
	isLoadingOriginal: false,
	total: 0,
	page: 1,
	hasMore: false,
	sortOrder: "desc",

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

	fetchArticleContent: async (url) => {
		set({ isLoadingOriginal: true, originalContent: null });
		try {
			const res = await fetch(`${API_BASE}/api/v2/articles/fetch-content`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ url }),
			});
			const json = await res.json() as { success: boolean; data?: { content: string }; error?: string };
			if (json.success && json.data) {
				set({ originalContent: json.data.content });
			} else {
				console.error("Failed to fetch article content:", json.error);
			}
		} catch (err) {
			console.error("Error fetching article content:", err);
		} finally {
			set({ isLoadingOriginal: false });
		}
	},

	clearOriginalContent: () => set({ originalContent: null }),
}));
