import { create } from "zustand";
import type { Folder, FeedWithUnreadCount } from "../types";

const API_BASE = typeof import.meta !== 'undefined' && (import.meta as unknown as { env: Record<string, string> }).env?.PUBLIC_API_URL
  ? (import.meta as unknown as { env: Record<string, string> }).env.PUBLIC_API_URL
  : "http://localhost:8787";

// Re-export SelectedSource from types.ts for convenience
export type SelectedSource =
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
		const res = await fetch(`${API_BASE}/api/feeds/${feedId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ folderId }),
		});
		const json = await res.json() as { success: boolean; data: FeedWithUnreadCount };
		if (json.success) {
			set((state) => ({
				feeds: state.feeds.map((f) => (f.id === feedId ? { ...f, folderId } : f)),
			}));
		}
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
		await fetch(`${API_BASE}/api/folders/${folderId}`, { method: "DELETE", credentials: "include" });
		set((state) => ({
			folders: state.folders.filter((f) => f.id !== folderId),
			feeds: state.feeds.map((f) => (f.folderId === folderId ? { ...f, folderId: null } : f)),
		}));
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
		set({ isLoading: true });
		try {
			await fetch(`${API_BASE}/api/refresh`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(feedId ? { feedId } : {}),
			});
			await get().fetchFeeds();
		} finally {
			set({ isLoading: false });
		}
	},
}));
