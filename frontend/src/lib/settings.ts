import { SUPPORTED_LANG_CODES } from "../../../api/src/config/languages";

export async function readTranslationLanguage(): Promise<string> {
  const response = await fetch("/api/settings", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  return parseLanguage(response);
}

export async function saveTranslationLanguage(targetLanguage: string): Promise<string> {
  const response = await fetch("/api/settings/translation", {
    method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetLanguage }), signal: AbortSignal.timeout(10_000),
  });
  return parseLanguage(response);
}

async function parseLanguage(response: Response): Promise<string> {
  const result = await response.json() as { success?: boolean; data?: { translationTargetLanguage?: string } };
  const language = result.data?.translationTargetLanguage;
  if (!response.ok || !result.success || !language || !SUPPORTED_LANG_CODES.has(language)) {
    throw new Error("无法同步个人设置，请检查网络后重试");
  }
  return language;
}
