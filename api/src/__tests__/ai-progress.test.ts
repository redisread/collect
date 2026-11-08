import { expect, it, vi } from "vitest";
import { pendingRuns, readAiRunState, translateAiBatch } from "../lib/ai-progress";
import { renderTranslationPlan, createTranslationPlan, TranslationError } from "../lib/translate";

it("reads legacy progress and renders sparse results in source order", () => {
  const run = { html: "一", text: "一", detectedLang: "auto" };
  const state = readAiRunState(JSON.stringify([run]));
  expect(pendingRuns(state, 3)).toEqual([1, 2]);
  state.runs[2] = { ...run, html: "三", text: "三" };
  state.failed = [1];
  const rendered = renderTranslationPlan(createTranslationPlan("<p>one</p><p>two</p><p>three</p>", "zh-CN"), state.runs);
  expect(rendered.segments.map(item => item.translated)).toEqual(["一", "三"]);
  expect(rendered.translatedHtml).toContain("two");
});

it("starts three runs concurrently and saves out-of-order successes independently", async () => {
  const state = readAiRunState("[]");
  const resolves: ((value: { html: string; text: string; detectedLang: string }) => void)[] = [];
  const save = vi.fn().mockResolvedValue(undefined);
  const pending = translateAiBatch(state, [0, 1, 2], () => new Promise(resolve => resolves.push(resolve)), save, new AbortController().signal);
  expect(resolves).toHaveLength(3);
  resolves[2]({ html: "three", text: "three", detectedLang: "auto" });
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(state.runs[2]?.text).toBe("three");
  resolves[0]({ html: "one", text: "one", detectedLang: "auto" });
  resolves[1]({ html: "two", text: "two", detectedLang: "auto" });
  await pending;
  expect(state.runs.map(run => run?.text)).toEqual(["one", "two", "three"]);
});

it("backs off twice, reduces concurrency on rate limits and keeps failures retryable", async () => {
  const state = readAiRunState("[]");
  const translate = vi.fn().mockRejectedValue(new TranslationError("provider_http", "limited", 429));
  const delay = vi.fn().mockResolvedValue(undefined);
  await translateAiBatch(state, [0], translate, async () => {}, new AbortController().signal, 2, delay);
  expect(translate).toHaveBeenCalledTimes(3);
  expect(delay.mock.calls).toEqual([[500], [1000]]);
  expect(state.concurrency).toBe(1);
  expect(state.failed).toEqual([0]);
  expect(state.halted).toBeUndefined();
});

it("halts on exhausted credit without retrying and keeps successful results", async () => {
  const state = readAiRunState('[{"html":"done","text":"done","detectedLang":"auto"}]');
  const translate = vi.fn().mockRejectedValue(new TranslationError("provider_quota", "额度不足", 402));
  await translateAiBatch(state, [1], translate, async () => {}, new AbortController().signal);
  expect(translate).toHaveBeenCalledOnce();
  expect(state.halted).toBe("额度不足");
  expect(state.runs[0]?.text).toBe("done");
});
