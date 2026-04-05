import { useEffect, useRef, useState } from "react";
import { useArticleStore } from "@/lib/store/articleStore";
import { useFeedStore } from "@/lib/store/feedStore";
import { ArticleToolbar } from "./ArticleToolbar";
import { ArticleDetailSkeleton } from "./ArticleSkeleton";
import { formatFullDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

type ViewMode = "original" | "translated" | "both";

export function ArticleReader() {
	const { selectedArticle, isLoadingDetail, translations, clearTranslation } = useArticleStore();
	const { feeds } = useFeedStore();
	const contentRef = useRef<HTMLDivElement>(null);
	const [viewMode, setViewMode] = useState<ViewMode>("original");

	// 切换文章时重置视图模式
	useEffect(() => {
		setViewMode("original");
	}, [selectedArticle?.id]);

	// 切换文章时滚动到顶部
	useEffect(() => {
		if (contentRef.current) {
			contentRef.current.scrollTop = 0;
		}
	}, [selectedArticle?.id]);

	const translation = selectedArticle ? translations[selectedArticle.id] : null;
	const hasTranslation = !!translation;

	if (isLoadingDetail) {
		return <ArticleDetailSkeleton />;
	}

	if (!selectedArticle) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center space-y-2">
					<p className="text-4xl opacity-20">📖</p>
					<p className="text-sm text-[var(--text-tertiary)]">选择一篇文章开始阅读</p>
					<p className="text-xs text-[var(--text-tertiary)]">按 J/K 键在文章间导航</p>
				</div>
			</div>
		);
	}

	const feed = feeds.find((f) => f.id === selectedArticle.feedId);

	return (
		<div className="flex flex-col h-full">
			{/* 工具栏 */}
			<ArticleToolbar article={selectedArticle} />

			{/* 正文区域 */}
			<div ref={contentRef} className="flex-1 overflow-y-auto">
				<article className="max-w-[680px] mx-auto px-6 py-8 animate-fade-in">
					{/* 来源信息 */}
					<div className="flex items-center gap-2 mb-4">
						{feed?.faviconUrl && (
							<img
								src={feed.faviconUrl}
								alt=""
								className="w-4 h-4 rounded-sm"
								onError={(e) => {
									(e.target as HTMLImageElement).style.display = "none";
								}}
							/>
						)}
						<span className="text-xs text-[var(--text-secondary)]">{feed?.title ?? "未知来源"}</span>
						{selectedArticle.author && (
							<>
								<span className="text-[var(--text-tertiary)]">·</span>
								<span className="text-xs text-[var(--text-secondary)]">{selectedArticle.author}</span>
							</>
						)}
					</div>

					{/* 标题 */}
					<h1 className="text-2xl font-semibold leading-tight text-[var(--text-primary)] mb-3">
						{selectedArticle.title}
					</h1>

					{/* 发布时间 */}
					{selectedArticle.publishedAt && (
						<p className="text-xs text-[var(--text-tertiary)] mb-6">
							{formatFullDate(selectedArticle.publishedAt)}
						</p>
					)}

					{/* 封面图 */}
					{selectedArticle.imageUrl && (
						<img
							src={selectedArticle.imageUrl}
							alt={selectedArticle.title}
							className="w-full rounded-xl object-cover mb-6 max-h-80"
							onError={(e) => {
								(e.target as HTMLImageElement).style.display = "none";
							}}
						/>
					)}

					{/* 视图模式切换（当有翻译时显示） */}
					{hasTranslation && (
						<div className="flex items-center gap-2 mb-4 pb-4 border-b border-[var(--border-light)]">
							<span className="text-xs text-[var(--text-tertiary)]">显示:</span>
							<button
								onClick={() => setViewMode("original")}
								className={cn(
									"px-2 py-1 rounded text-xs transition-colors",
									viewMode === "original"
										? "bg-[var(--accent)] text-white"
										: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
								)}
							>
								原文
							</button>
							<button
								onClick={() => setViewMode("both")}
								className={cn(
									"px-2 py-1 rounded text-xs transition-colors",
									viewMode === "both"
										? "bg-[var(--accent)] text-white"
										: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
								)}
							>
								双语
							</button>
							<button
								onClick={() => setViewMode("translated")}
								className={cn(
									"px-2 py-1 rounded text-xs transition-colors",
									viewMode === "translated"
										? "bg-[var(--accent)] text-white"
										: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
								)}
							>
								译文
							</button>
							<button
								onClick={() => clearTranslation(selectedArticle.id)}
								className="ml-auto text-xs text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
							>
								清除翻译
							</button>
						</div>
					)}

					{/* 文章正文 */}
					{(viewMode === "original" || viewMode === "both") && (
						<>
							{selectedArticle.content ? (
								<div
									className="article-content"
									dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
								/>
							) : (
								<div className="space-y-4">
									{selectedArticle.summary && (
										<p className="text-[var(--text-secondary)] leading-relaxed">
											{selectedArticle.summary}
										</p>
									)}
									<a
										href={selectedArticle.url}
										target="_blank"
										rel="noopener noreferrer"
										className={cn(
											"inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
											"bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]",
											"transition-colors"
										)}
									>
										阅读原文
										<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
											<path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
										</svg>
									</a>
								</div>
							)}
						</>
					)}

					{/* 翻译内容 */}
					{hasTranslation && (viewMode === "translated" || viewMode === "both") && (
						<div
							className={cn(
								"mt-6",
								viewMode === "both" && "pt-6 border-t border-[var(--border-light)]"
							)}
						>
							{viewMode === "both" && (
								<h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
									中文翻译
								</h3>
							)}
							<div className="prose prose-sm max-w-none text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
								{translation.translated}
							</div>
						</div>
					)}
				</article>
			</div>
		</div>
	);
}
