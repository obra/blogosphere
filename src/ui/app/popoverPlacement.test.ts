// ABOUTME: popoverPlacement — where a fixed-position popover sits relative to
// ABOUTME: its anchor (below, or above when the anchor is low), and its arrow.
import { describe, expect, it } from "vitest";
import { popoverPlacement } from "./popoverPlacement";

const VIEWPORT = { width: 1100, height: 720 };
const WIDTH = 340;

describe("popoverPlacement", () => {
  it("hangs below an anchor in the top half, right edges aligned", () => {
    const anchor = { top: 12, bottom: 40, left: 1000, right: 1028 };
    expect(popoverPlacement(anchor, VIEWPORT, WIDTH).style).toEqual({ top: 48, right: 72 });
  });

  it("points its arrow up at the anchor's center", () => {
    // A wide anchor: the popover spans 688..1028, the anchor's center (900) is 212 in.
    const anchor = { top: 12, bottom: 40, left: 772, right: 1028 };
    expect(popoverPlacement(anchor, VIEWPORT, WIDTH).arrow).toEqual({ edge: "top", x: 212 });
  });

  it("opens upward from an anchor in the bottom half, arrow on the bottom edge", () => {
    const anchor = { top: 680, bottom: 708, left: 8, right: 36 };
    const placement = popoverPlacement(anchor, VIEWPORT, WIDTH);
    expect(placement.style).toEqual({ bottom: 48, left: 8 });
    // The anchor's center is 14 in, inside the corner: kept at 18.
    expect(placement.arrow).toEqual({ edge: "bottom", x: 18 });
  });

  it("keeps the arrow off the rounded corners", () => {
    const anchor = { top: 12, bottom: 40, left: 1024, right: 1028 };
    expect(popoverPlacement(anchor, VIEWPORT, WIDTH).arrow.x).toBe(WIDTH - 18);
  });
});
