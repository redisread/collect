// The user-approved fallback calls Google's public endpoint without application credentials.
// Successful segments stay in memory so a retry can resume after an upstream failure.
const successfulSegments = new Map<string, { translated: string; detectedLang: string }>();

export async function translateInBrowser(content: string, targetLang: string, signal: AbortSignal) {
  const { googleTranslate, translateHtml } = await import("../../../api/src/lib/translate");
  const result = await translateHtml(content, targetLang, async text => {
    signal.throwIfAborted();
    const key = JSON.stringify([targetLang, text]);
    const cached = successfulSegments.get(key);
    if (cached) return cached;
    const translated = await googleTranslate(text, targetLang, "auto", signal, 30_000);
    if (successfulSegments.size >= 500) successfulSegments.delete(successfulSegments.keys().next().value!);
    successfulSegments.set(key, translated);
    return translated;
  }, 2);
  return { ...result, targetLang, timestamp: Date.now() };
}
