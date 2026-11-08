import { useEffect } from "react";
import { useUiStore, type ThemeMode } from "@/lib/store";
import { cn } from "@/lib/utils/cn";

export function ThemeToggle() {
	const { theme, setTheme } = useUiStore();

	// 应用主题到 document
	useEffect(() => {
		const root = document.documentElement;
		let frame = 0;
		const applyTheme = (isDark: boolean) => {
			cancelAnimationFrame(frame);
			root.classList.add("theme-switching");
			root.classList.toggle("dark", isDark);
			// Flush the new colors while transitions are suppressed.
			void root.offsetHeight;
			frame = requestAnimationFrame(() => root.classList.remove("theme-switching"));
		};
		const cleanup = () => {
			cancelAnimationFrame(frame);
			root.classList.remove("theme-switching");
		};

		if (theme === "system") {
			const mq = window.matchMedia("(prefers-color-scheme: dark)");
			applyTheme(mq.matches);
			const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
			mq.addEventListener("change", handler);
			return () => { mq.removeEventListener("change", handler); cleanup(); };
		} else {
			applyTheme(theme === "dark");
			return cleanup;
		}
	}, [theme]);

	const options: { value: ThemeMode; label: string; path: string }[] = [
		{ value: "light", label: "亮色", path: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0" },
		{ value: "dark", label: "暗色", path: "M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" },
		{ value: "system", label: "跟随系统", path: "M3 4h18v13H3zM8 21h8m-4-4v4" },
	];

	return (
		<div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-card-hover)]">
			{options.map((opt) => (
				<button
					key={opt.value}
					onClick={() => setTheme(opt.value)}
					title={opt.label}
					aria-label={opt.label}
					aria-pressed={theme === opt.value}
					className={cn(
						"flex min-h-9 min-w-9 items-center justify-center rounded-lg transition-colors duration-150",
						theme === opt.value
							? "bg-[var(--bg-main)] text-[var(--text-primary)] shadow-sm"
							: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
					)}
				>
					<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={opt.path} /></svg>
				</button>
			))}
		</div>
	);
}
