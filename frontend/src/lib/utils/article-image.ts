import { sanitizeHtml } from "./sanitize";

/** Only suppress a redundant cover when the first rendered image has the same URL. */
export function hasMatchingLeadImage(content: string, cover?: string | null, baseUrl = globalThis.document?.baseURI): boolean {
  if (!cover || !content || typeof DOMParser === "undefined") return false;
  const parsed = new DOMParser().parseFromString(sanitizeHtml(content), "text/html");
  const source = parsed.querySelector("img")?.getAttribute("src");
  if (!source) return false;
  try {
    return new URL(source, baseUrl).href === new URL(cover, baseUrl).href;
  } catch {
    return false;
  }
}
