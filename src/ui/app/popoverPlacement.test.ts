// ABOUTME: popoverPlacement — where a fixed-position popover sits relative to
// ABOUTME: its anchor: below it normally, above it when the anchor is low.
import { describe, expect, it } from "vitest";
import { popoverPlacement } from "./popoverPlacement";

const VIEWPORT = { width: 1100, height: 720 };

describe("popoverPlacement", () => {
  it("hangs below an anchor in the top half, right edges aligned", () => {
    const anchor = { top: 12, bottom: 40, left: 1000, right: 1028 };
    expect(popoverPlacement(anchor, VIEWPORT)).toEqual({ top: 48, right: 72 });
  });

  it("opens upward from an anchor in the bottom half, left edges aligned", () => {
    const anchor = { top: 680, bottom: 708, left: 8, right: 36 };
    expect(popoverPlacement(anchor, VIEWPORT)).toEqual({ bottom: 48, left: 8 });
  });
});
