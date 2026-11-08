import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Modal } from "../components/app/common/Modal";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("opens a named modal, handles native cancel and restores focus when unmounted", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no top-layer implementation; browser smoke covers native focus containment.
  const show = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: show });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
  const trigger = document.createElement("button");
  const container = document.createElement("div");
  document.body.appendChild(trigger);
  document.body.appendChild(container);
  trigger.focus();
  const close = vi.fn();
  const root = createRoot(container);
  await act(async () => root.render(<Modal title="添加订阅源" onClose={close}><input aria-label="地址" /></Modal>));
  const dialog = document.querySelector("dialog")!;
  expect(show).toHaveBeenCalledOnce();
  expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("添加订阅源");
  const cancel = new Event("cancel", { cancelable: true });
  await act(async () => { dialog.dispatchEvent(cancel); });
  expect(cancel.defaultPrevented).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  expect(document.activeElement).toBe(trigger);
});

it("keeps the move dialog mounted while its feed changes folders", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
  const { MoveFeedDialog } = await import("../components/app/sidebar/MoveFeedDialog");
  const { useFeedStore } = await import("../lib/store/feedStore");
  const { useUiStore } = await import("../lib/store/uiStore");
  const feed = { id: "moving-feed", title: "文学", url: "https://example.test", feedUrl: "https://example.test/feed", folderId: null, userId: "qa", description: null, faviconUrl: null, lastFetchedAt: null, sortOrder: 0, createdAt: null, updatedAt: null, unreadCount: 0 };
  useFeedStore.setState({ feeds: [feed], folders: [], moveStatus: null });
  useUiStore.setState({ feedToMoveId: feed.id });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<MoveFeedDialog />));
  const original = document.querySelector("dialog");
  await act(async () => useFeedStore.setState({ feeds: [{ ...feed, folderId: "folder" }], moveStatus: "已移动" }));
  expect(document.querySelector("dialog")).toBe(original);
  expect(original?.open).toBe(true);
  expect(original?.textContent).toContain("已移动");
  await act(async () => root.unmount());
  useUiStore.setState({ feedToMoveId: null });
});
