import { useArticleStore, SUPPORTED_LANGUAGES } from "@/lib/store/articleStore";
import type { Article } from "@/lib/types";
import { useEffect, useId, useRef } from "react";
import { escapeHtml } from "@/lib/utils/sanitize";

interface ArticleToolbarProps {
  article: Article;
  onOpenNotes?: () => void;
}

export function ArticleToolbar({ article, onOpenNotes }: ArticleToolbarProps) {
  const {
    toggleStarred, toggleReadLater, translateArticle, translateFullArticle, isTranslating,
    extractArticle, isExtracting, extractionError, translationError,
    translationFallback, translateInBrowser, translationMode,
    targetLanguage, setTargetLanguage,
  } = useArticleStore();
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const closeOnResize = () => menu.current?.hidePopover();
    window.addEventListener("resize", closeOnResize);
    return () => window.removeEventListener("resize", closeOnResize);
  }, []);
  const busy = isExtracting || isTranslating;
  const buttonClass = "min-h-10 rounded-lg px-3 text-sm transition-colors duration-150 hover:bg-[var(--bg-card-hover)] disabled:opacity-50";

  function closeMenu() {
    menu.current?.hidePopover();
    trigger.current?.focus();
  }

  return (
    <div className="shrink-0 border-b border-[var(--border-light)] bg-[var(--bg-main)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          aria-label="翻译目标语言"
          value={targetLanguage}
          disabled={busy}
          onChange={event => setTargetLanguage(event.target.value)}
          className="min-h-10 min-w-28 max-w-36 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-2 text-sm"
        >
          {SUPPORTED_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
        </select>
        <button onClick={() => void translateFullArticle()} disabled={busy}
          className={buttonClass + " bg-[var(--accent-light)] text-[var(--accent)]"}>
          {isExtracting ? "提取全文…" : isTranslating ? "翻译中…" : "翻译全文"}
        </button>
        <button aria-label={article.isStarred ? "取消收藏" : "收藏"} aria-pressed={article.isStarred}
          onClick={() => void toggleStarred(article.id)} className={buttonClass + " ml-auto"}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"
            fill={article.isStarred ? "var(--brand-yellow)" : "none"} stroke="currentColor" strokeWidth="1.6">
            <path strokeLinejoin="round" d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z" />
          </svg>
        </button>
        <button ref={trigger} popoverTarget={menuId} aria-label="更多文章操作"
          aria-haspopup="menu" className={buttonClass}>•••</button>
      </div>
      <div ref={menu} id={menuId} popover="auto" role="menu" aria-label="文章操作"
        className="article-actions rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-1.5 text-[var(--text-primary)] shadow-[var(--shadow-md)]"
        onToggle={event => {
          if (event.newState !== "open" || !menu.current || !trigger.current) return;
          const rect = trigger.current.getBoundingClientRect();
          menu.current.style.left = Math.max(8, Math.min(rect.right - 200, window.innerWidth - 208)) + "px";
          menu.current.style.top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - menu.current.offsetHeight - 8)) + "px";
          menu.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        }}
        onKeyDown={event => {
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
          const index = items.indexOf(document.activeElement as HTMLElement);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
          }
          if (event.key === "Escape") { event.preventDefault(); closeMenu(); }
        }}>
        <button role="menuitem" className={buttonClass + " w-full text-left"}
          onClick={() => { void toggleReadLater(article.id); closeMenu(); }}>
          {article.isReadLater ? "移出稍后读" : "稍后读"}
        </button>
        <button role="menuitem" className={buttonClass + " w-full text-left"}
          onClick={() => { onOpenNotes?.(); closeMenu(); }}>笔记</button>
        <button role="menuitem" disabled={busy} className={buttonClass + " w-full text-left"}
          onClick={() => { void extractArticle(article.id); closeMenu(); }}>重新提取全文</button>
        <a role="menuitem" href={article.url} target="_blank" rel="noopener noreferrer"
          className={buttonClass + " flex items-center"} onClick={closeMenu}>打开原文 ↗</a>
      </div>
      {busy && <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">
        {isExtracting ? "正在获取完整文章…" : translationMode === "browser" ? "正在通过浏览器连接 Google 翻译…" : "正在翻译，请稍候…"}
      </p>}
      {(translationError || extractionError) && <div role="alert" className="mt-2 text-sm text-[var(--text-secondary)]">
        <p>{translationError || extractionError}</p>
        {translationFallback && <button disabled={busy}
          className={buttonClass + " mt-2 bg-[var(--accent-light)] text-[var(--accent)]"}
          onClick={() => void translateInBrowser()}>通过浏览器重试</button>}
        {extractionError && article.summary && !article.content && <button
          disabled={busy} className={buttonClass + " mt-1 underline underline-offset-4"}
          onClick={() => void translateArticle(article.id, "<p>" + escapeHtml(article.summary!) + "</p>", targetLanguage)}>
          仅翻译摘要
        </button>}
      </div>}
    </div>
  );
}
