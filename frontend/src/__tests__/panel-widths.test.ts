import { expect, it } from "vitest";
import { fitPanelWidths } from "../lib/utils/panel-widths";

it.each([1024, 1100, 1280, 1440])("reserves reading space at %ipx even with saved maximum widths", width => {
  const panels = fitPanelWidths(width, 320, 480, false);
  expect(width - panels.sidebar - panels.list - 8).toBeGreaterThanOrEqual(400);
  expect(panels.sidebar).toBeGreaterThanOrEqual(180);
  expect(panels.list).toBeGreaterThanOrEqual(280);
});
it("reclaims collapsed sidebar space and preserves preferences when space permits", () => {
  expect(fitPanelWidths(1440, 240, 360, false)).toEqual({ sidebar: 240, list: 360 });
  expect(fitPanelWidths(1024, 320, 480, true)).toEqual({ sidebar: 0, list: 480 });
});
