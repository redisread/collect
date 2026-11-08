import { expect, it } from "vitest";
import { hasMatchingLeadImage } from "../lib/utils/article-image";

it("matches the first rendered image while preserving source markup and captions", () => {
  const html = '<figure><img src="/cover.jpg?a=1&amp;b=2"><figcaption>画作</figcaption></figure>';
  expect(hasMatchingLeadImage(html, "https://example.com/cover.jpg?a=1&b=2", "https://example.com/post")).toBe(true);
  expect(html).toContain("<figcaption>画作</figcaption>");
});
it("keeps a cover when the first image differs or content is empty", () => {
  expect(hasMatchingLeadImage('<img src="https://example.com/other.jpg"><img src="https://example.com/cover.jpg">', "https://example.com/cover.jpg")).toBe(false);
  expect(hasMatchingLeadImage("<p>正文</p>", "https://example.com/cover.jpg")).toBe(false);
  expect(hasMatchingLeadImage('<img src="javascript:bad">', "javascript:bad")).toBe(false);
});

it("compares relative images against the reader page origin used by the browser", () => {
  const html = '<img src="/cover.jpg">';
  const rendered = document.createElement("div");
  rendered.innerHTML = html;
  const actualImageUrl = rendered.querySelector("img")!.src;
  expect(hasMatchingLeadImage(html, actualImageUrl)).toBe(true);
  expect(hasMatchingLeadImage(html, "https://publisher.test/cover.jpg")).toBe(false);
  expect(hasMatchingLeadImage(html, "https://publisher.test/cover.jpg", "https://collect.test/")).toBe(false);
  expect(hasMatchingLeadImage(html, "https://collect.test/cover.jpg", "https://collect.test/")).toBe(true);
});
