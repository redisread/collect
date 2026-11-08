import { create } from "zustand";

export interface AiProfile {
  id: string;
  name: string;
  kind: "deepseek" | "openai-compatible";
  baseUrl: string;
  model: string;
  revision: string;
  updatedAt: string;
  hasKey: boolean;
}
interface AiSettings {
  profiles: AiProfile[];
  activeProfileId: string | null;
  load: () => Promise<void>;
}

export async function aiRequest<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method, credentials: "include", cache: "no-store", signal: signal ?? AbortSignal.timeout(65_000),
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json() as { success: boolean; data: T; error?: string };
  if (!response.ok || !result.success) throw new Error(typeof result.error === "string" ? result.error : "请求失败，请检查配置后重试");
  return result.data;
}

let loadId = 0;
export const useAiSettingsStore = create<AiSettings>(set => ({
  profiles: [], activeProfileId: null,
  load: async () => {
    const id = ++loadId;
    const result = await aiRequest<{ profiles: AiProfile[]; activeProfileId: string | null }>("/api/ai-profiles");
    if (id === loadId) set(result);
  },
}));
