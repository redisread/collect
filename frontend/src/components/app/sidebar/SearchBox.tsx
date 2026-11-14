import { useEffect, useRef, useCallback, useState } from "react";
import { useArticleStore } from "@/lib/store/articleStore";
import { useUiStore } from "@/lib/store/uiStore";
import type { ArticleListItem } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/date";

// 防抖函数
function debounce<T extends (...args: string[]) => void>(fn: T, delay: number) {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	return (...args: Parameters<T>) => {
		if (timeoutId) clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	};
}

export function SearchBox() {
	const { searchQuery, setSearchQuery, searchResults, isSearching, performSearch, clearSearch } =
		useArticleStore();
	const { setActiveColumn } = useUiStore();
	const inputRef = useRef<HTMLInputElement>(null);
	const [showResults, setShowResults] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);

	// 防抖搜索
	const debouncedSearch = useCallback(
		debounce((query: string) => {
			if (query.trim()) {
				performSearch(query);
			}
		}, 300),
		[performSearch]
	);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setSearchQuery(value);
		setShowResults(true);
		setSelectedIndex(-1);

		if (!value.trim()) {
			clearSearch();
		} else {
			debouncedSearch(value);
		}
	};

	const handleClear = () => {
		setSearchQuery("");
		clearSearch();
		setShowResults(false);
		setSelectedIndex(-1);
		inputRef.current?.focus();
	};

	// 键盘导航搜索结果
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (window.location.pathname.replace(/\/$/, "") === "/settings") return;
			// 仅在搜索结果显示时处理
			if (!showResults || searchResults.length === 0) return;

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((prev) =>
						prev < searchResults.length - 1 ? prev + 1 : prev
					);
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
					break;
				case "Enter":
					if (selectedIndex >= 0) {
						e.preventDefault();
						const article = searchResults[selectedIndex];
						if (article) {
							selectAndClose(article.id);
						}
					}
					break;
				case "Escape":
					e.preventDefault();
					setShowResults(false);
					setSelectedIndex(-1);
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [showResults, searchResults, selectedIndex]);

	// 点击外部关闭搜索结果
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest("[data-search-container]")) {
				setShowResults(false);
				setSelectedIndex(-1);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const selectAndClose = useCallback(
		(articleId: string) => {
			const { selectArticle } = useArticleStore.getState();
			selectArticle(articleId, "search");
			setActiveColumn("detail");
			setShowResults(false);
			setSelectedIndex(-1);
		},
		[setActiveColumn]
	);

	// 高亮匹配文本
	const highlightMatch = (text: string, query: string) => {
		if (!query.trim()) return text;
		const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(${escapedQuery})`, "gi");
		const parts = text.split(regex);
		return parts.map((part, i) =>
			regex.test(part) ? (
				<span key={i} className="bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100">
					{part}
				</span>
			) : (
				part
			)
		);
	};

	return (
		<div data-search-container className="relative px-3 py-2">
			<div
				className={cn(
					"flex items-center gap-2 px-3 py-1.5 rounded-lg",
					"bg-[var(--bg-card-hover)] border border-transparent",
					"transition-all duration-[var(--transition-base)]",
					"focus-within:border-[var(--accent)] focus-within:bg-[var(--bg-main)]"
				)}
			>
				<svg
					className={cn(
						"w-3.5 h-3.5 shrink-0",
						isSearching ? "text-[var(--accent)] animate-pulse" : "text-[var(--text-tertiary)]"
					)}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
				>
					<circle cx="11" cy="11" r="8" />
					<path d="m21 21-4.35-4.35" />
				</svg>
				<input
					ref={inputRef}
					data-search-input
					type="text"
					placeholder="搜索文章… (/)"
					value={searchQuery}
					onChange={handleChange}
					onFocus={() => searchQuery.trim() && setShowResults(true)}
					className={cn(
						"flex-1 bg-transparent text-xs text-[var(--text-primary)]",
						"placeholder:text-[var(--text-tertiary)] outline-none"
					)}
				/>
				{searchQuery && (
					<button
						onClick={handleClear}
						className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
					>
						<svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				)}
			</div>

			{/* 搜索结果下拉 */}
			{showResults && searchQuery.trim() && (
				<div
					className={cn(
						"absolute top-full left-3 right-3 mt-1 z-50",
						"max-h-80 overflow-y-auto",
						"bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg"
					)}
				>
					{isSearching ? (
						<div className="flex items-center justify-center py-4">
							<div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
						</div>
					) : searchResults.length === 0 ? (
						<div className="py-4 text-center">
							<p className="text-sm text-[var(--text-tertiary)]">未找到相关文章</p>
							<p className="text-xs text-[var(--text-tertiary)] mt-1">
								尝试其他关键词
							</p>
						</div>
					) : (
						<div>
							<div className="px-3 py-2 border-b border-[var(--border-light)]">
								<p className="text-xs text-[var(--text-tertiary)]">
									找到 {searchResults.length} 篇相关文章
								</p>
							</div>
							{searchResults.map((article: ArticleListItem, index: number) => (
								<button
									key={article.id}
									onClick={() => selectAndClose(article.id)}
									className={cn(
										"w-full text-left px-3 py-2.5",
										"hover:bg-[var(--bg-card-hover)] transition-colors",
										index === selectedIndex && "bg-[var(--bg-card-hover)]"
									)}
								>
									<p className="text-sm text-[var(--text-primary)] line-clamp-1">
										{highlightMatch(article.title, searchQuery)}
									</p>
									{article.summary && (
										<p className="text-xs text-[var(--text-tertiary)] line-clamp-1 mt-0.5">
											{highlightMatch(article.summary, searchQuery)}
										</p>
									)}
									<div className="flex items-center gap-2 mt-1">
										<span className="text-[10px] text-[var(--text-tertiary)]">
											{formatRelativeTime(article.publishedAt)}
										</span>
										{article.isStarred && (
											<svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
												<path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
											</svg>
											)}
											{!article.isRead && (
												<span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
											)}
										</div>
									</button>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		);
	}
