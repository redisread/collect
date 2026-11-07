import { useState, type ReactNode } from "react";
import { useFeedStore } from "@/lib/store/feedStore";
import { cn } from "@/lib/utils/cn";

export const FEED_DRAG_TYPE = "application/x-collect-feed";

export function FeedDropZone({ folderId, children }: { folderId: string | null; children: ReactNode }) {
  const [over, setOver] = useState(false);
  return <div
    data-drop-folder={folderId ?? "unfiled"}
    onDragOver={event => {
      if (event.dataTransfer.types.includes(FEED_DRAG_TYPE)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }
    }}
    onDragLeave={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
    }}
    onDrop={event => {
      if (!event.dataTransfer.types.includes(FEED_DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      setOver(false);
      void useFeedStore.getState().moveFeedToFolder(event.dataTransfer.getData(FEED_DRAG_TYPE), folderId);
    }}
    className={cn("rounded-xl border border-transparent transition-colors duration-150", over && "!border-[var(--accent)] bg-[var(--accent-light)]")}
  >{children}{over && <span className="block px-3 pb-1 text-xs text-[var(--text-primary)]">松开以移动到{folderId ? "此文件夹" : "未分类"}</span>}</div>;
}
