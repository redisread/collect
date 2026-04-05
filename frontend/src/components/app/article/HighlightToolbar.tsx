import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";

interface HighlightToolbarProps {
	isVisible: boolean;
	position: { top: number; left: number };
	onHighlight: (color: string) => void;
	onAddNote: () => void;
	onClose: () => void;
}

const HIGHLIGHT_COLORS = [
	{ id: "yellow", label: "黄色", bg: "bg-amber-200", border: "border-amber-300", text: "text-amber-900" },
	{ id: "green", label: "绿色", bg: "bg-emerald-200", border: "border-emerald-300", text: "text-emerald-900" },
	{ id: "blue", label: "蓝色", bg: "bg-sky-200", border: "border-sky-300", text: "text-sky-900" },
	{ id: "pink", label: "粉色", bg: "bg-rose-200", border: "border-rose-300", text: "text-rose-900" },
];

export function HighlightToolbar({
	isVisible,
	position,
	onHighlight,
	onAddNote,
	onClose,
}: HighlightToolbarProps) {
	const toolbarRef = useRef<HTMLDivElement>(null);
	const [adjustedPosition, setAdjustedPosition] = useState(position);

	// 调整位置避免超出屏幕
	useEffect(() => {
		if (!isVisible || !toolbarRef.current) return;

		const toolbar = toolbarRef.current;
		const rect = toolbar.getBoundingClientRect();

		let newLeft = position.left;
		let newTop = position.top;

		// 避免右边界超出
		if (newLeft + rect.width > window.innerWidth) {
			newLeft = window.innerWidth - rect.width - 16;
		}

		// 避免左边界超出
		if (newLeft < 16) {
			newLeft = 16;
		}

		// 避免下边界超出
		if (newTop + rect.height > window.innerHeight) {
			newTop = position.top - rect.height - 10;
		}

		setAdjustedPosition({ top: newTop, left: newLeft });
	}, [isVisible, position]);

	// 点击外部关闭
	useEffect(() => {
		if (!isVisible) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isVisible, onClose]);

	if (!isVisible) return null;

	return (
		<div
			ref={toolbarRef}
			className={cn(
				"fixed z-50 flex items-center gap-1 p-2 rounded-lg shadow-lg",
				"bg-[var(--bg-card)] border border-[var(--border)]",
				"animate-in fade-in zoom-in-95 duration-150"
			)}
			style={{
				top: adjustedPosition.top,
				left: adjustedPosition.left,
			}}
		>
			{/* 颜色选择 */}
			<div className="flex items-center gap-1">
				{HIGHLIGHT_COLORS.map((color) => (
					<button
						key={color.id}
						onClick={() => onHighlight(color.id)}
						title={color.label}
						className={cn(
							"w-6 h-6 rounded-full border-2 transition-all duration-150",
							color.bg,
							color.border,
							"hover:scale-110 hover:shadow-md",
							"focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1"
						)}
					/>
				))}
			</div>

			{/* 分隔线 */}
			<div className="w-px h-5 bg-[var(--border-light)] mx-1" />

			{/* 添加笔记按钮 */}
			<button
				onClick={onAddNote}
				title="添加笔记"
				className={cn(
					"flex items-center gap-1 px-2 py-1 rounded-md text-xs",
					"text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]",
					"transition-colors"
				)}
			>
				<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
					<path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
				</svg>
				笔记
			</button>
		</div>
	);
}

// 笔记输入弹窗
interface NoteInputDialogProps {
	isOpen: boolean;
	initialText?: string;
	onSave: (text: string) => void;
	onClose: () => void;
}

export function NoteInputDialog({ isOpen, initialText = "", onSave, onClose }: NoteInputDialogProps) {
	const [text, setText] = useState(initialText);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (isOpen) {
			setText(initialText);
			textareaRef.current?.focus();
		}
	}, [isOpen, initialText]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				handleSave();
			}
		};

		if (isOpen) {
			document.addEventListener("keydown", handleKeyDown);
			return () => document.removeEventListener("keydown", handleKeyDown);
		}
	}, [isOpen, onClose, text]);

	const handleSave = () => {
		if (text.trim()) {
			onSave(text.trim());
		}
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div
				className={cn(
					"w-full max-w-md p-6 rounded-xl shadow-2xl",
					"bg-[var(--bg-card)] border border-[var(--border)]"
				)}
			>
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-base font-semibold text-[var(--text-primary)]">添加笔记</h3>
					<button
						onClick={onClose}
						className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
					>
						<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<textarea
					ref={textareaRef}
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="输入你的笔记..."
					rows={4}
					className={cn(
						"w-full px-3 py-2 rounded-lg text-sm resize-none",
						"bg-[var(--bg-main)] border border-[var(--border-light)]",
						"text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
						"focus:outline-none focus:border-[var(--accent)]",
						"transition-colors"
					)}
				/>

				<div className="flex items-center justify-end gap-2 mt-4">
					<button
						onClick={onClose}
						className={cn(
							"px-4 py-2 rounded-lg text-sm",
							"text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]",
							"transition-colors"
						)}
					>
						取消
					</button>
					<button
						onClick={handleSave}
						disabled={!text.trim()}
						className={cn(
							"px-4 py-2 rounded-lg text-sm font-medium",
							"bg-[var(--accent)] text-white",
							"hover:bg-[var(--accent-hover)]",
							"disabled:opacity-50 disabled:cursor-not-allowed",
							"transition-colors"
						)}
					>
						保存
					</button>
				</div>

				<p className="mt-3 text-xs text-[var(--text-tertiary)] text-center">
					按 Cmd/Ctrl + Enter 快速保存，按 Esc 取消
				</p>
			</div>
		</div>
	);
}
