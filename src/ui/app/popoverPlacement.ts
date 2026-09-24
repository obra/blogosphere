// ABOUTME: Places a fixed-position popover next to its anchor, so no scrolling
// ABOUTME: or overflow-hidden ancestor can clip it, and aims its arrow at the anchor.

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

type PlacementStyle = { top: number; right: number } | { bottom: number; left: number };

interface Placement {
  style: PlacementStyle;
  /** Which edge the arrow sits on, and how far along it (px from the
   *  popover's left edge) its tip points. */
  arrow: { edge: "top" | "bottom"; x: number };
}

const GAP = 8;
/** Keeps the arrow off the popover's rounded corners. */
const ARROW_INSET = 18;

/** Below the anchor, right edges aligned, unless the anchor sits in the
 *  bottom half of the window, where it opens upward, left edges aligned.
 *  Either way the arrow points at the anchor's center; when that would put
 *  it in a rounded corner (a small button at the edge), the popover moves
 *  over a little instead, never past the window's edge. */
function popoverPlacement(
  anchor: AnchorRect,
  viewport: { width: number; height: number },
  popoverWidth: number,
): Placement {
  const center = (anchor.left + anchor.right) / 2;
  const clampArrow = (x: number) => Math.min(Math.max(x, ARROW_INSET), popoverWidth - ARROW_INSET);
  if (anchor.top > viewport.height / 2) {
    const shift = Math.min(Math.max(ARROW_INSET - (center - anchor.left), 0), anchor.left);
    const left = anchor.left - shift;
    return {
      style: { bottom: viewport.height - anchor.top + GAP, left },
      arrow: { edge: "bottom", x: clampArrow(center - left) },
    };
  }
  const roomRight = viewport.width - anchor.right;
  const shift = Math.min(Math.max(ARROW_INSET - (anchor.right - center), 0), roomRight);
  const right = roomRight - shift;
  const left = viewport.width - right - popoverWidth;
  return {
    style: { top: anchor.bottom + GAP, right },
    arrow: { edge: "top", x: clampArrow(center - left) },
  };
}

export { type AnchorRect, type Placement, popoverPlacement };
