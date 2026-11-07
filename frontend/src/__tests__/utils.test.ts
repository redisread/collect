import { describe, it, expect } from "vitest";
import { cn } from "../lib/utils/cn";
import { formatRelativeTime, formatFullDate } from "../lib/utils/date";

describe("Utility Functions", () => {
  describe("cn", () => {
    it("should merge class names correctly", () => {
      const result = cn("class1", "class2");
      expect(result).toBe("class1 class2");
    });

    it("should handle conditional classes", () => {
      const isActive = true;
      const result = cn("base", isActive && "active");
      expect(result).toBe("base active");
    });

    it("should filter out falsy values", () => {
      const result = cn("base", false && "hidden", null, undefined, "visible");
      expect(result).toBe("base visible");
    });

    it("should merge Tailwind classes correctly", () => {
      const result = cn("px-2 py-1", "px-4");
      // tailwind-merge should keep the last conflicting class
      expect(result).toContain("px-4");
    });

    it("should handle empty inputs", () => {
      const result = cn();
      expect(result).toBe("");
    });

    it("should handle array of classes", () => {
      const result = cn(["class1", "class2"]);
      expect(result).toBe("class1 class2");
    });
  });

  describe("formatRelativeTime", () => {
    it("should return empty string for null/undefined", () => {
      expect(formatRelativeTime(null)).toBe("");
      expect(formatRelativeTime(undefined)).toBe("");
      expect(formatRelativeTime("")).toBe("");
    });

    it("should return empty string for invalid date", () => {
      expect(formatRelativeTime("invalid-date")).toBe("");
    });

    it("should return 刚刚 for recent timestamps", () => {
      const now = new Date().toISOString();
      expect(formatRelativeTime(now)).toBe("刚刚");
    });

    it("should return minutes ago", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatRelativeTime(fiveMinutesAgo)).toBe("5 分钟前");
    });

    it("should return hours ago", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(twoHoursAgo)).toBe("2 小时前");
    });

    it("should return days ago", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(threeDaysAgo)).toBe("3 天前");
    });

    it("should return formatted date for older dates", () => {
      const oldDate = new Date("2024-01-15").toISOString();
      const result = formatRelativeTime(oldDate);
      // Should return date in Chinese format
      expect(result).toContain("1");
      expect(result).toContain("15");
    });
  });

  describe("formatFullDate", () => {
    it("should return empty string for null/undefined", () => {
      expect(formatFullDate(null)).toBe("");
      expect(formatFullDate(undefined)).toBe("");
      expect(formatFullDate("")).toBe("");
    });

    it("should return empty string for invalid date", () => {
      expect(formatFullDate("invalid-date")).toBe("");
    });

    it("should format date in Chinese locale", () => {
      const date = "2024-03-21T10:30:00.000Z";
      const result = formatFullDate(date);
      expect(result).toContain("2024");
      expect(result).toContain("3");
    });

    it("should include time in the output", () => {
      const date = new Date("2024-03-21T10:30:00.000Z").toISOString();
      const result = formatFullDate(date);
      // Should contain time information
      expect(result.length).toBeGreaterThan(10);
    });
  });
});
