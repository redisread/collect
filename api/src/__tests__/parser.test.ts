import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseFeed, discoverFeedUrl } from "../lib/rss/parser";

// Mock rss-parser
vi.mock("rss-parser", () => {
  return {
    default: class MockParser {
      parseURL = vi.fn();
      parseString = vi.fn();
      constructor() {}
    },
  };
});

describe("RSS Parser", () => {
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
