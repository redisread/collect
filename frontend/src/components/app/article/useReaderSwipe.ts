import { useEffect, useState, type RefObject } from "react";

/** Leave edge navigation, selection and embedded controls to the browser. */
export function useReaderSwipe(ref: RefObject<HTMLDivElement | null>, articleId: string | undefined,
  disabled: boolean, navigate: (direction: "next" | "prev") => Promise<void>) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;
    let start: { x: number; y: number; horizontal: boolean } | null = null;
    let distance = 0;
    const reset = () => { start = null; distance = 0; setOffset(0); setDragging(false); };
    const begin = (event: TouchEvent) => {
      reset();
      if (event.touches.length !== 1 || window.getSelection()?.toString()) return;
      const touch = event.touches[0];
      if (touch.clientX < 28 || touch.clientX > window.innerWidth - 28) return;
      let target = event.target instanceof Element ? event.target : null;
      if (target?.closest("a, button, input, textarea, select, summary, [contenteditable], [role=tablist], pre, table, img, video, audio, iframe, .annotation-highlight")) return;
      while (target && target !== element) {
        if (target.scrollWidth > target.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(target).overflowX)) return;
        target = target.parentElement;
      }
      start = { x: touch.clientX, y: touch.clientY, horizontal: false };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || window.getSelection()?.toString()) { reset(); return; }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!start.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.5) { reset(); return; }
        start.horizontal = true;
      }
      if (!event.cancelable) { reset(); return; }
      event.preventDefault();
      distance = dx;
      setDragging(true);
      setOffset(Math.max(-48, Math.min(48, dx * 0.25)));
    };
    const end = () => {
      const shouldNavigate = start?.horizontal && Math.abs(distance) >= 80 && !window.getSelection()?.toString();
      const direction = distance < 0 ? "next" : "prev";
      reset();
      if (shouldNavigate) void navigate(direction);
    };
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", reset);
    return () => {
      element.removeEventListener("touchstart", begin);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", reset);
      reset();
    };
  }, [ref, articleId, disabled, navigate]);
  return { offset, dragging };
}
