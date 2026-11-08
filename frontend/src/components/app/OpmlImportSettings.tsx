import { useEffect, useRef, useState } from "react";
import { opmlRequest, readOpmlFile, type ImportJob, type ImportSummary } from "@/lib/opml-import";
import { useFeedStore } from "@/lib/store/feedStore";
import { useArticleStore } from "@/lib/store/articleStore";

const labels = { ready: "待导入", pending: "等待抓取", processing: "正在抓取", imported: "已新增", skipped: "已跳过", failed: "失败" };
const jobLabels = { preview: "待确认", running: "导入中", completed: "已完成" };
const buttonClass = "min-h-11 rounded-lg px-4 text-sm disabled:opacity-40 hover:bg-[var(--bg-card-hover)]";

export function OpmlImportSettings() {
  const [jobs, setJobs] = useState<ImportSummary[]>([]);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  async function showJob(id: string) {
    const request = ++requestId.current;
    setBusy(true); setError(""); setJob(null);
    try {
      const result = await opmlRequest<ImportJob>(`/jobs/${id}`);
      if (request === requestId.current) setJob(result);
    } catch (error) { if (request === requestId.current) setError(error instanceof Error ? error.message : "无法读取导入任务"); }
    finally { if (request === requestId.current) setBusy(false); }
  }

  async function loadJobs() {
    const request = ++requestId.current;
    setBusy(true); setError("");
    try {
      const result = await opmlRequest<ImportSummary[]>("/jobs");
      if (request !== requestId.current) return;
      setJobs(result);
      if (result[0]) await showJob(result[0].id);
    } catch { if (request === requestId.current) setError("无法读取导入记录，请重试"); }
    finally { if (request === requestId.current) setBusy(false); }
  }

  useEffect(() => { void loadJobs(); return () => { ++requestId.current; }; }, []);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const id = job.id;
    const request = requestId.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await opmlRequest<ImportJob>(`/jobs/${id}`, { signal: controller.signal });
        if (!controller.signal.aborted && request === requestId.current) { setJob(result); setError(""); }
      } catch {
        if (!controller.signal.aborted && request === requestId.current) setError("暂时无法获取进度，后台任务会继续处理");
      } finally { if (!controller.signal.aborted && request === requestId.current) timer = setTimeout(poll, 4000); }
    }
    timer = setTimeout(poll, 1500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!job || job.status !== "completed") return;
    setJobs(previous => previous.map(item => item.id === job.id ? job : item));
    const feeds = useFeedStore.getState();
    void Promise.all([feeds.fetchFeeds(), feeds.fetchFolders(), useArticleStore.getState().fetchArticles(feeds.selectedSource, false)])
      .catch(() => {});
  }, [job?.id, job?.status]);

  async function preview(file: File) {
    const request = ++requestId.current;
    setJob(null); setBusy(true); setError("");
    try {
      const text = await readOpmlFile(file);
      if (request !== requestId.current) return;
      const result = await opmlRequest<ImportJob>(`/preview?fileName=${encodeURIComponent(file.name)}`, {
        method: "POST", headers: { "Content-Type": "application/xml" }, body: text,
      });
      if (request !== requestId.current) return;
      setJob(result); setJobs(previous => [result, ...previous].slice(0, 20));
    } catch (error) { if (request === requestId.current) setError(error instanceof Error ? error.message : "文件读取失败"); }
    finally { if (request === requestId.current) setBusy(false); }
  }

  async function confirm() {
    if (!job) return;
    const request = ++requestId.current;
    setBusy(true); setError("");
    try {
      const result = await opmlRequest<ImportJob>(`/jobs/${job.id}/confirm`, { method: "POST" });
      if (request === requestId.current) { setJob(result); setJobs(previous => previous.map(item => item.id === result.id ? result : item)); }
    } catch (error) { if (request === requestId.current) setError(error instanceof Error ? error.message : "启动导入失败，请重试"); }
    finally { if (request === requestId.current) setBusy(false); }
  }

  return <section aria-labelledby="opml-heading" className="mt-8 border-t border-[var(--border-light)] pt-7 pb-8">
    <h2 id="opml-heading" className="text-lg font-semibold">订阅导入</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">从其他阅读器导入 OPML 订阅列表。先预览，确认后开始导入。</p>
    <label className="mt-5 block text-sm">选择订阅列表文件
      <input type="file" accept=".opml,.xml,text/xml,application/xml,text/x-opml" disabled={busy}
        className="mt-2 block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-[var(--accent-light)] file:px-4 file:text-[var(--text-primary)]"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void preview(file); }} />
    </label>
    <p className="mt-2 text-xs text-[var(--text-tertiary)]">支持 .opml / .xml，每次最多 2 MB、1000 个订阅源。</p>
    {jobs.length > 0 && <label className="mt-5 block text-sm">最近的导入任务
      <select value={job?.id ?? ""} disabled={busy} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-main)] px-3"
        onChange={event => void showJob(event.target.value)}>
        {!job && <option value="" disabled>选择任务</option>}
        {jobs.map(item => <option key={item.id} value={item.id}>{item.fileName} · {jobLabels[item.status]} · {new Date(item.createdAt).toLocaleString()}</option>)}
      </select>
    </label>}
    {busy && <p role="status" className="mt-4 text-sm">正在处理，请稍候…</p>}
    {error && <div role="alert" className="mt-4 text-sm"><p>{error}</p><button disabled={busy} className={buttonClass + " underline"} onClick={() => void loadJobs()}>重新读取任务</button></div>}
    {job && <div className="mt-5 rounded-xl border border-[var(--border)] p-4">
      <h3 className="break-all font-medium">{job.fileName} · {jobLabels[job.status]}</h3>
      <p className="mt-2 text-sm">文件含 {job.total} 个订阅条目，{job.folderCount} 个文件夹</p>
      <p role="status" className="mt-2 text-sm text-[var(--text-secondary)]">{job.status === "preview" ? `可新增 ${job.ready}` : `已新增 ${job.imported}`} · 跳过 {job.skipped} · 失败 {job.failed}{job.status === "running" ? ` · 待处理 ${job.pending}` : ""}</p>
      {job.status === "preview" && <>
        <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">重复项会跳过，多层目录按完整路径建立文件夹。抓取成功后才保存订阅，失败项不导入。</p>
        <button disabled={busy || job.ready === 0} onClick={() => void confirm()} className={buttonClass + " mt-4 bg-[var(--brand-yellow)] text-stone-900"}>确认导入</button>
      </>}
      {job.status === "running" && <>
        <progress aria-label="导入进度" className="mt-4 w-full accent-[var(--brand-yellow)]" value={job.imported + job.skipped + job.failed} max={job.total} />
        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">后台正在逐条抓取，关闭页面后会继续。稍后可在这里查看结果。</p>
      </>}
      <details className="mt-4"><summary className="cursor-pointer py-2 text-sm">查看条目明细</summary>
        <ul className="max-h-80 overflow-y-auto divide-y divide-[var(--border-light)]">
          {job.items.map(item => <li key={item.id} className="py-3 text-sm">
            <p className="break-words font-medium">{item.title} · {labels[item.status]}</p>
            <p className="mt-1 break-all text-xs text-[var(--text-tertiary)]">{item.feedUrl || "缺少订阅地址"}</p>
            <p className="mt-1 break-words text-xs text-[var(--text-secondary)]">{item.folderName || "未分类"}{item.message ? ` · ${item.message}` : ""}</p>
          </li>)}
        </ul>
      </details>
    </div>}
  </section>;
}
