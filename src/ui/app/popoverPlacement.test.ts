// ABOUTME: popoverPlacement — where a fixed-position popover sits relative to
// ABOUTME: its anchor (below, or above when the anchor is low), and its arrow.
import { describe, expect, it } from "vitest";
import { popoverPlacement } from "./popoverPlacement";

const VIEWPORT = { width: 1100, height: 720 };
const WIDTH = 340;

describe("popoverPlacement", () => {
  it("hangs below an anchor in the top half, right edges aligned", () => {
    const anchor = { top: 12, bottom: 40, left: 900, right: 1028 };
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
    // The anchor's center (22) is 14 in from a left-aligned edge: the
    // popover moves 4 left so the arrow sits 18 in, on the center.
    expect(placement.style).toEqual({ bottom: 48, left: 4 });
    expect(placement.arrow).toEqual({ edge: "bottom", x: 18 });
  });

  it("shifts itself so the arrow points at the anchor's center, clear of the corner", () => {
    // The real sync button: 28 wide at the trailing edge. Right-aligned, its
    // center would be 14 in from the popover's right edge, inside the corner.
    const anchor = { top: 12, bottom: 40, left: 1000, right: 1028 };
    const placement = popoverPlacement(anchor, VIEWPORT, WIDTH);
    expect(placement.style).toEqual({ top: 48, right: 68 });
    const popoverLeft = VIEWPORT.width - 68 - WIDTH;
    expect(popoverLeft + placement.arrow.x).toBe(1014);
  });

  it("never shifts past the window's edge", () => {
    const anchor = { top: 12, bottom: 40, left: 1090, right: 1100 };
    const placement = popoverPlacement(anchor, VIEWPORT, WIDTH);
    expect(placement.style).toEqual({ top: 48, right: 0 });
    expect(placement.arrow.x).toBe(WIDTH - 18);
  });
});
