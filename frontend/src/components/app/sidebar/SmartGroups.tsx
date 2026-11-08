import { useFeedStore } from "@/lib/store/feedStore";
import { useArticleStore } from "@/lib/store/articleStore";
import { cn } from "@/lib/utils/cn";
import type { SelectedSource } from "@/lib/store/feedStore";

const SMART_GROUPS: Array<{
	type: SelectedSource["type"];
	label: string;
	icon: React.ReactNode;
}> = [
	{
		type: "all",
		label: "全部文章",
		icon: (
			<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path d="M3 7h18M3 12h18M3 17h18" />
			</svg>
		),
	},
	{
		type: "starred",
		label: "收藏",
		icon: (
			<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
			</svg>
		),
	},
	{
		type: "read_later",
		label: "稍后阅读",
		icon: (
			<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
			</svg>
		),
	},
];

export function SmartGroups() {
	const { selectedSource, setSelectedSource, feeds } = useFeedStore();
	const { fetchArticles } = useArticleStore();

	// 计算各分组的计数
	const totalUnread = feeds.reduce((sum, f) => sum + (f.unreadCount ?? 0), 0);
	const starredCount = feeds.reduce((sum, feed) => sum + (feed.starredCount ?? 0), 0);
	const readLaterCount = feeds.reduce((sum, feed) => sum + (feed.readLaterCount ?? 0), 0);

	const counts: Record<string, number> = {
		all: totalUnread,
		starred: starredCount,
		read_later: readLaterCount,
	};

	const handleSelect = (type: SelectedSource["type"]) => {
		const source = { type } as SelectedSource;
		setSelectedSource(source);
		fetchArticles(source);
	};

	return (
		<div className="px-2 py-1">
			{SMART_GROUPS.map((group) => {
				const isSelected = selectedSource.type === group.type;
				const count = counts[group.type];

				return (
					<button
						key={group.type}
						onClick={() => handleSelect(group.type)}
						className={cn(
							"w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm",
							"transition-all duration-[var(--transition-base)]",
							isSelected
								? "bg-[var(--accent-light)] text-[var(--accent)]"
								: "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
						)}
					>
						<span className={cn(isSelected ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]")}>
							{group.icon}
						</span>
						<span className="flex-1 text-left">{group.label}</span>
						{count > 0 && (
							<span
								className={cn(
									"text-xs px-1.5 py-0.5 rounded-full font-medium",
									isSelected
										? "bg-[var(--accent)] text-white"
										: "bg-[var(--bg-card-hover)] text-[var(--text-tertiary)]"
								)}
							>
								{count}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
