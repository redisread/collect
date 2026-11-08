import { createPortal } from "react-dom";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";

export interface ContextMenuItem {
	label: string;
	icon?: string;
	onClick: () => void;
	variant?: "default" | "danger";
	disabled?: boolean;
}

interface ContextMenuProps {
	items: ContextMenuItem[];
	x: number;
	y: number;
	onClose: () => void;
}

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const menu = menuRef.current!;
    const previousFocus = document.activeElement;
    menu.showPopover();
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, innerWidth - rect.width - 8)) + "px";
    menu.style.top = Math.max(8, Math.min(y, innerHeight - rect.height - 8)) + "px";
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const closeOnResize = () => closeRef.current();
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("resize", closeOnResize);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [x, y]);
  return createPortal(<div ref={menuRef} popover="auto" role="menu" aria-label="操作菜单"
    onToggle={event => { if (event.newState === "closed") closeRef.current(); }}
    onKeyDown={event => {
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
      if (event.key === "Home") { event.preventDefault(); buttons[0]?.focus(); }
      if (event.key === "End") { event.preventDefault(); buttons.at(-1)?.focus(); }
      if (event.key === "Escape" || event.key === "Tab") onClose();
    }}
    className="fixed inset-auto m-0 min-w-40 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-1.5 text-[var(--text-primary)] shadow-[var(--shadow-md)] animate-fade-in">
    {items.map((item, i) => <button key={i} role="menuitem" disabled={item.disabled}
      onClick={() => { item.onClick(); onClose(); }}
      className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-sm transition-colors duration-150 hover:bg-[var(--bg-card-hover)] disabled:opacity-40", item.variant === "danger" && "text-red-500")}>
      {item.icon && <span aria-hidden="true">{item.icon}</span>}{item.label}
    </button>)}
  </div>, document.body);
}

// 右键菜单 Hook
export function useContextMenu() {
	const menuRef = useRef<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

	const show = (e: React.MouseEvent, items: ContextMenuItem[]) => {
		e.preventDefault();
		menuRef.current = { x: e.clientX, y: e.clientY, items };
	};

	return { show, menuRef };
}
