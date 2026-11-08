import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

/** Native dialog provides top-layer rendering, inert background and keyboard containment. */
export function Modal({ open = true, title, onClose, children, drawer = false, returnFocus }: {
  open?: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  drawer?: boolean;
  returnFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      const target = returnFocus?.() ?? previousFocus;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, [open, returnFocus]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <dialog ref={ref} aria-labelledby={titleId}
      className={cn("collect-dialog border border-[var(--border)] bg-[var(--bg-main)] p-0 text-[var(--text-primary)] shadow-[var(--shadow-md)] backdrop:bg-black/30",
        drawer ? "collect-drawer" : "rounded-2xl")}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}>
      <motion.div className="flex min-h-0 flex-1 flex-col overflow-hidden"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2">
          <h2 id={titleId} className="min-w-0 break-words text-base font-semibold">{title}</h2>
          <button type="button" aria-label={`关闭${title}`} onClick={onClose}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-card-hover)]">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </motion.div>
    </dialog>, document.body,
  );
}
