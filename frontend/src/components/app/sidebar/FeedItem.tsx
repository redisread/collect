import { useUiStore } from "@/lib/store/uiStore";
import { useEffect, useRef, useState } from "react";
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
	const { setSelectedSource, deleteFeed, movingFeedId } = useFeedStore();
	const { fetchArticles } = useArticleStore();
	const setFeedToMoveId = useUiStore(state => state.setFeedToMoveId);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByHold = useRef(false);
  const holdStart = useRef({ x: 0, y: 0 });
  const suppressClickUntil = useRef(0);
  const cancelHold = () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => cancelHold, []);

	const handleClick = () => {
    if (performance.now() < suppressClickUntil.current) return;
		const source = { type: "feed" as const, feedId: feed.id };
		setSelectedSource(source);
		fetchArticles(source);
	};

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY });
	};

	const menuItems: ContextMenuItem[] = [
    { label: "移动到文件夹", onClick: () => { useFeedStore.setState({ moveStatus: null }); setFeedToMoveId(feed.id); } },
    { label: "全部标为已读", onClick: () => { void useFeedStore.getState().markFeedRead(feed.id); } },
    { label: feed.autoExtract ? "关闭自动全文提取" : "开启自动全文提取", onClick: () => { void useFeedStore.getState().setAutoExtract(feed.id, !feed.autoExtract); } },
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
			label: "取消订阅",
			icon: "🗑",
			variant: "danger",
			onClick: () => { if (window.confirm("取消订阅并清理普通文章？收藏和稍后阅读会保留。")) void deleteFeed(feed.id).catch(error => window.alert(error instanceof Error ? error.message : "取消订阅失败，请重试")); },
		},
	];

	return (
		<>
			<div className="flex min-w-0 items-center gap-1">
			<button
				data-move-feed={feed.id}
				draggable={!movingFeedId}
				onDragStart={event => {
					event.dataTransfer.setData(FEED_DRAG_TYPE, feed.id);
					event.dataTransfer.effectAllowed = "move";
				}}
				title={feed.title}
				onClick={handleClick}
				onContextMenu={handleContextMenu}
        onPointerDown={event => {
          if (event.pointerType !== "touch") return;
          cancelHold();
          openedByHold.current = false;
          const { clientX: x, clientY: y } = event;
          holdStart.current = { x, y };
          holdTimer.current = setTimeout(() => {
            openedByHold.current = true;
            suppressClickUntil.current = performance.now() + 800;
            setContextMenu({ x, y });
          }, 450);
        }}
        onPointerMove={event => {
          if (Math.hypot(event.clientX - holdStart.current.x, event.clientY - holdStart.current.y) > 10) cancelHold();
        }}
        onPointerUp={() => {
          cancelHold();
          if (openedByHold.current) suppressClickUntil.current = performance.now() + 800;
          openedByHold.current = false;
        }}
        onPointerCancel={cancelHold}
        onKeyDown={event => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setContextMenu({ x: rect.left, y: rect.bottom });
          }
        }}
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
