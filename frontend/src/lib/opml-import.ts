export interface ImportSummary {
  id: string;
  fileName: string;
  status: "preview" | "running" | "completed";
  createdAt: number;
}
export interface ImportJob extends ImportSummary {
  total: number;
  folderCount: number;
  imported: number;
  skipped: number;
  failed: number;
  pending: number;
  ready: number;
  items: { id: string; title: string; feedUrl: string; folderName: string | null;
    status: "ready" | "pending" | "processing" | "imported" | "skipped" | "failed"; message: string | null }[];
}

export async function opmlRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 30_000);
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  try {
    const response = await fetch("/api/opml" + path, { credentials: "include", cache: "no-store", ...options, signal: controller.signal });
    const result = await response.json().catch(() => null) as { success: boolean; data: T; error?: string } | null;
    if (!response.ok || !result?.success) throw new Error(typeof result?.error === "string" ? result.error : "导入请求失败，请稍后重试");
    return result.data;
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) throw new Error("请求超时，请重新读取任务确认结果");
    throw error;
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
}

export async function readOpmlFile(file: File) {
  if (!/\.(opml|xml)$/i.test(file.name)) throw new Error("请选择 .opml 或 .xml 文件");
  if (file.size > 2 * 1024 * 1024) throw new Error("文件不能超过 2 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" :
    bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error("文件编码无法读取，请重新导出 UTF-8 格式的 OPML"); }
  if (!text.trim()) throw new Error("文件内容为空");
  return text;
}
