import { TranslationError, type TranslatedRun } from "./translate";

export interface AiRunState {
  version: 1;
  runs: (TranslatedRun | null)[];
  failed: number[];
  concurrency: number;
  halted?: string;
}

export function readAiRunState(encoded: string): AiRunState {
  const value = JSON.parse(encoded) as AiRunState | TranslatedRun[];
  return Array.isArray(value) ? { version: 1, runs: value, failed: [], concurrency: 3 } : value;
}

export function pendingRuns(state: AiRunState, total: number): number[] {
  return Array.from({ length: total }, (_, index) => index).filter(index => !state.runs[index] && !state.failed.includes(index));
}

export function isTemporaryAiError(error: unknown): boolean {
  return error instanceof TranslationError && (error.code === "provider_network" || error.code === "provider_dns" ||
    error.upstreamStatus === 429 || error.upstreamStatus === 408 || (error.upstreamStatus ?? 0) >= 500);
}

/** A batch is bounded to the already-started segments, so the client can pause between batches. */
export async function translateAiBatch(state: AiRunState, indices: number[], translate: (index: number) => Promise<TranslatedRun>,
  save: () => Promise<void>, signal: AbortSignal, retries = 2,
  delay: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))) {
  let retryTail: Promise<unknown> = Promise.resolve();
  await Promise.all(indices.map(async index => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (state.halted || signal.aborted) return;
        let result: TranslatedRun;
        if (attempt && state.concurrency === 1) {
          const run = retryTail.then(() => {
            if (state.halted || signal.aborted) throw new TranslationError("provider_network", "翻译已暂停");
            return translate(index);
          });
          retryTail = run.catch(() => {});
          result = await run;
        } else result = await translate(index);
        state.runs[index] = result;
        await save();
        return;
      } catch (error) {
        if (error instanceof TranslationError && error.upstreamStatus === 429) state.concurrency = 1;
        const temporary = isTemporaryAiError(error);
        if (temporary && attempt < retries && !signal.aborted && !state.halted) {
          await delay(500 * 2 ** attempt);
          continue;
        }
        if (!state.runs[index]) state.failed.push(index);
        if (!temporary) state.halted = error instanceof TranslationError ? error.message : "AI 翻译失败，请检查服务配置后继续";
        await save();
        return;
      }
    }
  }));
}
