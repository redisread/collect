import { useArticleStore } from "@/lib/store/articleStore";
import { cn } from "@/lib/utils/cn";
import type { Article } from "@/lib/types";

interface ArticleToolbarProps {
	article: Article;
	onOpenNotes?: () => void;
}

export function ArticleToolbar({ article, onOpenNotes }: ArticleToolbarProps) {
	const { toggleStarred, toggleReadLater, translateArticle, translations, isTranslating, extractArticle, isExtracting } =
		useArticleStore();

	const hasTranslation = !!translations[article.id];
	const hasContent = !!article.content;

	// 获取翻译文本（优先使用 content，没有则使用 summary）
	const getTranslateText = () => {
		// 提取纯文本，去除 HTML 标签
		const text = article.content || article.summary || "";
		return text.replace(/<[^>]*>/g, "").trim();
	};

	const handleTranslate = () => {
		const text = getTranslateText();
		if (text) {
			translateArticle(article.id, text);
		}
	};

	return (
		<div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border-light)] bg-[var(--bg-main)]">
			{/* 收藏 */}
			<button
				onClick={() => toggleStarred(article.id)}
				title={article.isStarred ? "取消收藏" : "收藏"}
				className={cn(
					"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
					"transition-all duration-[var(--transition-base)]",
					article.isStarred
						? "text-amber-500 bg-amber-50 dark:bg-amber-900/20"
						: "text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
				)}
			>
				<svg
					className="w-4 h-4"
					fill={article.isStarred ? "currentColor" : "none"}
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={1.5}
				>
					<path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
				</svg>
				收藏
			</button>

			{/* 稍后阅读 */}
			<button
				onClick={() => toggleReadLater(article.id)}
				title={article.isReadLater ? "移出稍后阅读" : "稍后阅读"}
				className={cn(
					"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
					"transition-all duration-[var(--transition-base)]",
					article.isReadLater
						? "text-[var(--accent)] bg-[var(--accent-light)]"
						: "text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
				)}
			>
				<svg
					className="w-4 h-4"
					fill={article.isReadLater ? "currentColor" : "none"}
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={1.5}
				>
					<path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
				</svg>
				稍后读
			</button>

			{/* 笔记按钮 */}
			{onOpenNotes && (
				<button
					onClick={onOpenNotes}
					title="查看笔记"
					className={cn(
						"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
						"text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]",
						"transition-all duration-[var(--transition-base)]"
					)}
				>
					<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
						<path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
					</svg>
					笔记
				</button>
			)}

			{/* 提取全文 */}
			{!hasContent && (
				<button
					onClick={() => extractArticle(article.id)}
					disabled={isExtracting}
					title="提取全文内容"
					className={cn(
						"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
						"transition-all duration-[var(--transition-base)]",
						isExtracting
							? "opacity-50 cursor-wait text-[var(--text-tertiary)]"
							: "text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
					)}
				>
					{isExtracting ? (
						<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
						</svg>
					) : (
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
						</svg>
					)}
					{isExtracting ? "提取中" : "提取全文"}
				</button>
			)}

			{/* 翻译 */}
			<button
				onClick={handleTranslate}
				disabled={isTranslating}
				title="翻译为中文"
				className={cn(
					"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
					"transition-all duration-[var(--transition-base)]",
					isTranslating
						? "opacity-50 cursor-wait"
						: hasTranslation
							? "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
							: "text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
				)}
			>
				{isTranslating ? (
					<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
					</svg>
				) : (
					<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l6-6m-6 6l6-6m-6 6h12" />
					</svg>
				)}
				{isTranslating ? "翻译中" : hasTranslation ? "译文" : "翻译"}
			</button>

			<div className="flex-1" />

			{/* 在浏览器中打开 */}
			<a
				href={article.url}
				target="_blank"
				rel="noopener noreferrer"
				title="在浏览器中打开"
				className={cn(
					"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
					"text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]",
					"transition-all duration-[var(--transition-base)]"
				)}
			>
				<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
				</svg>
				原文
			</a>
		</div>
	);
}
