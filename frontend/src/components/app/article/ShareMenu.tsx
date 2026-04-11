import { useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import type { Article } from "@/lib/types";

interface ShareMenuProps {
	article: Article;
	onClose: () => void;
}

type ShareOption = {
	id: string;
	label: string;
	icon: React.ReactNode;
	action: () => void;
};

export function ShareMenu({ article, onClose }: ShareMenuProps) {
	const [copied, setCopied] = useState(false);

	// 复制链接
	const handleCopyLink = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(article.url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (error) {
			console.error("Failed to copy link:", error);
		}
	}, [article.url]);

	// 分享到 Twitter
	const handleShareTwitter = useCallback(() => {
		const text = encodeURIComponent(article.title);
		const url = encodeURIComponent(article.url);
		window.open(
			`https://twitter.com/intent/tweet?text=${text}&url=${url}`,
			"_blank",
			"noopener,noreferrer"
		);
		onClose();
	}, [article.title, article.url, onClose]);

	// 邮件分享
	const handleShareEmail = useCallback(() => {
		const subject = encodeURIComponent(article.title);
		const body = encodeURIComponent(`我在 Collect 发现了一篇有趣的文章：\n\n${article.title}\n${article.url}`);
		window.location.href = `mailto:?subject=${subject}&body=${body}`;
		onClose();
	}, [article.title, article.url, onClose]);

	// 使用 Web Share API（如果支持）
	const handleNativeShare = useCallback(async () => {
		if (navigator.share) {
			try {
				await navigator.share({
					title: article.title,
					text: article.summary || "",
					url: article.url,
				});
				onClose();
			} catch (error) {
				// 用户取消分享
				if ((error as Error).name !== "AbortError") {
					console.error("Failed to share:", error);
				}
			}
		}
	}, [article, onClose]);

	// 生成分享选项
	const shareOptions: ShareOption[] = [
		{
			id: "copy",
			label: copied ? "已复制" : "复制链接",
			icon: copied ? (
				<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
					<path d="M5 13l4 4L19 7" />
				</svg>
			) : (
				<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
					<path d="M13.828 1.686a8.987 8.987 0 0 1 6.364 6.364L10.5 17.768l-4.357-4.357a2.121 2.121 0 0 0-3 3L10.5 20.768l9.9-9.9a8.983 8.983 0 0 0-6.364-6.364L10.5 8.732 4.929 3.161a2.121 2.121 0 0 0-3 3l5.657 5.657" />
				</svg>
			),
			action: handleCopyLink,
		},
		{
			id: "twitter",
			label: "分享到 Twitter",
			icon: (
				<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
					<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
				</svg>
			),
			action: handleShareTwitter,
		},
		{
			id: "email",
			label: "邮件分享",
			icon: (
				<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
					<path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
				</svg>
			),
			action: handleShareEmail,
		},
	];

	// 如果支持原生分享，添加到选项
	if (typeof navigator !== "undefined" && "share" in navigator) {
		shareOptions.unshift({
			id: "native",
			label: "系统分享",
			icon: (
				<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
					<path d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m9.566-2.186a2.25 2.25 0 1 0 0 2.186m-6.364-2.186 2.25 2.25 2.25-2.25m-2.25 2.25V6.75m0 9h.008v.008h-.008v-.008z" />
				</svg>
			),
			action: handleNativeShare,
		});
	}

	return (
		<div className="w-48 py-1">
			<div className="px-3 py-2 border-b border-[var(--border-light)]">
				<p className="text-xs font-medium text-[var(--text-secondary)] truncate">
					分享文章
				</p>
			</div>
			{shareOptions.map((option) => (
				<button
					key={option.id}
					onClick={option.action}
					className={cn(
						"w-full flex items-center gap-2 px-3 py-2 text-sm",
						"text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]",
						"transition-colors"
					)}
				>
					<span className={cn(option.id === "copy" && copied && "text-emerald-500")}>
						{option.icon}
					</span>
					<span className={cn(option.id === "copy" && copied && "text-emerald-500")}>
						{option.label}
					</span>
				</button>
			))}
		</div>
	);
}

// 分享按钮组件
interface ShareButtonProps {
	article: Article;
}

export function ShareButton({ article }: ShareButtonProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="relative">
			<button
				onClick={() => setIsOpen(!isOpen)}
				title="分享"
				className={cn(
					"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
					"text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]",
					"transition-all duration-[var(--transition-base)]"
				)}
			>
				<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m9.566-2.186a2.25 2.25 0 1 0 0 2.186m-6.364-2.186 2.25 2.25 2.25-2.25m-2.25 2.25V6.75m0 9h.008v.008h-.008v-.008z" />
				</svg>
				分享
			</button>

			{/* 分享菜单弹出层 */}
			{isOpen && (
				<>
					{/* 遮罩层 */}
					<div
						className="fixed inset-0 z-40"
						onClick={() => setIsOpen(false)}
					/>
					{/* 菜单 */}
					<div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden">
						<ShareMenu article={article} onClose={() => setIsOpen(false)} />
					</div>
				</>
			)}
		</div>
	);
}
