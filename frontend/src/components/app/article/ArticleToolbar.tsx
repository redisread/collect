import { motion, useReducedMotion } from "framer-motion";
import { useArticleStore, SUPPORTED_LANGUAGES } from "@/lib/store/articleStore";
import type { Article } from "@/lib/types";
import { useEffect, useId, useRef } from "react";
import { escapeHtml } from "@/lib/utils/sanitize";
import { useAiSettingsStore } from "@/lib/store/aiSettingsStore";

interface ArticleToolbarProps {
  article: Article;
  onOpenNotes?: () => void;
}

export function ArticleToolbar({ article, onOpenNotes }: ArticleToolbarProps) {
  const reduceMotion = useReducedMotion();
  const {
    toggleStarred, toggleReadLater, translateArticle, translateFullArticle, isTranslating,
    extractArticle, isExtracting, extractionError, translationError,
    translationFallback, translateInBrowser, translationMode,
    targetLanguage, isLoadingPreference, preferenceError,
    aiProgress, pauseTranslation, continueTranslation, isPausingTranslation,
  } = useArticleStore();
  const { profiles, activeProfileId } = useAiSettingsStore();
  const activeProfile = profiles.find(profile => profile.id === activeProfileId);
  const providerName = activeProfile?.name ?? "Google";
  const canContinue = aiProgress && !aiProgress.complete && aiProgress.profileId === activeProfile?.id &&
    aiProgress.revision === activeProfile.revision && aiProgress.targetLang === targetLanguage;
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const closeOnResize = () => menu.current?.hidePopover();
    window.addEventListener("resize", closeOnResize);
    return () => window.removeEventListener("resize", closeOnResize);
  }, []);
  const busy = isExtracting || isTranslating || isLoadingPreference;
  const languageLabel = SUPPORTED_LANGUAGES.find(language => language.code === targetLanguage)?.label ?? targetLanguage;
  const buttonClass = "min-h-10 rounded-lg px-3 text-sm transition-colors duration-150 hover:bg-[var(--bg-card-hover)] disabled:opacity-50";

  function closeMenu() {
    menu.current?.hidePopover();
    trigger.current?.focus();
  }

  return (
    <div className="shrink-0 border-b border-[var(--border-light)] bg-[var(--bg-main)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => void (canContinue ? continueTranslation() : translateFullArticle())} disabled={busy}
          title={`使用${providerName}翻译为${languageLabel}，可在个人设置中修改`} aria-description={`使用${providerName}，目标语言为${languageLabel}`}
          className={buttonClass + " bg-[var(--accent-light)] text-[var(--accent)]"}>
          {isLoadingPreference ? "同步设置…" : isExtracting ? "提取全文…" : isTranslating ? "翻译中…" : canContinue ? (aiProgress?.failed && aiProgress.pending === 0 ? "重试失败段落" : "继续翻译") : "翻译全文"}
        </button>
        {translationMode === "ai" && isTranslating && <button disabled={isPausingTranslation} className={buttonClass} onClick={pauseTranslation}>{isPausingTranslation ? "保存中…" : "暂停"}</button>}
        <button aria-label={article.isStarred ? "取消收藏" : "收藏"} aria-pressed={article.isStarred}
          onClick={() => void toggleStarred(article.id)} className={buttonClass + " ml-auto"}>
          <motion.svg animate={{ scale: article.isStarred && !reduceMotion ? [1, 1.08, 1] : 1 }} transition={{ duration: 0.15 }} aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"
            fill={article.isStarred ? "var(--brand-yellow)" : "none"} stroke="currentColor" strokeWidth="1.6">
            <path strokeLinejoin="round" d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z" />
          </motion.svg>
        </button>
        <button ref={trigger} popoverTarget={menuId} aria-label="更多文章操作"
          aria-haspopup="menu" className={buttonClass}>•••</button>
      </div>
      <p className="mt-1 break-words text-xs text-[var(--text-tertiary)]">翻译服务 · {providerName}</p>
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
        {isLoadingPreference ? "正在同步翻译语言…" : isExtracting ? "正在获取完整文章…" : isPausingTranslation ? "正在保存已开始的段落" : translationMode === "ai" ? "正在并发翻译…" : translationMode === "browser" ? "正在通过浏览器连接 Google 翻译…" : "正在翻译，请稍候…"}
      </p>}
      {aiProgress && <div>
      <div role="progressbar" aria-label="翻译进度" aria-valuemin={0} aria-valuemax={aiProgress.total} aria-valuenow={aiProgress.completed} className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--border-light)]">
        <motion.div className="h-full bg-[var(--brand-yellow)]" initial={false} animate={{ width: `${aiProgress.total ? aiProgress.completed / aiProgress.total * 100 : 0}%` }} transition={{ duration: reduceMotion ? 0 : 0.15 }} />
      </div>
      <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">
        已完成 {aiProgress.completed} / {aiProgress.total} 段{aiProgress.failed ? `，${aiProgress.failed} 段待重试` : ""}{aiProgress.complete ? "，译文已保存" : "，已完成段落已保存"}
      </p></div>}
      {(preferenceError || translationError || extractionError) && <div role="alert" className="mt-2 text-sm text-[var(--text-secondary)]">
        <p>{preferenceError || translationError || extractionError}</p>
        {translationFallback && <button disabled={busy}
          className={buttonClass + " mt-2 bg-[var(--accent-light)] text-[var(--accent)]"}
          onClick={() => void translateInBrowser()}>通过浏览器重试</button>}
        {extractionError && article.summary && !article.content && <button
          disabled={busy} className={buttonClass + " mt-1 underline underline-offset-4"}
          onClick={() => void translateArticle(article.id, "<p>" + escapeHtml(article.summary!) + "</p>")}>
          仅翻译摘要
        </button>}
      </div>}
    </div>
  );
}
