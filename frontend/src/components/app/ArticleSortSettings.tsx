import { useEffect } from "react";
import { useArticleStore } from "@/lib/store/articleStore";

export function ArticleSortSettings() {
  const { sortOrder, saveSortOrder, isSavingSort, articleActionError } = useArticleStore();
  useEffect(() => {
    void useArticleStore.getState().loadSortOrder().catch(() => {
      useArticleStore.setState({ articleActionError: "无法加载排序设置，请重试" });
    });
  }, []);
  return <section className="mb-8">
    <label htmlFor="article-sort" className="block font-medium">文章排序</label>
    <select id="article-sort" value={sortOrder} disabled={isSavingSort}
      onChange={event => void saveSortOrder(event.target.value as "asc" | "desc")}
      className="mt-3 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-main)] px-3 sm:max-w-sm">
      <option value="desc">最新发布优先</option><option value="asc">最早发布优先</option>
    </select>
    {isSavingSort && <p role="status">正在保存…</p>}
    {articleActionError && <p role="alert">{articleActionError}</p>}
  </section>;
}
