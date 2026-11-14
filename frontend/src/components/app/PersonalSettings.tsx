import { ThemeToggle } from "./common/ThemeToggle";
import { ArticleSortSettings } from "./ArticleSortSettings";
import { ProfileSettings } from "./ProfileSettings";
import { RetentionSettings } from "./RetentionSettings";
import { useEffect, useRef, useState } from "react";
import { navigateWithinReader } from "@/lib/navigation";
import { saveTranslationLanguage } from "@/lib/settings";
import { SUPPORTED_LANGUAGES, useArticleStore } from "@/lib/store/articleStore";
import { AiTranslationSettings } from "./AiTranslationSettings";
import { OpmlImportSettings } from "./OpmlImportSettings";

export function PersonalSettings() {
  const [tab, setTab] = useState("profile");
  const [language, setLanguage] = useState("");
  const [savedLanguage, setSavedLanguage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const value = await useArticleStore.getState().loadTargetLanguage();
      setLanguage(value);
      setSavedLanguage(value);
    } catch {
      setError("无法加载个人设置，请检查网络后重试");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    heading.current?.focus();
    void load();
  }, []);

  async function save(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const value = await saveTranslationLanguage(language);
      useArticleStore.getState().setTargetLanguage(value);
      setSavedLanguage(value);
      setSaved(true);
    } catch {
      setError("保存失败，请检查网络后重试");
    } finally { setSaving(false); }
  }

  return <main className="h-dvh overflow-y-auto bg-[var(--bg-main)] text-[var(--text-primary)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
    <div className="mx-auto max-w-5xl px-5 py-5 sm:px-8 sm:py-10">
      <a href="/" onClick={navigateWithinReader} className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← 返回阅读</a>
      <header className="mt-4 mb-6 flex items-center gap-4">
        <img src="/collect-logo.png" width="40" height="40" alt="" />
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">个人设置</h1>
      </header>
      <div className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="设置分区" className="flex gap-2 overflow-x-auto md:flex-col">
        {[["profile", "个人资料"], ["reading", "阅读"], ["ai", "AI 翻译"], ["opml", "订阅导入导出"]].map(([id, label]) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)} className={`min-h-11 shrink-0 rounded-lg px-3 text-left text-sm ${tab === id ? "bg-[var(--accent-light)] text-[var(--accent)]" : "hover:bg-[var(--bg-card-hover)]"}`}>{label}</button>)}
      </nav>
      <div className="min-w-0">
      <div hidden={tab !== "profile"}><ProfileSettings /></div>
      <div hidden={tab !== "reading"}><section className="mb-8 max-w-sm"><h2 className="mb-3 font-medium">外观</h2><ThemeToggle /></section><ArticleSortSettings /><RetentionSettings /></div>
      <div hidden={tab !== "ai"}>
      <form id="translation-preferences" onSubmit={save} className="scroll-mt-5 border-t border-[var(--border-light)] pt-7">
        <label htmlFor="translation-language" className="block text-base font-medium">翻译目标语言</label>
        <p id="language-description" className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">全文翻译和双语阅读共用此语言，随账号在网页和 PWA 中同步。</p>
        {loading ? <p role="status" className="mt-6 text-sm text-[var(--text-secondary)]">正在加载设置…</p> : savedLanguage && <select
          id="translation-language" value={language} disabled={saving} aria-describedby="language-description language-timing"
          onChange={event => { setLanguage(event.target.value); setSaved(false); }}
          className="mt-6 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-main)] px-4 text-base sm:max-w-sm">
          {SUPPORTED_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>}
        <p id="language-timing" className="mt-4 text-sm leading-6 text-[var(--text-tertiary)]">保存后，下次翻译时生效。当前阅读视图和已有译文会保留。</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button type="submit" disabled={loading || saving || !savedLanguage || language === savedLanguage}
            className="min-h-11 rounded-xl bg-[var(--brand-yellow)] px-5 text-sm font-medium text-stone-900 transition-opacity disabled:opacity-40">{saving ? "正在保存…" : "保存设置"}</button>
          {saved && <p role="status" className="text-sm text-[var(--text-secondary)]">已保存，下次翻译时生效</p>}
        </div>
        {error && <div role="alert" className="mt-5 text-sm text-[var(--text-secondary)]"><p>{error}</p>
          {!savedLanguage && <button type="button" onClick={() => void load()} className="mt-2 min-h-11 underline underline-offset-4">重新加载</button>}
        </div>}
      </form>
      <AiTranslationSettings />
      </div>
      <div hidden={tab !== "opml"}><a href="/api/opml" download="Collect.opml" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4">导出 OPML</a><OpmlImportSettings /></div>
      </div></div>
    </div>
  </main>;
}
