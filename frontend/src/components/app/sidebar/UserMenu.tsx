import { useId, useRef } from "react";
import { authClient, signOut } from "@/lib/auth-client";
import { navigateWithinReader } from "@/lib/navigation";
import { ThemeToggle } from "../common/ThemeToggle";
import { PwaInstallButton } from "../PwaControls";

export function UserMenu() {
  const { data: session } = authClient.useSession();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const name = session?.user?.name || session?.user?.email || "用户";
  const linkClass = "flex min-h-11 w-full items-center rounded-lg px-3 text-start text-sm hover:bg-[var(--bg-card-hover)]";
  return <div className="shrink-0 border-t border-[var(--border-light)] p-2">
    <button ref={trigger} popoverTarget={id} aria-haspopup="dialog"
      className={linkClass + " gap-2"}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]" aria-hidden="true">{session?.user?.image ? <img src={session.user.image} alt="" className="h-8 w-8 rounded-full object-cover" /> : name.slice(0, 1)}</span>
      <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
      <span aria-hidden="true">⌃</span>
    </button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="用户菜单"
      className="fixed inset-auto m-0 w-64 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-2 text-[var(--text-primary)] shadow-[var(--shadow-md)] animate-fade-in"
      onToggle={event => {
        if (event.newState !== "open" || !panel.current || !trigger.current) return;
        const rect = trigger.current.getBoundingClientRect();
        panel.current.style.left = Math.max(8, Math.min(rect.left, innerWidth - panel.current.offsetWidth - 8)) + "px";
        panel.current.style.top = Math.max(8, rect.top - panel.current.offsetHeight - 8) + "px";
        panel.current.querySelector<HTMLButtonElement>("button")?.focus();
      }}>
      <p className="px-3 py-2 text-xs text-[var(--text-secondary)]">外观模式</p>
      <ThemeToggle />
      <a href="/settings" className={linkClass} onClick={event => { panel.current?.hidePopover(); navigateWithinReader(event); }}>个人设置</a>
      <a href="/translations" className={linkClass}>翻译历史</a>
      <PwaInstallButton />
      <button className={linkClass + " text-red-600"} onClick={async () => { await signOut(); window.location.href = "/login"; }}>退出登录</button>
    </div>
  </div>;
}
