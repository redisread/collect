import { useEffect, useState } from "react";
import { applyPwaUpdate, initializePwa, usePwaStore } from "@/lib/store/pwaStore";

export function PwaInstallButton() {
  const { installPrompt, iosInstallAvailable } = usePwaStore();
  const [help, setHelp] = useState(false);
  if (!installPrompt && !iosInstallAvailable && !help) return null;
  return <div className="mx-3 my-1">
    <button className="min-h-10 w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
      onClick={async () => {
        if (!installPrompt) { setHelp(!help); return; }
        usePwaStore.setState({ installPrompt: null });
        try { await installPrompt.prompt(); await installPrompt.userChoice; }
        catch { setHelp(true); }
      }}>安装 Collect</button>
    {help && <p role="status" className="px-3 pb-2 text-xs leading-relaxed text-[var(--text-secondary)]">
      {iosInstallAvailable ? "打开浏览器的分享菜单，选择“添加到主屏幕”。" : "可在浏览器菜单中选择安装 Collect。"}
    </p>}
  </div>;
}

export function PwaUpdateNotice() {
  const { updateWorker, updating } = usePwaStore();
  useEffect(() => { void initializePwa(); }, []);
  if (!updateWorker) return null;
  return <div role="status" className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-md)]">
    <span>Collect 有新版本</span>
    <button disabled={updating} className="min-h-10 rounded-lg bg-[var(--accent-light)] px-3 text-[var(--accent)]"
      onClick={applyPwaUpdate}>{updating ? "更新中…" : "更新并刷新"}</button>
  </div>;
}
