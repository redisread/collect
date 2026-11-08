import { useState } from "react";
import { useFeedStore } from "@/lib/store/feedStore";
import { useArticleStore } from "@/lib/store/articleStore";
import { FeedItem } from "./FeedItem";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { cn } from "@/lib/utils/cn";
import type { Folder, FeedWithUnreadCount } from "@/lib/types";

interface FolderItemProps {
	folder: Folder;
	feeds: FeedWithUnreadCount[];
}

export function FolderItem({ folder, feeds }: FolderItemProps) {
	const { selectedSource, setSelectedSource, toggleFolderCollapsed, deleteFolder, renameFolder } =
		useFeedStore();
	const { fetchArticles } = useArticleStore();
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(folder.name);
	const [renameError, setRenameError] = useState("");

	const isCollapsed = folder.isCollapsed ?? false;
	const isFolderSelected = selectedSource.type === "folder" && selectedSource.folderId === folder.id;
	const totalUnread = feeds.reduce((sum, f) => sum + (f.unreadCount ?? 0), 0);

	const handleFolderClick = () => {
		if (isRenaming) return;
		const source = { type: "folder" as const, folderId: folder.id };
		setSelectedSource(source);
		fetchArticles(source);
	};

	const handleToggle = (e: React.MouseEvent) => {
		e.stopPropagation();
		toggleFolderCollapsed(folder.id);
	};

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY });
	};

	const handleRenameSubmit = async () => {
		if (renameValue.trim() === "未分类") { setRenameError("“未分类”是系统分组，请使用其他名称"); return; }
		setRenameError("");
		if (renameValue.trim() && renameValue !== folder.name) {
			await renameFolder(folder.id, renameValue.trim());
		}
		setIsRenaming(false);
	};

	const menuItems: ContextMenuItem[] = [
		{
			label: "重命名",
			icon: "✏️",
			onClick: () => {
				setRenameValue(folder.name);
				setIsRenaming(true);
			},
		},
		{
			label: "删除文件夹",
			icon: "🗑",
			variant: "danger",
			onClick: () => deleteFolder(folder.id),
		},
	];

	return (
		<div>
			{/* 文件夹头部 */}
			<div
				className={cn(
					"flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer",
					"transition-all duration-[var(--transition-base)]",
					isFolderSelected
						? "bg-[var(--accent-light)] text-[var(--accent)]"
						: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
				)}
				onClick={handleFolderClick}
				onContextMenu={handleContextMenu}
			>
				{/* 折叠箭头 */}
				<button
					onClick={handleToggle}
					className={cn(
						"w-4 h-4 flex items-center justify-center shrink-0",
						"transition-transform duration-[var(--transition-base)]",
						!isCollapsed && "rotate-90"
					)}
				>
					<svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
						<path d="m9 18 6-6-6-6" />
					</svg>
				</button>

				{/* 颜色点 */}
				<span
					className="w-2 h-2 rounded-full shrink-0"
					style={{ backgroundColor: folder.color ?? "#777777" }}
				/>

				{/* 名称 */}
				{isRenaming ? (
					<input
						autoFocus
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						onBlur={handleRenameSubmit}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRenameSubmit();
							if (e.key === "Escape") setIsRenaming(false);
						}}
						onClick={(e) => e.stopPropagation()}
						className="flex-1 bg-transparent text-sm outline-none border-b border-[var(--accent)]"
					/>
				) : (
					<span className="flex-1 text-sm truncate">{folder.name}</span>
				)}

				{/* 未读数 */}
				{totalUnread > 0 && (
					<span
						className={cn(
							"text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0",
							isFolderSelected
								? "bg-[var(--accent)] text-white"
								: "bg-[var(--bg-card-hover)] text-[var(--text-tertiary)]"
						)}
					>
						{totalUnread}
					</span>
				)}
			</div>
			{renameError && <p role="alert" className="px-2 text-xs text-red-600">{renameError}</p>}

			{/* 订阅源列表（展开时显示） */}
			{!isCollapsed && feeds.length > 0 && (
				<div className="ml-3 pl-2 border-l border-[var(--border-light)]">
					{feeds.map((feed) => (
						<FeedItem
							key={feed.id}
							feed={feed}
							isSelected={
								selectedSource.type === "feed" && selectedSource.feedId === feed.id
							}
						/>
					))}
				</div>
			)}

			{contextMenu && (
				<ContextMenu
					items={menuItems}
					x={contextMenu.x}
					y={contextMenu.y}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</div>
	);
}
