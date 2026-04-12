import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import type { TranslationHistoryEntry, TranslationHistoryResponse } from "@/lib/types";

const API_BASE = typeof import.meta !== 'undefined' && (import.meta as unknown as { env: Record<string, string> }).env?.PUBLIC_API_URL
  ? (import.meta as unknown as { env: Record<string, string> }).env.PUBLIC_API_URL
  : "http://localhost:8787";

const LANG_LABELS: Record<string, string> = {
  "zh-CN": "简体中文", "zh-TW": "繁體中文", "en": "English",
  "ja": "日本語", "ko": "한국어", "fr": "Français", "de": "Deutsch",
  "es": "Español", "pt": "Português", "ru": "Русский", "ar": "العربية",
  "hi": "हिन्दी", "it": "Italiano", "nl": "Nederlands", "th": "ไทย",
};

export function TranslationHistory() {
  const [items, setItems] = useState<TranslationHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const pageSize = 20;

  const fetchHistory = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/translations/history?page=${p}&pageSize=${pageSize}`,
        { credentials: "include" }
      );
      const json = await res.json() as { success: boolean; data: TranslationHistoryResponse };
      if (json.success) {
        setItems(json.data.items);
        setTotal(json.data.total);
        setPage(json.data.page);
      }
    } catch (err) {
      console.error("Failed to fetch translation history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此翻译记录？")) return;
    setDeleting(id);
    try {
      const res = await fetch(`${API_BASE}/api/translations/history/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json() as { success: boolean };
      if (json.success) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch (err) {
      console.error("Failed to delete translation history:", err);
    } finally {
      setDeleting(null);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border-light)]">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">翻译历史</h1>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          共 {total} 条翻译记录
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="w-6 h-6 animate-spin text-[var(--accent)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
            <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path d="M10.5 21l6-6m-6 6h12" />
            </svg>
            <p className="text-sm">暂无翻译记录</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {items.map((item) => (
              <div
                key={item.id}
                className="px-6 py-3 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors group"
              >
                {/* Language badge */}
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium shrink-0",
                  "bg-[var(--accent-light)] text-[var(--accent)]"
                )}>
                  {LANG_LABELS[item.targetLang] ?? item.targetLang}
                </span>

                {/* Article info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">
                    {item.articleTitle ?? "未命名文章"}
                  </p>
                  {item.feedName && (
                    <p className="text-[11px] text-[var(--text-tertiary)] truncate">{item.feedName}</p>
                  )}
                </div>

                {/* Date */}
                <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">
                  {item.translatedAt}
                </span>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-tertiary)] hover:text-red-500 transition-all"
                  title="删除记录"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-[var(--border-light)] flex items-center justify-between">
          <button
            onClick={() => fetchHistory(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1 text-xs rounded-lg bg-[var(--bg-card)] border border-[var(--border-light)] disabled:opacity-40 hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            上一页
          </button>
          <span className="text-xs text-[var(--text-tertiary)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => fetchHistory(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1 text-xs rounded-lg bg-[var(--bg-card)] border border-[var(--border-light)] disabled:opacity-40 hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
