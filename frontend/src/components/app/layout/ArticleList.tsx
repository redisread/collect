import { useEffect, useRef, useCallback } from "react";
import { useArticleStore } from "@/lib/store/articleStore";
import { useFeedStore } from "@/lib/store/feedStore";
import { ArticleCard } from "../article/ArticleCard";
import { ArticleCardSkeleton } from "../article/ArticleSkeleton";
import { EmptyState } from "../common/EmptyState";

export function ArticleList() {
	const { articles, isLoading, hasMore, fetchMoreArticles, total, sortOrder, setSortOrder } =
		useArticleStore();
	const { selectedSource } = useFeedStore();
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		void useArticleStore.getState().fetchArticles(useFeedStore.getState().selectedSource);
	}, [sortOrder]);

	// 无限滚动加载
	const handleObserver = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const [entry] = entries;
			if (entry.isIntersecting && hasMore && !isLoading) {
				fetchMoreArticles(selectedSource);
			}
		},
		[hasMore, isLoading, fetchMoreArticles, selectedSource]
	);

	useEffect(() => {
		const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
		if (bottomRef.current) observer.observe(bottomRef.current);
		return () => observer.disconnect();
	}, [handleObserver]);

	// 获取标题
	const getTitle = () => {
		switch (selectedSource.type) {
			case "all": return "全部文章";
			case "starred": return "收藏";
			case "read_later": return "稍后阅读";
			default: return "文章";
		}
	};

	return (
		<div className="flex flex-col h-full border-r border-[var(--border)]">
			{/* 列表标题栏 */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
				<div>
					<h2 className="text-sm font-semibold text-[var(--text-primary)]">{getTitle()}</h2>
					{total > 0 && (
						<p className="text-[11px] text-[var(--text-tertiary)]">{total} 篇</p>
					)}
				</div>
				{/* 排序切换 */}
				<button
					onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
					title={sortOrder === "desc" ? "最新在前" : "最旧在前"}
					className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition-colors"
				>
					<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
						{sortOrder === "desc" ? (
							<path d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0-3.75-3.75M17.25 21 21 17.25" />
						) : (
							<path d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75V21m0 0-3.75-3.75M13.5 21l3.75-3.75" />
						)}
					</svg>
				</button>
			</div>

			{/* 文章列表 */}
			<div className="flex-1 overflow-y-auto">
				{isLoading && articles.length === 0 ? (
					<div>
						{Array.from({ length: 8 }).map((_, i) => (
							<ArticleCardSkeleton key={i} />
						))}
					</div>
				) : articles.length === 0 ? (
					<EmptyState
						icon="📭"
						title="暂无文章"
						description="添加订阅源后，文章将在这里显示"
						className="h-full"
					/>
				) : (
					<>
						{articles.map((article, index) => (
							<ArticleCard key={article.id} article={article} index={index} />
						))}

						{/* 无限滚动触发器 */}
						<div ref={bottomRef} className="h-4" />

						{isLoading && (
							<div className="flex justify-center py-4">
								<div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
