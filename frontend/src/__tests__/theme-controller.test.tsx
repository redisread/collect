import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ThemeController } from "../components/app/common/ThemeToggle";
import { useUiStore } from "../lib/store/uiStore";

it("keeps following system changes without mounting the menu controls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let listener!: (event: { matches: boolean }) => void;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: (_: string, callback: typeof listener) => { listener = callback; }, removeEventListener: vi.fn() }));
  useUiStore.setState({ theme: "system" });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ThemeController />));
    expect(container.childElementCount).toBe(0);
    await act(async () => listener({ matches: true }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await act(async () => listener({ matches: false }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    useUiStore.setState({ theme: "light" });
    document.documentElement.classList.remove("dark", "theme-switching");
  }
});

it("keeps the glass selector state aligned through rapid theme changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const { ThemeToggle } = await import("../components/app/common/ThemeToggle");
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ThemeToggle />));
    for (const [label, value] of [["深色", "dark"], ["浅色", "light"], ["深色", "dark"], ["跟随系统", "system"]]) {
      const button = Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes(label))!;
      await act(async () => button.click());
      expect(useUiStore.getState().theme).toBe(value);
      expect(button.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    }
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
