import { sanitizeHtml } from "./sanitize";

/** Only suppress a redundant cover when the first rendered image has the same URL. */
export function hasMatchingLeadImage(content: string, cover?: string | null, articleUrl?: string): boolean {
  if (!cover || !content || typeof DOMParser === "undefined") return false;
  const document = new DOMParser().parseFromString(sanitizeHtml(content), "text/html");
  const source = document.querySelector("img")?.getAttribute("src");
  if (!source) return false;
  try {
    return new URL(source, articleUrl).href === new URL(cover, articleUrl).href;
  } catch {
    return false;
  }
}
