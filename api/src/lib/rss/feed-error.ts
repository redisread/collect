export type FeedErrorCode = "http_transient" | "http_permanent" | "network" | "invalid_feed" | "blocked_feed";

/** Safe codes only: upstream response bodies and URLs must never enter task logs. */
export class FeedFetchError extends Error {
  constructor(readonly code: FeedErrorCode, readonly retryable: boolean, readonly retryAfterSeconds = 60, message: string = code) {
    super(message);
  }
}

export function retryAfterSeconds(value: string | null): number {
  const numeric = value && /^\d+$/.test(value) ? Number(value) : NaN;
  const seconds = Number.isFinite(numeric) ? numeric : value ? (Date.parse(value) - Date.now()) / 1000 : 60;
  return Math.min(900, Math.max(60, Number.isFinite(seconds) ? Math.ceil(seconds) : 60));
}
