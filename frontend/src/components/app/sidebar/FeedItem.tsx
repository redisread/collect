import { useState } from "react";
import { useFeedStore } from "@/lib/store/feedStore";
import { useArticleStore } from "@/lib/store/articleStore";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { cn } from "@/lib/utils/cn";
import type { FeedWithUnreadCount } from "@/lib/types";
import { FEED_DRAG_TYPE } from "./FeedDropZone";

interface FeedItemProps {
	feed: FeedWithUnreadCount;
	isSelected: boolean;
}

export function FeedItem({ feed, isSelected }: FeedItemProps) {
	const { setSelectedSource, deleteFeed, folders, moveFeedToFolder, movingFeedId } = useFeedStore();
	const { fetchArticles } = useArticleStore();
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

	const handleClick = () => {
		const source = { type: "feed" as const, feedId: feed.id };
		setSelectedSource(source);
		fetchArticles(source);
	};

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY });
	};

	const menuItems: ContextMenuItem[] = [
		{
			label: "刷新",
			icon: "↻",
			onClick: () => {
				useFeedStore.getState().refresh(feed.id);
			},
		},
		{
			label: "在浏览器中打开",
			icon: "↗",
			onClick: () => window.open(feed.url, "_blank", "noopener,noreferrer"),
		},
		{
			label: "删除订阅源",
			icon: "🗑",
			variant: "danger",
			onClick: () => deleteFeed(feed.id),
		},
	];

	return (
		<>
			<div className="flex min-w-0 items-center gap-1">
			<button
				draggable={!movingFeedId}
				onDragStart={event => {
					event.dataTransfer.setData(FEED_DRAG_TYPE, feed.id);
					event.dataTransfer.effectAllowed = "move";
				}}
				onClick={handleClick}
				onContextMenu={handleContextMenu}
				className={cn(
					"min-w-0 flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-grab active:cursor-grabbing",
					"transition-colors duration-150",
					isSelected
						? "bg-[var(--accent-light)] text-[var(--accent)]"
						: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
				)}
			>
				{/* Favicon */}
				<span className="w-4 h-4 shrink-0 flex items-center justify-center">
					{feed.faviconUrl ? (
						<img
							src={feed.faviconUrl}
							alt=""
							className="w-4 h-4 rounded-sm object-contain"
							onError={(e) => {
								(e.target as HTMLImageElement).style.display = "none";
							}}
						/>
					) : (
						<span className="w-4 h-4 rounded-sm bg-[var(--bg-card-hover)] flex items-center justify-center text-[8px] text-[var(--text-tertiary)] font-bold uppercase">
							{feed.title.charAt(0)}
						</span>
					)}
				</span>

				{/* 名称 */}
				<span className="flex-1 text-left truncate">{feed.title}</span>

				{/* 未读数 */}
				{(feed.unreadCount ?? 0) > 0 && (
					<span
						className={cn(
							"text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0",
							isSelected
								? "bg-[var(--accent)] text-white"
								: "bg-[var(--bg-card-hover)] text-[var(--text-tertiary)]"
						)}
					>
						{feed.unreadCount}
					</span>
				)}
			</button>
			<select aria-label={`移动 ${feed.title} 到文件夹`} value={feed.folderId ?? ""}
				disabled={!!movingFeedId} onChange={event => void moveFeedToFolder(feed.id, event.target.value || null)}
				className="w-16 shrink-0 rounded-md bg-[var(--bg-sidebar)] px-1 py-2 text-xs text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
			>
				<option value="">未分类</option>
				{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
			</select>
			</div>

			{contextMenu && (
				<ContextMenu
					items={menuItems}
					x={contextMenu.x}
					y={contextMenu.y}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</>
	);
}
