import { useRef, useState, useCallback, useEffect, type CSSProperties } from "react";
import { useUiStore } from "@/lib/store/uiStore";
import { useArticleStore } from "@/lib/store/articleStore";
import { useFeedStore } from "@/lib/store/feedStore";
import { Sidebar } from "./Sidebar";
import { ArticleList } from "./ArticleList";
import { ArticleDetail } from "./ArticleDetail";
import { cn } from "@/lib/utils/cn";
import { navigateWithinReader } from "@/lib/navigation";

import { fitPanelWidths, MIN_READER_WIDTH, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_LIST_WIDTH, MAX_LIST_WIDTH } from "@/lib/utils/panel-widths";

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
	const [containerWidth, setContainerWidth] = useState(1024);
	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const widths = fitPanelWidths(containerWidth, sidebarWidth, articleListWidth, isSidebarCollapsed);
	const sidebarLimit = Math.min(MAX_SIDEBAR_WIDTH, containerWidth - widths.list - MIN_READER_WIDTH - 8);
	const listLimit = Math.min(MAX_LIST_WIDTH, containerWidth - widths.sidebar - MIN_READER_WIDTH - (isSidebarCollapsed ? 4 : 8));


	// 拖拽侧边栏分隔线
	const handleSidebarDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsDraggingSidebar(true);
			const startX = e.clientX;
			const startWidth = widths.sidebar;

			const handleMouseMove = (e: MouseEvent) => {
				const newWidth = Math.max(
					MIN_SIDEBAR_WIDTH,
					Math.min(sidebarLimit, startWidth + e.clientX - startX)
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
		[widths.sidebar, sidebarLimit, setSidebarWidth]
	);

	// 拖拽文章列表分隔线
	const handleListDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsDraggingList(true);
			const startX = e.clientX;
			const startWidth = widths.list;

			const handleMouseMove = (e: MouseEvent) => {
				const newWidth = Math.max(
					MIN_LIST_WIDTH,
					Math.min(listLimit, startWidth + e.clientX - startX)
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
		[widths.list, listLimit, setArticleListWidth]
	);

	return (
		<div
			ref={containerRef}
			className={cn(
				"flex h-dvh w-full flex-col lg:flex-row overflow-hidden bg-[var(--bg-main)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
				(isDraggingSidebar || isDraggingList) && "select-none cursor-col-resize"
			)}
		>
			<header className="relative z-20 flex shrink-0 items-center gap-2 border-b border-[var(--border-light)] bg-[var(--bg-main)] px-3 py-2 lg:hidden">
				{selectedArticleId ? <>
					<button className="min-h-11 shrink-0 rounded-lg px-2 text-sm" onClick={() => { setShowSources(false); void useArticleStore.getState().selectArticle(null); }}>返回列表</button>
					<span className="min-w-0 flex-1 truncate text-center text-sm font-semibold">Collect</span>
					<details className="relative shrink-0">
						<summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 text-sm">更多</summary>
						<div className="absolute end-0 top-full mt-1 w-40 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-1 shadow-[var(--shadow-md)]">
							<button className="min-h-11 w-full rounded-lg px-3 text-start text-sm hover:bg-[var(--bg-card-hover)]" aria-expanded={showSources} onClick={event => { setShowSources(!showSources); event.currentTarget.closest("details")?.removeAttribute("open"); }}>订阅源</button>
							<a href="/settings" onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); navigateWithinReader(event); }} className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-[var(--bg-card-hover)]">个人设置</a>
						</div>
					</details>
				</> : <>
					<img src="/collect-logo.png" width="24" height="24" alt="" />
					<span className="me-auto text-sm font-semibold">Collect</span>
					<button className="min-h-11 rounded-lg px-2 text-sm" aria-expanded={showSources} onClick={() => setShowSources(!showSources)}>订阅源</button>
					<a href="/settings" onClick={navigateWithinReader} className="flex min-h-11 items-center rounded-lg px-2 text-sm hover:bg-[var(--bg-card-hover)]">个人设置</a>
				</>}
			</header>
			{/* 侧边栏 */}
			{(!isSidebarCollapsed || showSources) && (
				<div
					className={cn("min-h-0 w-full shrink-0 overflow-hidden lg:w-[var(--panel-width)]", showSources ? "flex-1 lg:flex-none" : "hidden lg:block")}
					style={{ "--panel-width": widths.sidebar + "px" } as CSSProperties}
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
				style={{ "--panel-width": widths.list + "px" } as CSSProperties}
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
