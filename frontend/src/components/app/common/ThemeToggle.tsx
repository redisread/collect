import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useId } from "react";
import { useUiStore, type ThemeMode } from "@/lib/store";
import "./theme-toggle.css";

export function ThemeController() {
	const { theme } = useUiStore();

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

  return null;
}

const moonParticles = Array.from({ length: 11 }, (_, row) =>
  Array.from({ length: 11 }, (_, column) => ({ x: column * 1.7 - 8.5, y: row * 1.7 - 8.5 }))
).flat().filter(({ x, y }) => x * x + y * y < 75 && (x - 5) ** 2 + (y + 3) ** 2 > 55);

export function ThemeToggle() {
  const { theme, setTheme } = useUiStore();
  const reduceMotion = useReducedMotion();
  const id = useId();
  const options = [
    { value: "system", label: "跟随系统", symbol: "◐" },
    { value: "light", label: "浅色", symbol: "☀" },
    { value: "dark", label: "深色", symbol: "" },
  ] as const;
  return <div className="theme-choices" role="group" aria-label="外观">
    {options.map(option => <button key={option.value} type="button"
      aria-pressed={theme === option.value} onClick={() => setTheme(option.value)}
      className="theme-choice">
      {theme === option.value && <motion.span className="theme-glass" aria-hidden="true"
        data-theme={theme} layoutId={`theme-glass-${id}`}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 30 }} />}
      <span className="theme-symbol" aria-hidden="true">
        {option.value === "dark" ? moonParticles.map((point, index) => <motion.i key={index}
          className="moon-particle"
          animate={{ x: theme === "dark" ? point.x : Math.sin(index * 2.4) * 11,
            y: theme === "dark" ? point.y : Math.cos(index * 1.7) * 11,
            opacity: theme === "dark" ? 1 : 0.45 }}
          transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : index % 5 * 0.015 }} />) : option.symbol}
      </span>
      <span className="relative">{option.label}</span>
    </button>)}
  </div>;
}
