import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
export type ActiveColumn = "sidebar" | "list" | "detail";

interface UiStore {
	theme: ThemeMode;
	sidebarWidth: number;
	articleListWidth: number;
	activeColumn: ActiveColumn;
	isSidebarCollapsed: boolean;
	searchQuery: string;
	feedToMoveId: string | null;
	setFeedToMoveId: (id: string | null) => void;

	setTheme: (theme: ThemeMode) => void;
	setSidebarWidth: (width: number) => void;
	setArticleListWidth: (width: number) => void;
	setActiveColumn: (column: ActiveColumn) => void;
	toggleSidebar: () => void;
	setSearchQuery: (query: string) => void;
}

export const useUiStore = create<UiStore>()(
	persist(
		(set) => ({
			theme: "system" as ThemeMode,
			sidebarWidth: 240,
			articleListWidth: 360,
			activeColumn: "list" as ActiveColumn,
			isSidebarCollapsed: false,
			searchQuery: "",
			feedToMoveId: null,
			setFeedToMoveId: (feedToMoveId) => set({ feedToMoveId }),

			setTheme: (theme) => set({ theme }),
			setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
			setArticleListWidth: (articleListWidth) => set({ articleListWidth }),
			setActiveColumn: (activeColumn) => set({ activeColumn }),
			toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
			setSearchQuery: (searchQuery) => set({ searchQuery }),
		}),
		{
			name: "folio-ui",
			partialize: (state) => ({
				theme: state.theme,
				sidebarWidth: state.sidebarWidth,
				articleListWidth: state.articleListWidth,
				isSidebarCollapsed: state.isSidebarCollapsed,
			}),
		}
	)
);
