import { useCallback } from "react";
import { useFeedStore } from "@/lib/store/feedStore";
import { useUiStore } from "@/lib/store/uiStore";
import { Modal } from "../common/Modal";

/** Owned by the sidebar so moving a feed between folder subtrees keeps the dialog mounted. */
export function MoveFeedDialog() {
  const { feedToMoveId, setFeedToMoveId } = useUiStore();
  const { feeds, folders, movingFeedId, moveStatus, moveFeedToFolder } = useFeedStore();
  const feed = feeds.find(item => item.id === feedToMoveId);
  const returnFocus = useCallback(() => {
    const trigger = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-move-feed]"))
      .find(button => button.dataset.moveFeed === feedToMoveId && button.getClientRects().length > 0);
    return trigger ?? document.querySelector<HTMLButtonElement>('[title="添加订阅源"]');
  }, [feedToMoveId]);
  if (!feed) return null;
  return <Modal title="移动订阅源" onClose={() => setFeedToMoveId(null)} returnFocus={returnFocus}>
    <div className="space-y-4 p-5">
      <p className="break-words font-medium">{feed.title}</p>
      <label className="block text-sm">目标文件夹
        <select aria-label={`移动 ${feed.title} 到文件夹`} value={feed.folderId ?? ""}
          disabled={!!movingFeedId} onChange={event => void moveFeedToFolder(feed.id, event.target.value || null)}
          className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 text-base">
          <option value="">未分类</option>
          {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
      </label>
      {moveStatus && <p role="status" className="text-sm text-[var(--text-secondary)]">{moveStatus}</p>}
    </div>
  </Modal>;
}
