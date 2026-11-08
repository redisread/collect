import { create } from "zustand";
import type { Folder, FeedWithUnreadCount } from "../types";

import { useArticleStore } from "./articleStore";

const API_BASE = "";

// Re-export SelectedSource from types.ts for convenience
export type SelectedSource =
	| { type: "uncategorized" }
	| { type: "all" }
	| { type: "starred" }
	| { type: "read_later" }
	| { type: "feed"; feedId: string }
	| { type: "folder"; folderId: string };

interface FeedStore {
	folders: Folder[];
	feeds: FeedWithUnreadCount[];
	selectedSource: SelectedSource;
	isLoading: boolean;
	refreshError: string | null;
	movingFeedId: string | null;
	moveStatus: string | null;

	// Actions
	setFolders: (folders: Folder[]) => void;
	setFeeds: (feeds: FeedWithUnreadCount[]) => void;
	setSelectedSource: (source: SelectedSource) => void;
	setLoading: (loading: boolean) => void;
	toggleFolderCollapsed: (folderId: string) => void;
	updateFolderCollapsed: (folderId: string, isCollapsed: boolean) => Promise<void>;
	fetchFolders: () => Promise<void>;
	fetchFeeds: () => Promise<void>;
	addFeed: (url: string, folderId?: string) => Promise<void>;
	deleteFeed: (feedId: string) => Promise<void>;
	moveFeedToFolder: (feedId: string, folderId: string | null) => Promise<void>;
	addFolder: (name: string, color?: string) => Promise<void>;
	deleteFolder: (folderId: string) => Promise<void>;
	renameFolder: (folderId: string, name: string) => Promise<void>;
	refresh: (feedId?: string) => Promise<void>;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
	folders: [],
	feeds: [],
	selectedSource: { type: "all" },
	isLoading: false,
	refreshError: null,
	movingFeedId: null,
	moveStatus: null,

	setFolders: (folders) => set({ folders }),
	setFeeds: (feeds) => set({ feeds }),
	setSelectedSource: (selectedSource) => set({ selectedSource }),
	setLoading: (isLoading) => set({ isLoading }),

	toggleFolderCollapsed: (folderId) => {
		const folder = get().folders.find((f) => f.id === folderId);
		if (!folder) return;
		get().updateFolderCollapsed(folderId, !folder.isCollapsed);
	},

	updateFolderCollapsed: async (folderId, isCollapsed) => {
		set((state) => ({
			folders: state.folders.map((f) =>
				f.id === folderId ? { ...f, isCollapsed } : f
			),
		}));
		await fetch(`${API_BASE}/api/folders/${folderId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ isCollapsed }),
		});
	},

	fetchFolders: async () => {
		const res = await fetch(`${API_BASE}/api/folders`, { credentials: "include" });
		const json = await res.json() as { success: boolean; data: Folder[] };
		if (json.success) set({ folders: json.data });
	},

	fetchFeeds: async () => {
		const res = await fetch(`${API_BASE}/api/feeds`, { credentials: "include" });
		const json = await res.json() as { success: boolean; data: FeedWithUnreadCount[] };
		if (json.success) set({ feeds: json.data });
	},

	addFeed: async (url, folderId) => {
		set({ isLoading: true });
		try {
			const res = await fetch(`${API_BASE}/api/feeds`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ url, folderId }),
			});
			const json = await res.json() as { success: boolean; data: FeedWithUnreadCount; error?: string };
			if (!json.success) throw new Error(json.error ?? "添加失败");
			set((state) => ({ feeds: [...state.feeds, json.data] }));
		} finally {
			set({ isLoading: false });
		}
	},

	deleteFeed: async (feedId) => {
		await fetch(`${API_BASE}/api/feeds/${feedId}`, { method: "DELETE", credentials: "include" });
		set((state) => ({ feeds: state.feeds.filter((f) => f.id !== feedId) }));
	},

	moveFeedToFolder: async (feedId, folderId) => {
		const feed = get().feeds.find(item => item.id === feedId);
		if (!feed || get().movingFeedId || (feed.folderId ?? null) === folderId) return;
		if (folderId && !get().folders.some(folder => folder.id === folderId)) return;
		const previousFolder = feed.folderId ?? null;
		set(state => ({ movingFeedId: feedId, moveStatus: "正在移动…", feeds: state.feeds.map(item => item.id === feedId ? { ...item, folderId } : item) }));
		try {
			const res = await fetch(`${API_BASE}/api/feeds/${feedId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ folderId }),
				signal: AbortSignal.timeout(15_000),
			});
			const json = await res.json() as { success: boolean; data: FeedWithUnreadCount };
			if (!res.ok || !json.success) throw new Error("移动失败");
			set({ moveStatus: `已移至${get().folders.find(folder => folder.id === folderId)?.name ?? "未分类"}` });
			if (["folder", "uncategorized"].includes(get().selectedSource.type)) await useArticleStore.getState().fetchArticles(get().selectedSource);
		} catch {
			set(state => ({ moveStatus: "移动失败，已恢复原位置，请重试", feeds: state.feeds.map(item => item.id === feedId ? { ...item, folderId: previousFolder } : item) }));
		} finally { set({ movingFeedId: null }); }
	},

	addFolder: async (name, color) => {
		const res = await fetch(`${API_BASE}/api/folders`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ name, color }),
		});
		const json = await res.json() as { success: boolean; data: Folder };
		if (json.success) {
			set((state) => ({ folders: [...state.folders, json.data] }));
		}
	},

	deleteFolder: async (folderId) => {
		set({ moveStatus: null });
		const response = await fetch(`${API_BASE}/api/folders/${folderId}`, { method: "DELETE", credentials: "include" });
		if (!response.ok) { set({ moveStatus: "删除文件夹失败，请重试" }); return; }
		set((state) => ({
			folders: state.folders.filter((f) => f.id !== folderId),
			feeds: state.feeds.map((f) => (f.folderId === folderId ? { ...f, folderId: null } : f)),
		}));
		if (get().selectedSource.type === "uncategorized") await useArticleStore.getState().fetchArticles(get().selectedSource);
	},

	renameFolder: async (folderId, name) => {
		const res = await fetch(`${API_BASE}/api/folders/${folderId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ name }),
		});
		const json = await res.json() as { success: boolean; data: Folder };
		if (json.success) {
			set((state) => ({
				folders: state.folders.map((f) => (f.id === folderId ? json.data : f)),
			}));
		}
	},

	refresh: async (feedId) => {
		if (get().isLoading) return;
		set({ isLoading: true, refreshError: null });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 65_000);
		try {
			const res = await fetch(`${API_BASE}/api/refresh`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(feedId ? { feedId } : {}),
				signal: controller.signal,
			});
			const json = await res.json() as {
				success: boolean;
				data: { queued: number; feeds: Pick<FeedWithUnreadCount, "id" | "lastFetchedAt" | "lastErrorAt">[] };
			};
			if (!res.ok || !json.success) throw new Error("刷新任务提交失败，请重试");
			if (json.data.queued === 0) return;

			for (let attempt = 0; attempt < 30; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
				const status = await fetch(`${API_BASE}/api/feeds`, {
					credentials: "include",
					signal: controller.signal,
				});
				const result = await status.json() as { success: boolean; data: FeedWithUnreadCount[] };
				if (!status.ok || !result.success) throw new Error("无法获取刷新进度，请稍后重试");
				set({ feeds: result.data });
				const currentFeeds = new Map(result.data.map((feed) => [feed.id, feed]));
				const failed = json.data.feeds.some((baseline) => {
					const current = currentFeeds.get(baseline.id);
					return current?.lastErrorAt && current.lastErrorAt !== baseline.lastErrorAt;
				});
				const complete = json.data.feeds.every((baseline) => {
					const current = currentFeeds.get(baseline.id);
					return !current || current.lastFetchedAt !== baseline.lastFetchedAt
						|| Boolean(current.lastErrorAt && current.lastErrorAt !== baseline.lastErrorAt);
				});
				if (complete) {
					const loaded = await useArticleStore.getState().fetchArticles(get().selectedSource);
					if (!loaded) throw new Error("文章列表加载失败，请稍后重试");
					if (failed) set({ refreshError: "部分订阅源刷新失败，后台会自动重试" });
					return;
				}
			}
			set({ refreshError: "刷新仍在后台进行，请稍后再查看" });
		} catch (error) {
			set({ refreshError: controller.signal.aborted
				? "等待刷新超时，任务可能仍在后台进行"
				: error instanceof Error ? error.message : "刷新失败，请稍后重试" });
		} finally {
			clearTimeout(timeout);
			set({ isLoading: false });
		}
	},
}));
