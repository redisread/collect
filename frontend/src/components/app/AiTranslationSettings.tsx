import { useEffect, useState } from "react";
import { aiRequest, useAiSettingsStore, type AiProfile } from "@/lib/store/aiSettingsStore";

const emptyForm = { name: "", kind: "openai-compatible" as AiProfile["kind"], baseUrl: "", model: "", apiKey: "" };
const fieldClass = "mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-main)] px-3 text-base";
const buttonClass = "min-h-11 rounded-lg px-3 text-sm hover:bg-[var(--bg-card-hover)] disabled:opacity-40";

export function AiTranslationSettings() {
  const { profiles, activeProfileId, load } = useAiSettingsStore();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<AiProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError("");
    try { await load(); } catch { setError("无法加载翻译配置，请重试"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await load(); setNotice(success); }
    catch (error) { setError(error instanceof Error ? error.message : "操作失败，请重试"); }
    finally { setBusy(false); }
  }

  function edit(profile?: AiProfile) {
    setEditing(profile ?? null);
    setForm(profile ? { name: profile.name, kind: profile.kind, baseUrl: profile.baseUrl, model: profile.model, apiKey: "" } : emptyForm);
    setShowForm(true); setNotice(""); setError(""); setDeleting(null);
  }

  async function save(enable: boolean) {
    await perform(async () => {
      await aiRequest(editing ? `/api/ai-profiles/${editing.id}` : "/api/ai-profiles", editing ? "PUT" : "POST", {
        ...form, apiKey: form.apiKey || undefined, revision: editing?.revision, updatedAt: editing?.updatedAt, enable,
      });
      setShowForm(false); setForm(emptyForm); setEditing(null);
    }, enable ? "已保存并启用，下次翻译时生效" : "配置已保存");
  }

  return <section aria-labelledby="ai-settings-heading" className="mt-10 border-t border-[var(--border-light)] pt-7 pb-8">
    <h2 id="ai-settings-heading" className="text-lg font-semibold">翻译服务</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">选择 Google 或自己的 AI 服务。切换后，下次翻译时生效。</p>
    {loading ? <p role="status" className="mt-5 text-sm">正在加载配置…</p> : <>
      <label className="mt-5 block text-sm">当前使用
        <select value={activeProfileId ?? "google"} disabled={busy} className={fieldClass}
          onChange={event => {
            const profileId = event.target.value === "google" ? null : event.target.value;
            void perform(async () => { await aiRequest("/api/ai-profiles/active", "PUT", { profileId }); }, "已切换，下次翻译时生效");
          }}>
          <option value="google">Google（免费）</option>
          {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}
        </select>
      </label>
      <div className="mt-5 space-y-3">
        {profiles.map(profile => <div key={profile.id} className="rounded-xl border border-[var(--border-light)] p-4">
          <p className="break-words font-medium">{profile.name}{activeProfileId === profile.id && <span className="ml-2 text-xs text-[var(--text-secondary)]">使用中</span>}</p>
          <p className="mt-1 break-all text-sm text-[var(--text-secondary)]">{profile.model} · 密钥已配置</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <button disabled={busy} className={buttonClass} onClick={() => edit(profile)}>编辑<span className="sr-only"> {profile.name}</span></button>
            <button disabled={busy} className={buttonClass} onClick={() => void perform(async () => {
              await aiRequest(`/api/ai-profiles/${profile.id}/test`, "POST");
            }, `${profile.name} 连接成功`)}>测试连接<span className="sr-only"> {profile.name}</span></button>
            <button disabled={busy} className={buttonClass} onClick={() => setDeleting(profile.id)}>删除<span className="sr-only"> {profile.name}</span></button>
          </div>
          {deleting === profile.id && <div className="mt-2 text-sm">
            <p>删除此配置、密钥及其译文进度？当前使用此配置时将切回 Google。</p>
            <button disabled={busy} className={buttonClass + " text-red-600"} onClick={() => void perform(async () => {
              await aiRequest(`/api/ai-profiles/${profile.id}`, "DELETE"); setDeleting(null);
              if (editing?.id === profile.id) { setShowForm(false); setForm(emptyForm); setEditing(null); }
            }, "配置已删除")}>确认删除</button>
            <button disabled={busy} className={buttonClass} onClick={() => setDeleting(null)}>取消</button>
          </div>}
        </div>)}
      </div>
      <button disabled={busy} onClick={() => edit()} className={buttonClass + " mt-4 border border-[var(--border)]"}>添加 AI 配置</button>
      <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">测试连接会发送一小段示例文字，消耗少量 API 额度。</p>
    </>}
    {showForm && <form onSubmit={event => { event.preventDefault(); void save(false); }} className="mt-6 space-y-4 rounded-xl border border-[var(--border)] p-4 sm:p-5">
      <h3 className="font-medium">{editing ? "编辑 AI 配置" : "新增 AI 配置"}</h3>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">服务类型<select className={fieldClass} value={form.kind} onChange={event => {
          const kind = event.target.value as AiProfile["kind"];
          setForm({ ...form, kind, apiKey: "", ...(kind === "deepseek" ? {
            name: form.name || "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash",
          } : {}) });
        }}><option value="openai-compatible">自定义（OpenAI 兼容）</option><option value="deepseek">DeepSeek 快捷配置</option></select></label>
        <label className="block text-sm">配置名称<input required maxLength={60} className={fieldClass} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如 日常阅读" /></label>
        <label className="block text-sm">API 地址<input required type="url" maxLength={500} className={fieldClass} value={form.baseUrl} readOnly={form.kind === "deepseek"} onChange={event => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></label>
        <p className="text-xs text-[var(--text-tertiary)]">填写公网 HTTPS 基础地址，系统会调用其 Chat Completions 接口。更换地址时需要重新填写密钥。</p>
        <label className="block text-sm">模型名称<input required maxLength={120} className={fieldClass} value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label>
        <label className="block text-sm">API key<input required={!editing || form.baseUrl !== editing.baseUrl} type="password" autoComplete="new-password" maxLength={4096} className={fieldClass} value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} placeholder={editing ? "留空保留已有密钥" : "输入服务商提供的密钥"} /></label>
        <p className="text-xs leading-5 text-[var(--text-secondary)]">密钥加密保存，网页与 PWA 共用。文章会发送至所选服务商，使用你的 API 额度。</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass + " bg-[var(--brand-yellow)] text-stone-900"}>{busy ? "正在保存…" : "保存配置"}</button>
          {!editing && <button type="button" className={buttonClass} onClick={event => {
            if (event.currentTarget.form?.reportValidity()) void save(true);
          }}>保存并启用</button>}
          <button type="button" className={buttonClass} onClick={() => { setShowForm(false); setForm(emptyForm); setEditing(null); }}>取消</button>
        </div>
      </fieldset>
    </form>}
    {busy && <p role="status" className="mt-4 text-sm">正在处理，请稍候…</p>}
    {notice && <p role="status" className="mt-4 text-sm">{notice}</p>}
    {error && <div role="alert" className="mt-4 text-sm"><p>{error}</p><button disabled={busy} onClick={() => void reload()} className={buttonClass + " underline"}>重新加载配置</button></div>}
  </section>;
}
