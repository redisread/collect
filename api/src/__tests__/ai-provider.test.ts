import { afterEach, expect, it, vi } from "vitest";
import { decryptApiKey, encryptApiKey, isPublicAddress, normalizeProviderUrl, requestAiTranslation, validateProviderDestination } from "../lib/ai-provider";
import { createTranslationPlan, renderTranslationPlan, translateInlineHtml } from "../lib/translate";

afterEach(() => vi.unstubAllGlobals());

it("encrypts keys with a fresh IV and binds decryption to their owner and profile", async () => {
  const secret = btoa("x".repeat(32));
  const first = await encryptApiKey("secret-provider-key", secret, "owner:profile");
  const second = await encryptApiKey("secret-provider-key", secret, "owner:profile");
  expect(first).not.toBe(second);
  expect(first).not.toContain("secret-provider-key");
  expect(await decryptApiKey(first, secret, "owner:profile")).toBe("secret-provider-key");
  await expect(decryptApiKey(first, secret, "other:profile")).rejects.toThrow();
});

it("rejects unsafe endpoints and DNS answers before sending any credentials", async () => {
  for (const url of ["http://api.deepseek.com", "https://user:pass@api.deepseek.com", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://api.local", "https://api.deepseek.com?key=x"]) {
    expect(() => normalizeProviderUrl(url)).toThrow();
  }
  expect(normalizeProviderUrl("https://api.deepseek.com/chat/completions")).toBe("https://api.deepseek.com");
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.1.1", "192.168.0.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fe80::1", "fd00::1"]) expect(isPublicAddress(ip)).toBe(false);
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ Status: 0, Answer: [{ type: 1, data: "127.0.0.1" }] }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(validateProviderDestination("https://api.deepseek.com", new AbortController().signal)).rejects.toThrow("公网");
  expect(fetchMock.mock.calls.every(call => String(call[0]).startsWith("https://cloudflare-dns.com/"))).toBe(true);
});

it("uses the DeepSeek preset and rejects truncated or empty completions", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: "你好" } }] }));
  vi.stubGlobal("fetch", fetchMock);
  const profile = { kind: "deepseek", model: "deepseek-flash" };
  const call = () => requestAiTranslation(profile, "https://api.deepseek.com/chat/completions", "key", "Hello", "zh-CN", "Context", new AbortController().signal);
  expect((await call()).translated).toBe("你好");
  const options = fetchMock.mock.calls[0][1];
  expect(options.redirect).toBe("manual");
  expect(JSON.parse(options.body)).toMatchObject({ thinking: { type: "disabled" }, stream: false });
  fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "length", message: { content: "partial" } }] }));
  await expect(call()).rejects.toThrow("不完整");
  fetchMock.mockResolvedValue(new Response("provider secret detail", { status: 401 }));
  await expect(call()).rejects.toThrow("密钥无效");
});

it("renders partial bilingual output and bounds long text into resumable runs", async () => {
  const content = '<p>Hello <em>world</em></p><p>' + "Long text ".repeat(400) + '</p><img src="https://example.com/image.png"><pre>code</pre>';
  const plan = createTranslationPlan(content, "zh-CN", 1200);
  expect(plan.jobs.length).toBeGreaterThan(3);
  expect(plan.jobs.every(job => job.length <= 1300)).toBe(true);
  const first = await translateInlineHtml(plan.jobs[0], async () => ({ translated: '你好 <em onclick="bad()">世界</em>', detectedLang: "en" }));
  const partial = renderTranslationPlan(plan, [first]);
  expect(partial.segments).toHaveLength(1);
  expect(partial.segments[0].translated).toContain("你好");
  expect(partial.bilingualHtml).toContain("Long text");
  expect(partial.bilingualHtml).not.toContain("onclick");
  expect(partial.translatedHtml).toContain('<img src="https://example.com/image.png">');
  expect(partial.translatedHtml).toContain("<pre>code</pre>");
});
