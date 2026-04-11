import { useEffect, useRef, useState, useCallback } from "react";
import { useArticleStore } from "@/lib/store/articleStore";
import { useFeedStore } from "@/lib/store/feedStore";
import type { TextRange } from "@/lib/types";
import { ArticleToolbar } from "./ArticleToolbar";
import { ArticleDetailSkeleton } from "./ArticleSkeleton";
import { formatFullDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { VimShortcuts } from "@/components/app/common/VimShortcuts";
import { ReadingProgress } from "./ReadingProgress";
import { HighlightToolbar, NoteInputDialog } from "./HighlightToolbar";
import { NotesSidebar } from "./NotesSidebar";

type ViewMode = "original" | "translated" | "both";

// 生成 XPath
function getXPath(element: Node): string {
	if (element.nodeType === Node.TEXT_NODE && element.parentElement) {
		return getXPath(element.parentElement);
	}
	if (!(element instanceof Element)) return "";

	if (element.id) return `//*[@id="${element.id}"]`;

	const parts: string[] = [];
	let current: Element | null = element;

	while (current && current.nodeType === Node.ELEMENT_NODE) {
		let index = 1;
		let sibling: Element | null = current.previousElementSibling;

		while (sibling) {
			if (sibling.nodeName === current.nodeName) index++;
			sibling = sibling.previousElementSibling;
		}

		const tagName = current.nodeName.toLowerCase();
		parts.unshift(`${tagName}[${index}]`);
		current = current.parentElement;
	}

	return "/" + parts.join("/");
}

// 根据 XPath 查找元素
function getElementByXPath(xpath: string, context: Node): Node | null {
	try {
		const result = document.evaluate(
			xpath,
			context,
			null,
			XPathResult.FIRST_ORDERED_NODE_TYPE,
			null
		);
		return result.singleNodeValue;
	} catch {
		return null;
	}
}

export function ArticleReader() {
	const {
		selectedArticle,
		isLoadingDetail,
		translations,
		clearTranslation,
		extractArticle,
		isExtracting,
		annotations,
		createAnnotation,
		loadAnnotations,
	} = useArticleStore();
	const { feeds } = useFeedStore();
	const contentRef = useRef<HTMLDivElement>(null);
	const articleContentRef = useRef<HTMLDivElement>(null);
	const [viewMode, setViewMode] = useState<ViewMode>("original");

	// 标注相关状态
	const [highlightToolbar, setHighlightToolbar] = useState<{
		visible: boolean;
		position: { top: number; left: number };
		selectedRange: Range | null;
	}>({
		visible: false,
		position: { top: 0, left: 0 },
		selectedRange: null,
	});
	const [noteDialogOpen, setNoteDialogOpen] = useState(false);
	const [notesSidebarOpen, setNotesSidebarOpen] = useState(false);

	// 切换文章时重置视图模式
	useEffect(() => {
		setViewMode("original");
		setHighlightToolbar({ visible: false, position: { top: 0, left: 0 }, selectedRange: null });
		setNotesSidebarOpen(false);
	}, [selectedArticle?.id]);

	// 切换文章时滚动到顶部
	useEffect(() => {
		if (contentRef.current) {
			contentRef.current.scrollTop = 0;
		}
	}, [selectedArticle?.id]);

	// 加载标注
	useEffect(() => {
		if (selectedArticle?.id) {
			loadAnnotations(selectedArticle.id);
		}
	}, [selectedArticle?.id, loadAnnotations]);

	// 渲染已有标注
	useEffect(() => {
		if (!articleContentRef.current || !selectedArticle?.content) return;

		const articleAnnotations = annotations.filter(
			(a) => a.articleId === selectedArticle.id && a.type === "highlight"
		);

		// 清理旧的高亮
		const oldHighlights = articleContentRef.current.querySelectorAll("[data-annotation-id]");
		oldHighlights.forEach((el) => {
			const parent = el.parentNode;
			if (parent) {
				parent.replaceChild(document.createTextNode(el.textContent || ""), el);
				parent.normalize();
			}
		});

		// 渲染新的高亮
		articleAnnotations.forEach((annotation) => {
			if (!articleContentRef.current) return;

			try {
				const startEl = getElementByXPath(
					annotation.textRange.start,
					articleContentRef.current
				) as Text;
				if (!startEl) return;

				// 创建高亮 span
				const highlightSpan = document.createElement("span");
				highlightSpan.className = `annotation-highlight annotation-highlight-${annotation.color || "yellow"}`;
				highlightSpan.dataset.annotationId = annotation.id;

				// 尝试找到并高亮文本
				const textContent = startEl.textContent || "";
				const index = textContent.indexOf(annotation.textRange.text);

				if (index >= 0) {
					const range = document.createRange();
					range.setStart(startEl, index);
					range.setEnd(startEl, index + annotation.textRange.text.length);

					try {
						range.surroundContents(highlightSpan);
					} catch {
						// 跨元素高亮复杂，这里简化处理
					}
				}
			} catch (error) {
				console.error("Failed to render highlight:", error);
			}
		});
	}, [annotations, selectedArticle?.id]);

	// 处理文本选择
	const handleTextSelection = useCallback(() => {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) {
			setHighlightToolbar((prev) => ({ ...prev, visible: false }));
			return;
		}

		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();

		// 检查选择是否在文章内容内
		if (!articleContentRef.current?.contains(range.commonAncestorContainer)) {
			return;
		}

		setHighlightToolbar({
			visible: true,
			position: {
				top: rect.top - 50,
				left: rect.left + rect.width / 2,
			},
			selectedRange: range,
		});
	}, []);

	// 创建高亮
	const handleHighlight = useCallback(
		(color: string) => {
			const { selectedRange } = highlightToolbar;
			if (!selectedRange || !selectedArticle) return;

			const selectedText = selectedRange.toString().trim();
			if (!selectedText) return;

			// 获取文本范围信息
			const textRange: TextRange = {
				text: selectedText,
				start: getXPath(selectedRange.startContainer),
				end: getXPath(selectedRange.endContainer),
			};

			// 保存到后端
			createAnnotation({
				articleId: selectedArticle.id,
				type: "highlight",
				textRange,
				color,
			});

			// 清除选择
			window.getSelection()?.removeAllRanges();
			setHighlightToolbar({ visible: false, position: { top: 0, left: 0 }, selectedRange: null });
		},
		[highlightToolbar, selectedArticle, createAnnotation]
	);

	// 添加笔记
	const handleAddNote = useCallback(() => {
		setNoteDialogOpen(true);
	}, []);

	// 保存笔记
	const handleSaveNote = useCallback(
		(noteText: string) => {
			const { selectedRange } = highlightToolbar;
			if (!selectedRange || !selectedArticle) return;

			const selectedText = selectedRange.toString().trim();

			const textRange: TextRange = {
				text: selectedText,
				start: getXPath(selectedRange.startContainer),
				end: getXPath(selectedRange.endContainer),
			};

			createAnnotation({
				articleId: selectedArticle.id,
				type: "note",
				textRange,
				note: noteText,
			});

			window.getSelection()?.removeAllRanges();
			setHighlightToolbar({ visible: false, position: { top: 0, left: 0 }, selectedRange: null });
		},
		[highlightToolbar, selectedArticle, createAnnotation]
	);

	// 监听视图模式切换事件（来自 VimShortcuts）
	useEffect(() => {
		const handleToggleViewMode = () => {
			if (translations[selectedArticle?.id || ""]) {
				setViewMode((prev) => {
					if (prev === "original") return "translated";
					if (prev === "translated") return "both";
					return "original";
				});
			}
		};

		window.addEventListener("toggle-view-mode", handleToggleViewMode);
		return () => window.removeEventListener("toggle-view-mode", handleToggleViewMode);
	}, [selectedArticle?.id, translations]);

	const translation = selectedArticle ? translations[selectedArticle.id] : null;
	const hasTranslation = !!translation;
	const hasContent = !!selectedArticle?.content;

	if (isLoadingDetail) {
		return <ArticleDetailSkeleton />;
	}

	if (!selectedArticle) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center space-y-2">
					<p className="text-4xl opacity-20">📖</p>
					<p className="text-sm text-[var(--text-tertiary)]">选择一篇文章开始阅读</p>
					<p className="text-xs text-[var(--text-tertiary)]">
						按 <kbd className="px-1 py-0.5 rounded bg-[var(--bg-card-hover)] font-mono">J/K</kbd> 键在文章间导航，
						按 <kbd className="px-1 py-0.5 rounded bg-[var(--bg-card-hover)] font-mono">?</kbd> 查看帮助
					</p>
				</div>
			</div>
		);
	}

	const feed = feeds.find((f) => f.id === selectedArticle.feedId);

	return (
		<>
			<VimShortcuts contentRef={contentRef} />

			<div className="flex flex-col h-full">
				{/* 阅读进度条 */}
				{hasContent && <ReadingProgress contentRef={contentRef} articleId={selectedArticle.id} />}

				{/* 工具栏 */}
				<ArticleToolbar article={selectedArticle} onOpenNotes={() => setNotesSidebarOpen(true)} />

				{/* 正文区域 */}
				<div ref={contentRef} className="flex-1 overflow-y-auto relative">
					<article className="max-w-[680px] mx-auto px-6 py-8 animate-fade-in">
						{/* 来源信息 */}
						<div className="flex items-center gap-2 mb-4">
							{feed?.faviconUrl && (
								<img
									src={feed.faviconUrl}
									alt=""
									className="w-4 h-4 rounded-sm"
									onError={(e) => {
										(e.target as HTMLImageElement).style.display = "none";
									}}
								/>
								)}
							<span className="text-xs text-[var(--text-secondary)]">{feed?.title ?? "未知来源"}</span>
							{selectedArticle.author && (
								<>
									<span className="text-[var(--text-tertiary)]">·</span>
									<span className="text-xs text-[var(--text-secondary)]">{selectedArticle.author}</span>
								</>
								)}
							</div>

							{/* 标题 */}
							<h1 className="text-2xl font-semibold leading-tight text-[var(--text-primary)] mb-3">
								{selectedArticle.title}
							</h1>

							{/* 发布时间 */}
							{selectedArticle.publishedAt && (
								<p className="text-xs text-[var(--text-tertiary)] mb-6">
									{formatFullDate(selectedArticle.publishedAt)}
								</p>
							)}

							{/* 封面图 */}
							{selectedArticle.imageUrl && (
								<img
									src={selectedArticle.imageUrl}
									alt={selectedArticle.title}
									className="w-full rounded-xl object-cover mb-6 max-h-80"
									onError={(e) => {
										(e.target as HTMLImageElement).style.display = "none";
									}}
								/>
							)}

							{/* 视图模式切换（当有翻译时显示） */}
							{hasTranslation && (
								<div className="flex items-center gap-2 mb-4 pb-4 border-b border-[var(--border-light)]">
									<span className="text-xs text-[var(--text-tertiary)]">显示:</span>
									<button
										onClick={() => setViewMode("original")}
										className={cn(
											"px-2 py-1 rounded text-xs transition-colors",
											viewMode === "original"
												? "bg-[var(--accent)] text-white"
												: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
										)}
									>
										原文
									</button>
									<button
										onClick={() => setViewMode("both")}
										className={cn(
											"px-2 py-1 rounded text-xs transition-colors",
											viewMode === "both"
												? "bg-[var(--accent)] text-white"
												: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
										)}
									>
										双语
									</button>
									<button
										onClick={() => setViewMode("translated")}
										className={cn(
											"px-2 py-1 rounded text-xs transition-colors",
											viewMode === "translated"
												? "bg-[var(--accent)] text-white"
												: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
										)}
									>
										译文
									</button>
									<button
										onClick={() => clearTranslation(selectedArticle.id)}
										className="ml-auto text-xs text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
									>
										清除翻译
									</button>
								</div>
							)}

							{/* 文章正文 */}
							<div onMouseUp={handleTextSelection}>
								{(viewMode === "original" || viewMode === "both") && (
									<>
										{hasContent ? (
											<div
												ref={articleContentRef}
												className="article-content"
												dangerouslySetInnerHTML={{ __html: selectedArticle.content || "" }}
											/>
										) : (
											<div className="space-y-6">
												{selectedArticle.summary && (
													<div className="p-4 bg-[var(--bg-card)] rounded-lg">
														<p className="text-sm text-[var(--text-secondary)] leading-relaxed">
															{selectedArticle.summary}
														</p>
													</div>
												)}

												{/* 提取全文按钮 */}
												<div className="flex flex-col items-center gap-4 py-8">
													<p className="text-sm text-[var(--text-tertiary)]">
														该文章暂无全文内容，点击下方按钮提取
													</p>
													<button
														onClick={() => extractArticle(selectedArticle.id)}
														disabled={isExtracting}
														className={cn(
															"inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium",
															"bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]",
															"transition-all duration-[var(--transition-base)]",
															"disabled:opacity-50 disabled:cursor-not-allowed",
															isExtracting && "cursor-wait"
														)}
													>
														{isExtracting ? (
															<>
																<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
																	<path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
																</svg>
																提取中...
															</>
														) : (
															<>
																<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
																	<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
																</svg>
																提取全文
															</>
														)}
													</button>
												</div>
											</div>
										)}
									</>
								)}

								{/* 翻译内容 */}
								{hasTranslation && (viewMode === "translated" || viewMode === "both") && (
									<div
										className={cn(
											"mt-6",
											viewMode === "both" && "pt-6 border-t border-[var(--border-light)]"
										)}
									>
										{viewMode === "both" && (
											<h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
												中文翻译
											</h3>
										)}
										<div className="prose prose-sm max-w-none text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
											{translation.translated}
										</div>
									</div>
								)}
							</div>

							{/* 原文链接按钮（仅在有正文内容时显示） */}
							{hasContent && (
								<div className="mt-8 pt-6 border-t border-[var(--border-light)]">
									<a
										href={selectedArticle.url}
										target="_blank"
										rel="noopener noreferrer"
										className={cn(
											"inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
											"bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]",
											"transition-colors"
										)}
									>
										在浏览器中打开原文
										<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
											<path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
										</svg>
									</a>
								</div>
							)}
						</article>
					</div>
				</div>

				{/* 高亮工具栏 */}
				<HighlightToolbar
					isVisible={highlightToolbar.visible}
					position={highlightToolbar.position}
					onHighlight={handleHighlight}
					onAddNote={handleAddNote}
					onClose={() => setHighlightToolbar((prev) => ({ ...prev, visible: false }))}
				/>

				{/* 笔记输入弹窗 */}
				<NoteInputDialog
					isOpen={noteDialogOpen}
					onSave={handleSaveNote}
					onClose={() => setNoteDialogOpen(false)}
				/>

				{/* 笔记侧边栏 */}
				<NotesSidebar
					articleId={selectedArticle.id}
					isOpen={notesSidebarOpen}
					onClose={() => setNotesSidebarOpen(false)}
					onNavigateToHighlight={(position) => {
						// 导航到高亮位置
						if (contentRef.current) {
							const element = getElementByXPath(position, contentRef.current);
							if (element && element instanceof HTMLElement) {
								element.scrollIntoView({ behavior: "smooth", block: "center" });
								// 添加临时高亮效果
								element.style.backgroundColor = "var(--accent-light)";
								setTimeout(() => {
									element.style.backgroundColor = "";
								}, 1500);
							}
						}
					}}
				/>

				{/* CSS 样式 */}
				<style>{`
					.annotation-highlight {
						border-radius: 2px;
						padding: 1px 2px;
						cursor: pointer;
						transition: opacity 0.15s;
					}
					.annotation-highlight:hover {
						opacity: 0.8;
					}
					.annotation-highlight-yellow {
						background-color: rgb(253 230 138);
					}
					.annotation-highlight-green {
						background-color: rgb(167 243 208);
					}
					.annotation-highlight-blue {
						background-color: rgb(186 230 253);
					}
					.annotation-highlight-pink {
						background-color: rgb(254 205 211);
					}
					.dark .annotation-highlight-yellow {
						background-color: rgba(251, 191, 36, 0.3);
					}
					.dark .annotation-highlight-green {
						background-color: rgba(52, 211, 153, 0.3);
					}
					.dark .annotation-highlight-blue {
						background-color: rgba(96, 165, 250, 0.3);
					}
					.dark .annotation-highlight-pink {
						background-color: rgba(251, 113, 133, 0.3);
					}
				`}</style>
			</>
		);
	}
