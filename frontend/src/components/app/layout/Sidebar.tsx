import { MoveFeedDialog } from "../sidebar/MoveFeedDialog";
import { useState, useEffect } from "react";
import { useFeedStore } from "@/lib/store/feedStore";
import { useUiStore } from "@/lib/store/uiStore";
import { SearchBox } from "../sidebar/SearchBox";
import { SmartGroups } from "../sidebar/SmartGroups";
import { FolderTree } from "../sidebar/FolderTree";
import { AddFeedDialog } from "../sidebar/AddFeedDialog";
import { ThemeToggle } from "../common/ThemeToggle";
import { UserMenu } from "../sidebar/UserMenu";
import { PwaInstallButton } from "../PwaControls";
import { cn } from "@/lib/utils/cn";

export function Sidebar() {
	const { folders, feeds, addFolder, isLoading, refreshError, refresh, fetchFolders, fetchFeeds } = useFeedStore();
	const { isSidebarCollapsed } = useUiStore();
	const [showAddFeed, setShowAddFeed] = useState(false);
	const [showAddFolder, setShowAddFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	// 初始化加载数据
	useEffect(() => {
		fetchFolders();
		fetchFeeds();
	}, [fetchFolders, fetchFeeds]);

	const handleAddFolder = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newFolderName.trim()) return;
		await addFolder(newFolderName.trim());
		setNewFolderName("");
		setShowAddFolder(false);
	};

	return (
		<div className="flex flex-col h-full bg-[var(--bg-sidebar)] border-r border-[var(--border)]">
			{/* 顶部工具栏 */}
			<div className="flex items-center justify-between px-3 pt-4 pb-2 shrink-0">
				<h1 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] tracking-tight">
					<img src="/collect.svg" width="28" height="28" alt="" />
					Collect
				</h1>
				<div className="flex items-center gap-1">
					{/* 刷新按钮 */}
					<button
						onClick={() => refresh()}
						disabled={isLoading}
						title="刷新所有订阅源"
						className={cn(
							"w-7 h-7 flex items-center justify-center rounded-lg",
							"text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
							"hover:bg-[var(--bg-card-hover)] transition-colors",
							isLoading && "animate-spin"
						)}
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
							<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
						</svg>
					</button>

					{/* 添加订阅源按钮 */}
					<button
						onClick={() => setShowAddFeed(true)}
						title="添加订阅源"
						className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
					</button>
				</div>
			</div>

			{refreshError && (
				<p role="status" className="px-3 pb-2 text-xs text-[var(--text-secondary)]">{refreshError}</p>
			)}

			{/* 搜索框 */}
			<SearchBox />

			{/* 智能分组 */}
			<SmartGroups />

			{/* 分隔线 */}
			<div className="mx-3 my-2 border-t border-[var(--border-light)]" />

			{/* 文件夹 & 订阅源标题 */}
			<div className="flex items-center justify-between px-4 mb-1">
				<span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
					订阅源
				</span>
				<button
					onClick={() => setShowAddFolder(!showAddFolder)}
					title="新建文件夹"
					className="w-5 h-5 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
				>
					<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
					</svg>
				</button>
			</div>

			{/* 新建文件夹输入框 */}
			{showAddFolder && (
				<form onSubmit={handleAddFolder} className="px-3 mb-2">
					<input
						autoFocus
						type="text"
						value={newFolderName}
						onChange={(e) => setNewFolderName(e.target.value)}
						placeholder="文件夹名称"
						onBlur={() => {
							if (!newFolderName.trim()) setShowAddFolder(false);
						}}
						onKeyDown={(e) => {
							if (e.key === "Escape") setShowAddFolder(false);
						}}
						className={cn(
							"w-full px-3 py-1.5 rounded-lg text-sm",
							"bg-[var(--bg-main)] border border-[var(--accent)]",
							"text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
							"outline-none"
						)}
					/>
				</form>
			)}

			{/* 文件夹树（可滚动） */}
			<div className="flex-1 overflow-y-auto pb-2">
				<FolderTree />
			</div>

			{/* 翻译历史入口 */}
			<a
				href="/translations"
				className="mx-3 my-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
			>
				<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l6-6m-6 6h12" />
				</svg>
				翻译历史
			</a>

			{/* 底部工具栏 */}
			<PwaInstallButton />
			<div className="shrink-0 px-3 py-3 border-t border-[var(--border-light)] flex flex-wrap items-center justify-between gap-2">
				<ThemeToggle />
				<span className="text-[11px] text-[var(--text-tertiary)]">
					{feeds.length} 个订阅源
				</span>
			</div>

			{/* 用户信息 + 退出 */}
			<UserMenu />
			<MoveFeedDialog />

			{/* 添加订阅源弹窗 */}
			{showAddFeed && <AddFeedDialog onClose={() => setShowAddFeed(false)} />}
		</div>
	);
}
