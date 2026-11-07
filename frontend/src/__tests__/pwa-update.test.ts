import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup(state: ServiceWorkerState) {
  const reload = vi.fn();
  const windowEvents = new EventTarget();
  const worker = { state, postMessage: vi.fn() };
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: {} as ServiceWorker,
    register: vi.fn().mockResolvedValue(Object.assign(new EventTarget(), { waiting: worker })),
  });
  vi.stubGlobal("window", {
    location: { reload }, matchMedia: () => ({ matches: false }),
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
  });
  vi.stubGlobal("navigator", { serviceWorker, userAgent: "Chrome", maxTouchPoints: 0 });
  vi.spyOn(document, "addEventListener").mockImplementation(() => {});
  const module = await import("../lib/store/pwaStore");
  await module.initializePwa();
  return { ...module, reload, worker, serviceWorker };
}

it("activates a waiting update and reloads when the controller changes", async () => {
  const { applyPwaUpdate, worker, serviceWorker, reload } = await setup("installed");
  applyPwaUpdate();
  expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  serviceWorker.dispatchEvent(new Event("controllerchange"));
  expect(reload).toHaveBeenCalledOnce();
});

it("reloads directly when another tab has already activated the update", async () => {
  const { applyPwaUpdate, worker, serviceWorker, reload, usePwaStore } = await setup("installed");
  worker.state = "activated";
  serviceWorker.controller = worker as unknown as ServiceWorker;
  serviceWorker.dispatchEvent(new Event("controllerchange"));
  expect(reload).not.toHaveBeenCalled();
  applyPwaUpdate();
  expect(reload).toHaveBeenCalledOnce();
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(usePwaStore.getState().updating).toBe(false);
});
