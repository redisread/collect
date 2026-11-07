import { useRef, useState, useCallback, useEffect, type CSSProperties } from "react";
import { useUiStore } from "@/lib/store/uiStore";
import { useArticleStore } from "@/lib/store/articleStore";
import { useFeedStore } from "@/lib/store/feedStore";
import { Sidebar } from "./Sidebar";
import { ArticleList } from "./ArticleList";
import { ArticleDetail } from "./ArticleDetail";
import { cn } from "@/lib/utils/cn";

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 320;
const MIN_LIST_WIDTH = 280;
const MAX_LIST_WIDTH = 480;

export function ThreeColumnLayout() {
	const { sidebarWidth, articleListWidth, isSidebarCollapsed, setSidebarWidth, setArticleListWidth } =
		useUiStore();

	const selectedArticleId = useArticleStore(state => state.selectedArticleId);
	const selectedSource = useFeedStore(state => state.selectedSource);
	const [showSources, setShowSources] = useState(false);
	useEffect(() => { setShowSources(false); }, [selectedSource]);
	const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
	const [isDraggingList, setIsDraggingList] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// 拖拽侧边栏分隔线
	const handleSidebarDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsDraggingSidebar(true);
			const startX = e.clientX;
			const startWidth = sidebarWidth;

			const handleMouseMove = (e: MouseEvent) => {
				const newWidth = Math.max(
					MIN_SIDEBAR_WIDTH,
					Math.min(MAX_SIDEBAR_WIDTH, startWidth + e.clientX - startX)
				);
				setSidebarWidth(newWidth);
			};

			const handleMouseUp = () => {
				setIsDraggingSidebar(false);
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[sidebarWidth, setSidebarWidth]
	);

	// 拖拽文章列表分隔线
	const handleListDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsDraggingList(true);
			const startX = e.clientX;
			const startWidth = articleListWidth;

			const handleMouseMove = (e: MouseEvent) => {
				const newWidth = Math.max(
					MIN_LIST_WIDTH,
					Math.min(MAX_LIST_WIDTH, startWidth + e.clientX - startX)
				);
				setArticleListWidth(newWidth);
			};

			const handleMouseUp = () => {
				setIsDraggingList(false);
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[articleListWidth, setArticleListWidth]
	);

	return (
		<div
			ref={containerRef}
			className={cn(
				"flex h-dvh w-full flex-col lg:flex-row overflow-hidden bg-[var(--bg-main)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
				(isDraggingSidebar || isDraggingList) && "select-none cursor-col-resize"
			)}
		>
			<div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-light)] px-3 py-2 lg:hidden">
				<img src="/collect.svg" width="24" height="24" alt="" />
				<span className="mr-auto text-sm font-semibold">Collect</span>
				<button className="min-h-10 rounded-lg px-3 text-sm" aria-expanded={showSources} onClick={() => setShowSources(!showSources)}>订阅源</button>
				{selectedArticleId && <button className="min-h-10 rounded-lg px-3 text-sm" onClick={() => { setShowSources(false); void useArticleStore.getState().selectArticle(null); }}>返回列表</button>}
			</div>
			{/* 侧边栏 */}
			{(!isSidebarCollapsed || showSources) && (
				<div
					className={cn("min-h-0 w-full shrink-0 overflow-hidden lg:w-[var(--panel-width)]", showSources ? "flex-1 lg:flex-none" : "hidden lg:block")}
					style={{ "--panel-width": sidebarWidth + "px" } as CSSProperties}
				>
					<Sidebar />
				</div>
			)}

			{/* 侧边栏拖拽分隔线 */}
			{!isSidebarCollapsed && (
				<div
					className={cn(
						"hidden lg:block w-1 shrink-0 cursor-col-resize hover:bg-[var(--accent)] transition-colors",
						isDraggingSidebar && "bg-[var(--accent)]"
					)}
					onMouseDown={handleSidebarDragStart}
				/>
			)}

			{/* 文章列表 */}
			<div
				className={cn("min-h-0 w-full shrink-0 overflow-hidden lg:w-[var(--panel-width)]", !selectedArticleId && !showSources ? "flex-1 lg:flex-none" : "hidden lg:block")}
				style={{ "--panel-width": articleListWidth + "px" } as CSSProperties}
			>
				<ArticleList />
			</div>

			{/* 文章列表拖拽分隔线 */}
			<div
				className={cn(
					"hidden lg:block w-1 shrink-0 cursor-col-resize hover:bg-[var(--accent)] transition-colors",
					isDraggingList && "bg-[var(--accent)]"
				)}
				onMouseDown={handleListDragStart}
			/>

			{/* 文章详情（自适应剩余宽度） */}
			<div className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", (!selectedArticleId || showSources) && "hidden lg:block")}>
				<ArticleDetail />
			</div>
		</div>
	);
}
