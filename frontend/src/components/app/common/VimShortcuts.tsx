import { useEffect, useRef, useCallback, useState } from "react";
import { useArticleStore } from "@/lib/store/articleStore";
import { useUiStore } from "@/lib/store/uiStore";
import { cn } from "@/lib/utils/cn";

// Vim 风格快捷键映射
const VIM_KEYMAP: Record<string, string> = {
	// 导航
	j: "nextArticle",
	k: "prevArticle",
	g: "goToTop", // g + g = 到顶部
	G: "goToBottom", // 到底部
	"^": "goToFirst",
	$: "goToLast",

	// 操作
	m: "toggleRead",
	s: "toggleStar",
	o: "openOriginal",
	e: "extractContent",
	t: "translate",
	l: "toggleReadLater",

	// 搜索
	"/": "focusSearch",

	// 视图
	v: "changeViewMode",
	"?": "showHelp",
};

// 帮助浮层内容
const HELP_CONTENT = [
	{ key: "j/k", action: "下一篇/上一篇文章" },
	{ key: "gg/G", action: "到顶部/底部" },
	{ key: "^/$", action: "第一篇文章/最后一篇文章" },
	{ key: "m", action: "标记已读/未读" },
	{ key: "s", action: "收藏/取消收藏" },
	{ key: "l", action: "稍后读" },
	{ key: "o", action: "打开原文" },
	{ key: "e", action: "提取正文" },
	{ key: "t", action: "翻译" },
	{ key: "v", action: "切换视图模式" },
	{ key: "/", action: "聚焦搜索框" },
	{ key: "Esc", action: "关闭帮助/取消操作" },
	{ key: "?", action: "显示快捷键帮助" },
];

interface VimShortcutsProps {
	contentRef?: React.RefObject<HTMLDivElement | null>;
}

export function VimShortcuts({ contentRef }: VimShortcutsProps) {
	const {
		selectedArticle,
		selectedArticleId,
		navigateArticle,
		toggleRead,
		toggleStarred,
		toggleReadLater,
		extractArticle,
		translateArticle,
		isExtracting,
		isTranslating,
		articles,
		selectArticle,
	} = useArticleStore();
	const { setSearchQuery } = useUiStore();

	const [showHelp, setShowHelp] = useState(false);
	const lastKeyRef = useRef<string | null>(null);
	const lastKeyTimeRef = useRef<number>(0);

	// 处理组合键（如 gg）
	const handleComboKey = useCallback(
		(key: string): boolean => {
			const now = Date.now();
			const timeSinceLastKey = now - lastKeyTimeRef.current;

			// 如果距离上次按键超过 500ms，重置
			if (timeSinceLastKey > 500) {
				lastKeyRef.current = null;
			}

			// 检测 "gg" 组合
			if (key === "g" && lastKeyRef.current === "g") {
				lastKeyRef.current = null;
				return true; // 表示这是一个组合键
			}

			lastKeyRef.current = key;
			lastKeyTimeRef.current = now;
			return false;
		},
		[]
	);

	// 滚动到顶部
	const scrollToTop = useCallback(() => {
		if (contentRef?.current) {
			contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [contentRef]);

	// 滚动到底部
	const scrollToBottom = useCallback(() => {
		if (contentRef?.current) {
			contentRef.current.scrollTo({
				top: contentRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [contentRef]);

	// 获取翻译文本
	const getTranslateText = useCallback(() => {
		if (!selectedArticle) return "";
		const text = selectedArticle.content || selectedArticle.summary || "";
		return text.replace(/<[^>]*>/g, "").trim();
	}, [selectedArticle]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// 忽略输入框中的按键
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				// 在输入框中按 Escape 退出输入框
				if (e.key === "Escape") {
					(target as HTMLElement).blur();
				}
				return;
			}

			const key = e.key;

			// Escape 关闭帮助
			if (key === "Escape") {
				if (showHelp) {
					e.preventDefault();
					setShowHelp(false);
					return;
				}
				return;
			}

			// 显示帮助
			if (key === "?") {
				e.preventDefault();
				setShowHelp(true);
				return;
			}

			// 处理组合键
			if (key === "g") {
				if (handleComboKey("g")) {
					e.preventDefault();
					scrollToTop();
				}
				return;
			}

			// 检查是否有对应的 Vim 快捷键
			const action = VIM_KEYMAP[key];
			if (!action) return;

			switch (action) {
				case "nextArticle":
					e.preventDefault();
					navigateArticle("next");
					break;

				case "prevArticle":
					e.preventDefault();
					navigateArticle("prev");
					break;

				case "goToBottom":
					e.preventDefault();
					scrollToBottom();
					break;

				case "goToFirst":
					e.preventDefault();
					if (articles.length > 0) {
						selectArticle(articles[0].id);
					}
					break;

				case "goToLast":
					e.preventDefault();
					if (articles.length > 0) {
						selectArticle(articles[articles.length - 1].id);
					}
					break;

				case "toggleRead":
					if (selectedArticleId) {
						e.preventDefault();
						toggleRead(selectedArticleId);
					}
					break;

				case "toggleStar":
					if (selectedArticleId) {
						e.preventDefault();
						toggleStarred(selectedArticleId);
					}
					break;

				case "toggleReadLater":
					if (selectedArticleId) {
						e.preventDefault();
						toggleReadLater(selectedArticleId);
					}
					break;

				case "openOriginal":
					if (selectedArticle?.url) {
						e.preventDefault();
						window.open(selectedArticle.url, "_blank", "noopener,noreferrer");
					}
					break;

				case "extractContent":
					if (selectedArticleId && !selectedArticle?.content && !isExtracting) {
						e.preventDefault();
						extractArticle(selectedArticleId);
					}
					break;

				case "translate":
					if (selectedArticleId && !isTranslating) {
						e.preventDefault();
						const text = getTranslateText();
						if (text) {
							translateArticle(selectedArticleId, text);
						}
					}
					break;

				case "focusSearch":
					e.preventDefault();
					setSearchQuery("");
					setTimeout(() => {
						const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
						searchInput?.focus();
					}, 50);
					break;

				case "changeViewMode":
					// 触发视图模式切换事件
					e.preventDefault();
					window.dispatchEvent(new CustomEvent("toggle-view-mode"));
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		showHelp,
		selectedArticle,
		selectedArticleId,
		articles,
		navigateArticle,
		toggleRead,
		toggleStarred,
		toggleReadLater,
		extractArticle,
		translateArticle,
		isExtracting,
		isTranslating,
		scrollToTop,
		scrollToBottom,
		getTranslateText,
		selectArticle,
		setSearchQuery,
		handleComboKey,
	]);

	return (
		<>
			{/* 快捷键帮助浮层 */}
			{showHelp && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
					onClick={() => setShowHelp(false)}
				>
					<div
						className={cn(
							"w-full max-w-md p-6 rounded-xl shadow-2xl",
							"bg-[var(--bg-card)] border border-[var(--border)]"
						)}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-lg font-semibold text-[var(--text-primary)]">
								键盘快捷键
							</h2>
							<button
								onClick={() => setShowHelp(false)}
								className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
							>
								<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
									<path d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>

						<div className="grid grid-cols-2 gap-2">
							{HELP_CONTENT.map(({ key, action }) => (
								<div
									key={key}
									className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[var(--bg-main)]"
								>
									<kbd className="px-2 py-0.5 rounded bg-[var(--bg-card-hover)] text-xs font-mono text-[var(--text-secondary)] border border-[var(--border-light)] min-w-[3rem] text-center">
										{key}
									</kbd>
									<span className="text-sm text-[var(--text-secondary)]">{action}</span>
								</div>
							))}
						</div>

						<p className="mt-4 text-xs text-[var(--text-tertiary)] text-center">
							按 <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-card-hover)] font-mono">?</kbd> 显示此帮助，
							按 <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-card-hover)] font-mono">Esc</kbd> 关闭
						</p>
					</div>
				</div>
			)}
		</>
	);
}
