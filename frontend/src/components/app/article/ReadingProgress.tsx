import { useEffect, useState, useCallback } from "react";
import { useArticleStore } from "@/lib/store/articleStore";
import { cn } from "@/lib/utils/cn";

interface ReadingProgressProps {
	contentRef: React.RefObject<HTMLDivElement | null>;
	articleId: string;
}

// 节流函数
function throttle(fn: (id: string, progress: number) => void, delay: number) {
	let lastTime = 0;
	return (id: string, progress: number) => {
		const now = Date.now();
		if (now - lastTime >= delay) {
			lastTime = now;
			fn(id, progress);
		}
	};
}

export function ReadingProgress({ contentRef, articleId }: ReadingProgressProps) {
	const [progress, setProgress] = useState(0);
	const [showProgress, setShowProgress] = useState(false);
	const { saveReadingProgress, getReadingProgress } = useArticleStore();

	// 计算阅读进度
	const calculateProgress = useCallback(() => {
		if (!contentRef.current) return 0;

		const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
		if (scrollHeight <= clientHeight) return 100;

		const scrollableHeight = scrollHeight - clientHeight;
		const currentProgress = Math.round((scrollTop / scrollableHeight) * 100);
		return Math.min(Math.max(currentProgress, 0), 100);
	}, [contentRef]);

	// 节流保存进度
	const throttledSaveProgress = useCallback(
		throttle((articleId: string, progress: number) => {
			saveReadingProgress(articleId, progress);
		}, 2000),
		[saveReadingProgress]
	);

	// 监听滚动事件
	useEffect(() => {
		const element = contentRef.current;
		if (!element) return;

		const handleScroll = () => {
			const currentProgress = calculateProgress();
			setProgress(currentProgress);
			setShowProgress(currentProgress > 0);

			// 节流保存到后端
			if (articleId) {
				throttledSaveProgress(articleId, currentProgress);
			}
		};

		element.addEventListener("scroll", handleScroll);
		return () => element.removeEventListener("scroll", handleScroll);
	}, [contentRef, articleId, calculateProgress, throttledSaveProgress]);

	// 恢复上次阅读位置
	useEffect(() => {
		if (!contentRef.current || !articleId) return;

		const restoreProgress = async () => {
			const savedProgress = await getReadingProgress(articleId);
			if (savedProgress && savedProgress > 0 && savedProgress < 100) {
				const element = contentRef.current;
				if (element) {
					const { scrollHeight, clientHeight } = element;
					const scrollableHeight = scrollHeight - clientHeight;
					const targetScrollTop = (savedProgress / 100) * scrollableHeight;
					element.scrollTo({ top: targetScrollTop, behavior: "smooth" });
				}
			}
		};

		restoreProgress();
	}, [articleId, contentRef, getReadingProgress]);

	// 点击进度条跳转到对应位置
	const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		const percentage = (clickX / rect.width) * 100;

		if (contentRef.current) {
			const { scrollHeight, clientHeight } = contentRef.current;
			const scrollableHeight = scrollHeight - clientHeight;
			const targetScrollTop = (percentage / 100) * scrollableHeight;
			contentRef.current.scrollTo({ top: targetScrollTop, behavior: "smooth" });
		}
	};

	return (
		<div
			className={cn(
				"h-1 w-full cursor-pointer transition-opacity duration-300",
				showProgress ? "opacity-100" : "opacity-0"
			)}
			onClick={handleProgressClick}
			title={`阅读进度: ${progress}%`}
		>
			<div className="h-full w-full bg-[var(--border-light)]">
				<div
					className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] transition-all duration-150"
					style={{ width: `${progress}%` }}
				/>
			</div>
		</div>
	);
}

// 悬浮阅读进度显示
export function ReadingProgressFloat({ contentRef, articleId }: ReadingProgressProps) {
	const [progress, setProgress] = useState(0);
	const { saveReadingProgress } = useArticleStore();

	// 节流保存进度
	const throttledSaveProgress = useCallback(
		throttle((articleId: string, progress: number) => {
			saveReadingProgress(articleId, progress);
		}, 2000),
		[saveReadingProgress]
	);

	useEffect(() => {
		const element = contentRef.current;
		if (!element) return;

		const handleScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = element;
			if (scrollHeight <= clientHeight) {
				setProgress(100);
				return;
			}
			const currentProgress = Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
			setProgress(Math.min(Math.max(currentProgress, 0), 100));

			if (articleId) {
				throttledSaveProgress(articleId, currentProgress);
			}
		};

		element.addEventListener("scroll", handleScroll);
		handleScroll(); // 初始化
		return () => element.removeEventListener("scroll", handleScroll);
	}, [contentRef, articleId, throttledSaveProgress]);

	if (progress <= 0) return null;

	return (
		<div
			className={cn(
				"fixed bottom-4 right-4 z-40 px-3 py-1.5 rounded-full",
				"bg-[var(--bg-card)] border border-[var(--border)] shadow-lg",
				"text-xs font-medium text-[var(--text-secondary)]"
			)}
		>
			{progress}%
		</div>
	);
}
