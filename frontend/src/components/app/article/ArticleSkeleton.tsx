import { cn } from "@/lib/utils/cn";

export function ArticleCardSkeleton() {
	return (
		<div className="px-4 py-3 border-b border-[var(--border-light)] animate-pulse">
			<div className="flex items-start gap-3">
				<div className="flex-1 space-y-2">
					<div className="skeleton h-3 w-24 rounded" />
					<div className="skeleton h-4 w-full rounded" />
					<div className="skeleton h-4 w-4/5 rounded" />
					<div className="skeleton h-3 w-32 rounded" />
				</div>
				<div className="skeleton w-16 h-12 rounded-lg shrink-0" />
			</div>
		</div>
	);
}

export function ArticleDetailSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="正在加载文章" className="w-full max-w-[680px] mx-auto px-6 py-12 space-y-6">
			<div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
				<span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-yellow)] motion-safe:animate-pulse" />
				正在加载文章…
			</div>
			<div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
			<div className="skeleton h-6 w-3/4 rounded" />
			<div className="skeleton h-5 w-1/2 rounded" />
			<div className="space-y-3 pt-6">
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className={cn("skeleton h-4 rounded", i % 3 === 2 ? "w-4/5" : "w-full")} />
				))}
			</div>
			</div>
		</div>
	);
}
