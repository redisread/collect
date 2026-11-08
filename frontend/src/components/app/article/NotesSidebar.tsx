import { useEffect, useState } from "react";
import { useArticleStore } from "@/lib/store/articleStore";
import type { Annotation } from "@/lib/types";
import { Modal } from "../common/Modal";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/date";

interface NotesSidebarProps {
	articleId: string;
	isOpen: boolean;
	onClose: () => void;
	onNavigateToHighlight: (position: string) => void;
}

const HIGHLIGHT_COLORS: Record<string, string> = {
	yellow: "bg-amber-200 border-amber-300",
	green: "bg-emerald-200 border-emerald-300",
	blue: "bg-sky-200 border-sky-300",
	pink: "bg-rose-200 border-rose-300",
};

export function NotesSidebar({ articleId, isOpen, onClose, onNavigateToHighlight }: NotesSidebarProps) {
	const { annotations, loadAnnotations, deleteAnnotation, updateAnnotation } = useArticleStore();
	const [editingNote, setEditingNote] = useState<string | null>(null);
	const [editText, setEditText] = useState("");

	// 加载笔记
	useEffect(() => {
		if (isOpen && articleId) {
			loadAnnotations(articleId);
		}
	}, [isOpen, articleId, loadAnnotations]);

	// 过滤当前文章的笔记
	const articleAnnotations = annotations.filter((a) => a.articleId === articleId);
	const highlights = articleAnnotations.filter((a) => a.type === "highlight");
	const notes = articleAnnotations.filter((a) => a.type === "note");

	const handleEditNote = (annotation: Annotation) => {
		setEditingNote(annotation.id);
		setEditText(annotation.note || "");
	};

	const handleSaveEdit = (annotationId: string) => {
		if (editText.trim()) {
			updateAnnotation(annotationId, { note: editText.trim() });
		}
		setEditingNote(null);
		setEditText("");
	};

	if (!isOpen) return null;

	return (
		<Modal title="文章笔记" onClose={onClose} drawer>
			{/* 内容区域 */}
			<div className="p-4 space-y-6">
				{articleAnnotations.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<div className="w-12 h-12 rounded-full bg-[var(--bg-card-hover)] flex items-center justify-center mb-3">
							<svg
								className="w-6 h-6 text-[var(--text-tertiary)]"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={1.5}
							>
								<path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
							</svg>
						</div>
						<p className="text-sm text-[var(--text-secondary)]">暂无笔记</p>
						<p className="text-xs text-[var(--text-tertiary)] mt-1">
							选中文章内容即可添加高亮和笔记
						</p>
					</div>
				) : (
					<>
						{/* 高亮列表 */}
						{highlights.length > 0 && (
							<div>
								<h3 className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
									高亮 ({highlights.length})
								</h3>
								<div className="space-y-2">
									{highlights.map((highlight) => (
										<div
											key={highlight.id}
											className={cn(
												"group p-3 rounded-lg cursor-pointer",
												"border border-transparent hover:border-[var(--border)]",
												"hover:bg-[var(--bg-card-hover)] transition-colors duration-150",
												HIGHLIGHT_COLORS[highlight.color || "yellow"]
											)}
											onClick={() => onNavigateToHighlight(highlight.textRange.start)}
										>
											<p className="text-sm text-[var(--text-primary)] line-clamp-2">
												{highlight.textRange.text}
											</p>
											{highlight.note && (
												<p className="text-xs text-[var(--text-secondary)] mt-2 line-clamp-2">
													{highlight.note}
												</p>
											)}
											<div className="flex items-center justify-between mt-2 opacity-100">
												<span className="text-[10px] text-[var(--text-tertiary)]">
													{formatRelativeTime(highlight.createdAt)}
												</span>
												<button
													onClick={(e) => {
														e.stopPropagation();
														deleteAnnotation(highlight.id);
													}}
													className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
													title="删除"
												>
													<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
														<path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.562 3.034a2.415 2.415 0 0113.535 0M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
													</svg>
												</button>
											</div>
										</div>
									))}
								</div>
							</div>
						)}

						{/* 笔记列表 */}
						{notes.length > 0 && (
							<div>
								<h3 className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
									笔记 ({notes.length})
								</h3>
								<div className="space-y-2">
									{notes.map((note) => (
										<div
											key={note.id}
											className={cn(
												"group p-3 rounded-lg",
												"bg-[var(--bg-main)] border border-[var(--border-light)]",
												"hover:border-[var(--border)] transition-colors duration-150"
											)}
										>
											{editingNote === note.id ? (
												<div className="space-y-2">
													<textarea
														value={editText}
														onChange={(e) => setEditText(e.target.value)}
														className={cn(
															"w-full px-2 py-1.5 rounded text-sm resize-none",
															"bg-[var(--bg-card)] border border-[var(--border-light)]",
															"text-[var(--text-primary)] focus:border-[var(--accent)]",
															"focus:outline-none"
														)}
														rows={3}
													/>
													<div className="flex items-center justify-end gap-2">
														<button
															onClick={() => {
																setEditingNote(null);
																setEditText("");
															}}
															className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
														>
															取消
														</button>
														<button
															onClick={() => handleSaveEdit(note.id)}
															className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
														>
															保存
														</button>
													</div>
												</div>
											) : (
												<>
													{note.textRange.text && (
														<p className="text-xs text-[var(--text-tertiary)] line-clamp-1 mb-2">
															引用: "{note.textRange.text}"
														</p>
													)}
													<p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
														{note.note}
													</p>
													<div className="flex items-center justify-between mt-2 opacity-100">
														<span className="text-[10px] text-[var(--text-tertiary)]">
															{formatRelativeTime(note.createdAt)}
														</span>
														<div className="flex items-center gap-1">
															<button
																onClick={() => handleEditNote(note)}
																className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
																title="编辑"
															>
																<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
																	<path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
																</svg>
															</button>
															<button
																onClick={() => deleteAnnotation(note.id)}
																className="p-1 text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
																title="删除"
															>
																<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
																	<path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.562 3.034a2.415 2.415 0 0113.535 0M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
																</svg>
															</button>
														</div>
													</div>
												</>
											)}
										</div>
									))}
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</Modal>
	);
}
