import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FeedDropZone, FEED_DRAG_TYPE } from "../components/app/sidebar/FeedDropZone";
import { useFeedStore } from "../lib/store/feedStore";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["folder", null])("accepts feed drops into %s without shifting the target", async folderId => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const move = vi.spyOn(useFeedStore.getState(), "moveFeedToFolder").mockResolvedValue();
  await act(async () => root.render(<FeedDropZone folderId={folderId}>文学</FeedDropZone>));
  const zone = container.firstElementChild!;
  function drag(type: string) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { types: [FEED_DRAG_TYPE], getData: () => "feed", dropEffect: "" },
    });
    return event;
  }
  const over = drag("dragover");
  await act(async () => { zone.dispatchEvent(over); });
  expect(over.defaultPrevented).toBe(true);
  expect(zone.textContent).toContain("松开");
  expect(zone.querySelector('[role="status"]')?.className).toBe("sr-only");
  await act(async () => { zone.dispatchEvent(drag("drop")); });
  expect(move).toHaveBeenCalledWith("feed", folderId);
  expect(zone.textContent).not.toContain("松开");
  await act(async () => root.unmount());
  container.remove();
});
