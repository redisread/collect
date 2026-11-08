import type { MouseEvent } from "react";

// Keep the mounted reader and its scroll position when visiting personal settings.
export function navigateWithinReader(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState(null, "", event.currentTarget.href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
