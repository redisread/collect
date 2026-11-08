export interface ReaderProfile { id: string; name: string; email: string; image: string | null }
export interface RetentionPreview { days: number; previousDays: number; count: number }
export async function settingsRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, credentials: "include", cache: "no-store", signal: AbortSignal.timeout(30_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  const result = await response.json() as { success: boolean; data: T; error?: string };
  if (!response.ok || !result.success) throw new Error(result.error || "操作失败，请重试");
  return result.data;
}
