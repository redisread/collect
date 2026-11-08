import { useFeedStore } from "@/lib/store/feedStore";
import { FolderItem } from "./FolderItem";
import { FeedItem } from "./FeedItem";
import { FeedDropZone } from "./FeedDropZone";
import { useState } from "react";
import { useArticleStore } from "@/lib/store/articleStore";

export function FolderTree() {
	const { folders, feeds, selectedSource, moveStatus, setSelectedSource } = useFeedStore();
	const [collapsed, setCollapsed] = useState(false);
	const fetchArticles = useArticleStore(state => state.fetchArticles);

	// 无文件夹的订阅源
	const rootFeeds = feeds.filter((f) => !f.folderId);

	return (
		<div className="space-y-0.5 px-2">
			{moveStatus && <p role="status" className="px-3 py-2 text-xs text-[var(--text-secondary)]">{moveStatus}</p>}
			{/* 文件夹 */}
			{folders.map((folder) => {
				const folderFeeds = feeds.filter((f) => f.folderId === folder.id);
				return <FeedDropZone key={folder.id} folderId={folder.id}><FolderItem folder={folder} feeds={folderFeeds} /></FeedDropZone>;
			})}

			{/* 无文件夹的订阅源 */}
			<FeedDropZone folderId={null}>
			<div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[var(--text-secondary)]">
				<button type="button" aria-label={collapsed ? "展开未分类" : "收起未分类"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)} className="w-6 h-8">{collapsed ? "›" : "⌄"}</button>
				<button type="button" className="flex-1 text-left text-sm" onClick={() => { const source = { type: "uncategorized" as const }; setSelectedSource(source); void fetchArticles(source); }}>未分类</button>
				<span className="text-xs">{rootFeeds.reduce((sum, feed) => sum + (feed.unreadCount ?? 0), 0) || ""}</span>
			</div>
			{!collapsed && rootFeeds.map((feed) => (
				<FeedItem
					key={feed.id}
					feed={feed}
					isSelected={selectedSource.type === "feed" && selectedSource.feedId === feed.id}
				/>
			))}
			{!collapsed && rootFeeds.length === 0 && <p className="px-3 py-3 text-xs text-[var(--text-tertiary)]">拖动订阅源到这里</p>}
			</FeedDropZone>
		</div>
	);
}
