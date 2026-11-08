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
