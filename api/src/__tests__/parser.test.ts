import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseFeed, discoverFeedUrl, extractSummary, extractFirstImage } from "../src/lib/rss/parser";

// Mock rss-parser
vi.mock("rss-parser", () => {
  return {
    default: class MockParser {
      parseURL = vi.fn();
      constructor() {}
    },
  };
});

describe("RSS Parser", () => {
  describe("extractSummary", () => {
    it("should extract plain text from HTML", () => {
      const html = "<p>This is a <strong>test</strong> paragraph.</p>";
      const result = extractSummary(html, 100);
      expect(result).toBe("This is a test paragraph.");
    });

    it("should truncate text longer than maxLength", () => {
      const html = "<p>This is a very long text that should be truncated because it exceeds the maximum length allowed.</p>";
      const result = extractSummary(html, 20);
      expect(result).toContain("…");
      expect(result.length).toBeLessThanOrEqual(22);
    });

    it("should return empty string for empty input", () => {
      expect(extractSummary("")).toBe("");
      expect(extractSummary(null as unknown as string)).toBe("");
    });
  });

  describe("extractFirstImage", () => {
    it("should extract first image URL from HTML", () => {
      const html = '<p>Some text</p><img src="https://example.com/image.jpg" alt="test"><p>More text</p>';
      const result = extractFirstImage(html);
      expect(result).toBe("https://example.com/image.jpg");
    });

    it("should return null for HTML without images", () => {
      const html = "<p>Some text without images</p>";
      const result = extractFirstImage(html);
      expect(result).toBeNull();
    });

    it("should handle single quotes in img src", () => {
      const html = "<img src='https://example.com/image.png'>";
      const result = extractFirstImage(html);
      expect(result).toBe("https://example.com/image.png");
    });

    it("should return null for empty input", () => {
      expect(extractFirstImage("")).toBeNull();
      expect(extractFirstImage(null as unknown as string)).toBeNull();
    });
  });

  describe("discoverFeedUrl", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it("should discover RSS feed from HTML link tag", async () => {
      const html = `
        <html>
          <head>
            <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="RSS Feed">
          </head>
        </html>
      `;
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: () => Promise.resolve(html),
      });

      const result = await discoverFeedUrl("https://example.com");
      expect(result).toBe("https://example.com/feed.xml");
    });

    it("should discover Atom feed from HTML link tag", async () => {
      const html = `
        <html>
          <head>
            <link rel="alternate" type="application/atom+xml" href="/atom.xml">
          </head>
        </html>
      `;
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: () => Promise.resolve(html),
      });

      const result = await discoverFeedUrl("https://example.com");
      expect(result).toBe("https://example.com/atom.xml");
    });

    it("should return null when no feed is found", async () => {
      const html = "<html><head></head><body>No feed here</body></html>";
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: () => Promise.resolve(html),
      });

      const result = await discoverFeedUrl("https://example.com");
      expect(result).toBeNull();
    });

    it("should return null on fetch error", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

      const result = await discoverFeedUrl("https://example.com");
      expect(result).toBeNull();
    });
  });
});
