export const MIN_READER_WIDTH = 400;
export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 320;
export const MIN_LIST_WIDTH = 280;
export const MAX_LIST_WIDTH = 480;

/** Clamp persisted preferences to the available desktop container, including separators. */
export function fitPanelWidths(containerWidth: number, sidebarWidth: number, listWidth: number, collapsed: boolean) {
  const budget = Math.max(0, containerWidth - MIN_READER_WIDTH - (collapsed ? 4 : 8));
  const sidebar = collapsed ? 0 : Math.max(MIN_SIDEBAR_WIDTH, Math.min(sidebarWidth, MAX_SIDEBAR_WIDTH, budget - MIN_LIST_WIDTH));
  const list = Math.max(MIN_LIST_WIDTH, Math.min(listWidth, MAX_LIST_WIDTH, budget - sidebar));
  return { sidebar, list };
}
