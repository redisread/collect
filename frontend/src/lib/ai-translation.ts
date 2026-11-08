import type { TranslationResult } from "./types";
import { aiRequest, type AiProfile } from "./store/aiSettingsStore";

export interface AiProgress extends TranslationResult {
  id: string;
  completed: number;
  total: number;
  complete: boolean;
  progressVersion?: string;
  failed?: number;
  pending?: number;
  halted?: string;
  profileId: string;
  revision: string;
}

export function aiCacheKey(articleId: string, language: string, profile: AiProfile) {
  return `${articleId}:${language}:ai:${profile.id}:${profile.revision}`;
}

export async function loadAiProgress(articleId: string, content: string, targetLang: string, profile: AiProfile, restoreOnly: boolean) {
  return aiRequest<AiProgress | null>("/api/ai-translate/start", "POST", {
    articleId, content, targetLang, profileId: profile.id, revision: profile.revision, restoreOnly,
  });
}

export async function continueAiTranslation(progress: AiProgress, onProgress: (progress: AiProgress) => void, signal: AbortSignal) {
  let current = progress;
  let retryFailed = !!progress.failed;
  while (!current.complete) {
    if (signal.aborted || document.visibilityState === "hidden") return false;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timeout = setTimeout(cancel, 65_000);
    try {
      current = await aiRequest<AiProgress>(`/api/ai-translate/${current.id}/step`, "POST", { completed: current.completed, ...(current.progressVersion ? { progressVersion: current.progressVersion, retryFailed } : {}) }, controller.signal);
      retryFailed = false;
      onProgress(current);
      if (current.halted) throw new Error(current.halted);
      if (signal.aborted || (current.pending === 0 && current.failed)) return false;
    } finally {
      clearTimeout(timeout);
    }
  }
  return true;
}
