import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { settingsRequest, type ReaderProfile } from "@/lib/reader-settings";

export function ProfileSettings() {
  const [profile, setProfile] = useState<ReaderProfile>();
  const [name, setName] = useState("");
  const [source, setSource] = useState<ImageBitmap>();
  const [position, setPosition] = useState(50);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void settingsRequest<ReaderProfile>("/api/profile").then(value => { setProfile(value); setName(value.name); }).catch(error => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!source) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return;
    const side = Math.min(source.width, source.height);
    context.drawImage(source, (source.width - side) * position / 100, (source.height - side) * position / 100, side, side, 0, 0, 512, 512);
    setPreview(canvas.toDataURL("image/png"));
    return () => { canvas.width = canvas.height = 0; };
  }, [source, position]);
  useEffect(() => () => source?.close(), [source]);

  async function save(action: () => Promise<ReaderProfile>) {
    setBusy(true); setMessage("");
    try { const value = await action(); setProfile(value); setName(value.name); await authClient.getSession({ query: { disableCookieCache: true } }); setMessage("已保存"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  }
  return <section aria-label="个人资料" className="space-y-5">
    <h2 className="text-lg font-semibold">个人资料</h2>
    {profile && <>
      <p className="text-sm text-[var(--text-secondary)]">{profile.email}</p>
      {profile.image && <img src={profile.image} alt="当前头像" width="80" height="80" className="rounded-full" />}
      <label className="block">显示名称<input className="mt-2 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3" maxLength={40} value={name} onChange={event => setName(event.target.value)} /></label>
      <button disabled={busy || !name.trim()} className="min-h-11 rounded-lg bg-[var(--brand-yellow)] px-4 text-stone-900" onClick={() => void save(() => settingsRequest("/api/profile", "PUT", { name }))}>保存名称</button>
      <label className="block">更新头像<input className="mt-2 block max-w-full" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error("请选择 10 MB 以内的图片");
          const image = await createImageBitmap(file);
          setPosition(50); setSource(image); setMessage("");
        } catch { setMessage("无法读取图片，请选择 10 MB 以内的 PNG、JPEG 或 WebP 图片"); }
        event.target.value = "";
      }} /></label>
      {source && preview && <div className="space-y-3">
        <img src={preview} alt="正方形裁剪预览" width="192" height="192" />
        <label className="block">裁剪位置<input className="ml-3" type="range" min={0} max={100} value={position} onChange={event => setPosition(Number(event.target.value))} /></label>
        <button disabled={busy} className="min-h-11 rounded-lg border border-[var(--border)] px-4" onClick={() => void save(async () => {
          const bytes = await (await fetch(preview)).blob();
          if (bytes.size > 1_048_576) throw new Error("裁剪后的头像超过 1 MB，请选择其他图片");
          const response = await fetch("/api/profile/avatar", { method: "POST", credentials: "include", body: bytes, headers: { "Content-Type": "image/png" } });
          const result = await response.json() as { success: boolean; data: ReaderProfile; error?: string };
          if (!response.ok || !result.success) throw new Error(result.error || "头像上传失败");
          setSource(undefined); setPreview(""); return result.data;
        })}>保存头像</button>
      </div>}
      {profile.image && <button disabled={busy} className="block min-h-11 text-red-600" onClick={() => void save(() => settingsRequest("/api/profile/avatar", "DELETE"))}>移除头像</button>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
