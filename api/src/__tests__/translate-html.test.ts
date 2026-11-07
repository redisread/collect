import { afterEach, describe, expect, it, vi } from "vitest";
import { load } from "cheerio/slim";
import { googleTranslate, splitTranslationText, translateHtml } from "../lib/translate";

afterEach(() => vi.unstubAllGlobals());

describe("article translation", () => {
  it("preserves inline links, nested lists, media and code without duplicating originals", async () => {
    const translate = vi.fn(async (text: string) => ({ translated: "译" + text, detectedLang: "en" }));
    const result = await translateHtml('<h2>Title</h2><p>Hello <a href="https://example.com">world</a>.</p><ul><li>Parent<ul><li>Child</li></ul></li></ul><img src="https://example.com/p.png"><pre><code>const a = 1</code></pre>', "zh-CN", translate);
    const $ = load(result.bilingualHtml);
    expect($("p").length).toBe(1);
    expect($("p .translation-text").length).toBe(1);
    expect($("li > .translation-text").length).toBe(2);
    expect($("li").first().children().first().hasClass("translation-text")).toBe(true);
    expect($("a").attr("href")).toBe("https://example.com");
    expect($("img").attr("src")).toBe("https://example.com/p.png");
    expect($("pre").text()).toBe("const a = 1");
    expect(translate).not.toHaveBeenCalledWith("const a = 1");
    expect(load(result.translatedHtml)("p").text()).toBe("译Hello world.");
    expect(translate).toHaveBeenCalledWith('Hello <a href="https://example.com">world</a>.');
  });

  it("translates root text and never returns partial success", async () => {
    const result = await translateHtml("Hello", "zh-CN", async () => ({ translated: "你好", detectedLang: "en" }));
    expect(load(result.translatedHtml).text()).toBe("你好");
    expect(result.bilingualHtml).toContain("translation-text");
    await expect(translateHtml("<p>One</p><p>Two</p>", "zh-CN", async () => { throw new Error("upstream"); })).rejects.toThrow("upstream");
  });

  it("splits Unicode without losing content", () => {
    const text = "读📚".repeat(1500);
    const chunks = splitTranslationText(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every(chunk => Array.from(chunk).length <= 1200)).toBe(true);
  });

  it("keeps inline media once and excludes it from translation requests", async () => {
    const translate = vi.fn(async (text: string) => ({ translated: text, detectedLang: "en" }));
    const result = await translateHtml('<p>Hello <img src="https://example.com/a.jpg"> world</p>', "zh-CN", translate);
    expect(load(result.bilingualHtml)("img")).toHaveLength(1);
    expect(load(result.translatedHtml)("img")).toHaveLength(1);
    expect(translate.mock.calls.every(([text]) => !text.includes("<img"))).toBe(true);
  });

  it("never cuts HTML tags when a long paragraph crosses the Google chunk boundary", async () => {
    const source = "Hello world. ".repeat(100).slice(0, 1196) + '<a href="https://example.com/long-link">Read more here</a> and finish.';
    const translate = vi.fn(async (text: string) => {
      // Simulate the upstream behavior on each transport chunk, including tag corruption.
      const chunks = splitTranslationText(text);
      if (chunks.some(chunk => /<[^>]*$/.test(chunk))) throw new Error("cut tag");
      return { translated: text, detectedLang: "en" };
    });
    const result = await translateHtml("<p>" + source + "</p>", "zh-CN", translate);
    expect(load(result.translatedHtml)("a").attr("href")).toBe("https://example.com/long-link");
    expect(load(result.translatedHtml)("p").text()).toBe(load("<p>" + source + "</p>")("p").text());
  });

  it("rejects upstream failures and empty translations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
    await expect(googleTranslate("Hi", "zh-CN", "auto", new AbortController().signal)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([[]])));
    await expect(googleTranslate("Hi", "zh-CN", "auto", new AbortController().signal)).rejects.toThrow("空结果");
  });
});
