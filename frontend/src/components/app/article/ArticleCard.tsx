import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, useReducedMotion, type PanInfo } from "framer-motion";
import { useArticleStore } from "@/lib/store/articleStore";
import { useFeedStore } from "@/lib/store/feedStore";
import type { ArticleListItem } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

interface ArticleCardProps {
	article: ArticleListItem;
	index: number;
}

// 滑动阈值
const SWIPE_THRESHOLD = 100;
// 最大滑动距离
const MAX_SWIPE = 150;

export function ArticleCard({ article, index }: ArticleCardProps) {
	const { selectedArticleId, selectArticle, markRead, toggleStarred } = useArticleStore();
	const { feeds } = useFeedStore();
	const isSelected = selectedArticleId === article.id;
	const [isDragging, setIsDragging] = useState(false);
	const cardRef = useRef<HTMLDivElement>(null);

	const feed = feeds.find((f) => f.id === article.feedId);

	// 用于滑动动画的值
	const x = useMotionValue(0);
	const reduceMotion = useReducedMotion();

	// 根据滑动距离计算背景透明度
	const leftSwipeProgress = useTransform(x, [-MAX_SWIPE, -SWIPE_THRESHOLD, 0], [1, 0.5, 0]);
	const rightSwipeProgress = useTransform(x, [0, SWIPE_THRESHOLD, MAX_SWIPE], [0, 0.5, 1]);

	// 处理滑动结束
	const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
		setIsDragging(false);
		if (reduceMotion) x.set(0);
		const swipeDistance = info.offset.x;

		if (swipeDistance <= -SWIPE_THRESHOLD) {
			// 左滑 - 切换已读状态
			markRead(article.id, !article.isRead);
		} else if (swipeDistance >= SWIPE_THRESHOLD) {
			// 右滑 - 切换收藏状态
			toggleStarred(article.id);
		}
	};

	// 处理点击 - 如果正在拖动则不触发点击
	const handleClick = () => {
		if (!isDragging) {
			selectArticle(article.id);
		}
	};

	return (
		<div
			ref={cardRef}
			className="relative overflow-hidden"
			style={{ animationDelay: `${index * 30}ms` }}
		>
			{/* 左滑背景 - 已读操作 */}
			<motion.div
				className="absolute inset-0 flex items-center justify-end pr-6 pointer-events-none"
				style={{ opacity: leftSwipeProgress }}
			>
				<div className="flex items-center gap-2 text-white">
					<span className="text-sm font-medium">
						{article.isRead ? "标记未读" : "标记已读"}
					</span>
					<div
						className={cn(
							"w-10 h-10 rounded-full flex items-center justify-center",
							article.isRead ? "bg-blue-400" : "bg-blue-500"
						)}
					>
						{article.isRead ? (
							<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
							</svg>
						) : (
							<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path d="M5 13l4 4L19 7" />
							</svg>
						)}
					</div>
				</div>
				<div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-blue-500/40 -z-10" />
			</motion.div>

			{/* 右滑背景 - 收藏操作 */}
			<motion.div
				className="absolute inset-0 flex items-center pl-6 pointer-events-none"
				style={{ opacity: rightSwipeProgress }}
			>
				<div className="flex items-center gap-2 text-white">
					<div
						className={cn(
							"w-10 h-10 rounded-full flex items-center justify-center",
							article.isStarred ? "bg-amber-400" : "bg-amber-500"
						)}
					>
						<svg
							className="w-5 h-5"
							fill={article.isStarred ? "none" : "currentColor"}
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
						</svg>
					</div>
					<span className="text-sm font-medium">
						{article.isStarred ? "取消收藏" : "收藏"}
					</span>
				</div>
				<div className="absolute inset-0 bg-gradient-to-l from-amber-500/20 to-amber-500/40 -z-10" />
			</motion.div>

			{/* 卡片内容 */}
			<motion.button
				onClick={handleClick}
				className={cn(
					"w-full text-left px-4 py-3 border-b border-[var(--border-light)]",
					"transition-colors duration-[var(--transition-base)]",
					"hover:bg-[var(--bg-card-hover)] relative z-10 bg-[var(--bg-main)]",
					isSelected && "bg-[var(--bg-card-selected)]",
					!article.isRead && "relative"
				)}
				style={{ x }}
				drag="x"
				dragConstraints={{ left: 0, right: 0 }}
				dragElastic={reduceMotion ? 0 : 0.1}
				dragMomentum={false}
				onDragStart={() => setIsDragging(true)}
				onDragEnd={handleDragEnd}
				dragDirectionLock
				whileTap={{ cursor: "grabbing" }}
			>
				{/* 未读指示点 */}
				{!article.isRead && (
					<span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
				)}

				<div className="flex items-start gap-3">
					<div className="flex-1 min-w-0 space-y-1">
						{/* 来源 & 时间 */}
						<div className="flex items-center gap-1.5">
							{feed?.faviconUrl && (
								<img
									src={feed.faviconUrl}
									alt=""
									className="w-3.5 h-3.5 rounded-sm object-contain"
									onError={(e) => {
										(e.target as HTMLImageElement).style.display = "none";
									}}
								/>
							)}
							<span className="text-[11px] text-[var(--text-tertiary)] truncate">
								{feed?.title ?? "未知来源"}
							</span>
							<span className="text-[11px] text-[var(--text-tertiary)] shrink-0">
								· {formatRelativeTime(article.publishedAt)}
							</span>
							{article.isStarred && (
								<svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
									<path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
								</svg>
							)}
						</div>

						{/* 标题 */}
						<p
							className={cn(
								"text-sm leading-snug line-clamp-2",
								article.isRead
									? "text-[var(--text-secondary)] font-normal"
									: "text-[var(--text-primary)] font-medium"
							)}
						>
							{article.title}
						</p>

						{/* 摘要 */}
						{article.summary && (
							<p className="text-xs text-[var(--text-tertiary)] line-clamp-1">
								{article.summary}
							</p>
						)}
					</div>

					{/* 封面图 */}
					{article.imageUrl && (
						<img
							src={article.imageUrl}
							alt=""
							className="w-16 h-12 rounded-lg object-cover shrink-0"
							onError={(e) => {
								(e.target as HTMLImageElement).style.display = "none";
							}}
						/>
					)}
				</div>
			</motion.button>
		</div>
	);
}
