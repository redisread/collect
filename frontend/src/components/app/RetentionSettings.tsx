import { useEffect, useState } from "react";
import { settingsRequest, type RetentionPreview } from "@/lib/reader-settings";
export function RetentionSettings() {
  const [days, setDays] = useState(30);
  const [saved, setSaved] = useState<number>();
  const [preview, setPreview] = useState<RetentionPreview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void settingsRequest<{ articleRetentionDays: number }>("/api/settings").then(value => { setDays(value.articleRetentionDays); setSaved(value.articleRetentionDays); }).catch(error => setMessage(error.message)); }, []);
  async function perform(confirm = false) {
    setBusy(true); setMessage("");
    try {
      const current = confirm ? preview! : await settingsRequest<RetentionPreview>("/api/settings/retention/preview", "POST", { days });
      if (current.days < current.previousDays && !confirm) { setPreview(current); return; }
      await settingsRequest("/api/settings/retention", "PUT", { ...current, confirmed: confirm });
      setSaved(current.days); setPreview(undefined); setMessage("保存期限已同步");
    } catch (error) { setPreview(undefined); setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  }
  return <section aria-label="文章保存期限" className="space-y-4">
    <h2 className="text-lg font-semibold">文章保存期限</h2>
    <p className="text-sm leading-6 text-[var(--text-secondary)]">从首次采集起计算，到期文章会从账号和各设备清理，包括未读文章。收藏和稍后阅读持续保留，取消保护后至少保留 7 天。</p>
    <label className="block">保存天数<select disabled={busy || saved === undefined} className="ml-3 min-h-11 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3" value={days} onChange={event => { setDays(Number(event.target.value)); setPreview(undefined); }}>
      {[7,30,60,90].map(value => <option key={value} value={value}>{value === 7 ? "一周" : `${value} 天`}</option>)}
    </select></label>
    <button disabled={busy || saved === undefined || days === saved} className="min-h-11 rounded-lg bg-[var(--brand-yellow)] px-4 text-stone-900" onClick={() => void perform()}>保存期限</button>
    {preview && <div role="alert" className="rounded-lg border border-[var(--border)] p-4">
      <p>预计立即清理 {preview.count} 篇文章。现有文章的上线过渡期仍生效。确认缩短为 {preview.days} 天？</p>
      <button disabled={busy} className="mr-4 min-h-11 text-red-600" onClick={() => void perform(true)}>确认并保存</button>
      <button disabled={busy} className="min-h-11" onClick={() => setPreview(undefined)}>取消</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
