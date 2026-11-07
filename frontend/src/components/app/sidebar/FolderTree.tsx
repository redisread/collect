import { useFeedStore } from "@/lib/store/feedStore";
import { FolderItem } from "./FolderItem";
import { FeedItem } from "./FeedItem";
import { FeedDropZone } from "./FeedDropZone";

export function FolderTree() {
	const { folders, feeds, selectedSource, moveStatus } = useFeedStore();

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
			<p className="px-3 pt-3 pb-1 text-xs text-[var(--text-secondary)]">未分类</p>
			{rootFeeds.map((feed) => (
				<FeedItem
					key={feed.id}
					feed={feed}
					isSelected={selectedSource.type === "feed" && selectedSource.feedId === feed.id}
				/>
			))}
			{rootFeeds.length === 0 && <p className="px-3 py-3 text-xs text-[var(--text-tertiary)]">拖动订阅源到这里</p>}
			</FeedDropZone>
		</div>
	);
}
