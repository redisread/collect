import { useEffect } from "react";
import { useArticleStore } from "@/lib/store/articleStore";
import { useFeedStore } from "@/lib/store/feedStore";
import { useUiStore } from "@/lib/store/uiStore";

// 基础键盘快捷键（与 VimShortcuts 互补，不冲突）
export function KeyboardShortcuts() {
	const { refresh } = useFeedStore();
	const { setActiveColumn, setSearchQuery } = useUiStore();

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// 忽略输入框中的按键
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			// 基础快捷键（不与 Vim 快捷键冲突）
			switch (e.key) {
				case "r":
				case "R":
					// 刷新（不拦截 Ctrl+R 浏览器刷新）
					if (!e.metaKey && !e.ctrlKey) {
						e.preventDefault();
						refresh();
					}
					break;

				case "1":
					if (!e.metaKey && !e.ctrlKey) {
						e.preventDefault();
						setActiveColumn("sidebar");
					}
					break;

				case "2":
					if (!e.metaKey && !e.ctrlKey) {
						e.preventDefault();
						setActiveColumn("list");
					}
					break;

				case "3":
					if (!e.metaKey && !e.ctrlKey) {
						e.preventDefault();
						setActiveColumn("detail");
					}
					break;

				// 注意：导航快捷键 (j/k)、操作快捷键 (m/s/l/o/e/t/v)、搜索 (/) 和帮助 (?) 
				// 都由 VimShortcuts 组件处理
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [refresh, setActiveColumn, setSearchQuery]);

	return null;
}
