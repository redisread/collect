import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FeedItem } from "../components/app/sidebar/FeedItem";
import { useFeedStore } from "../lib/store/feedStore";
import type { FeedWithUnreadCount } from "../lib/types";

afterEach(() => { Reflect.deleteProperty(HTMLElement.prototype, "showPopover"); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("opens the subscription menu on touch hold while allowing scrolling", async () => {
  vi.useFakeTimers();
  HTMLElement.prototype.showPopover = vi.fn();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  const select = vi.spyOn(useFeedStore.getState(), "setSelectedSource");
  await act(async () => root.render(<FeedItem feed={{id:"feed",title:"Feed",url:"https://example.com",unreadCount:0} as FeedWithUnreadCount} isSelected={false} />));
  const button = container.querySelector('[data-move-feed="feed"]')!;
  const pointer = (type: string, x: number) => {
    const event = new Event(type, {bubbles:true});
    Object.defineProperties(event, {pointerType:{value:"touch"},clientX:{value:x},clientY:{value:100}});
    return event;
  };
  await act(async () => { button.dispatchEvent(pointer('pointerdown',100)); button.dispatchEvent(pointer('pointermove',130)); vi.advanceTimersByTime(500); });
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await act(async () => { button.dispatchEvent(pointer('pointerdown',100)); vi.advanceTimersByTime(500); });
  expect(document.body.textContent).toContain('移动到文件夹');
  expect(document.body.textContent).toContain('开启自动全文提取');
  await act(async () => { vi.advanceTimersByTime(2000); button.dispatchEvent(pointer('pointerup',100)); button.dispatchEvent(new MouseEvent('click',{bubbles:true})); });
  expect(select).not.toHaveBeenCalled();
  await act(async () => root.unmount()); container.remove();
});
