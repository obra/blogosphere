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

/** Below the anchor, right edges aligned — unless the anchor sits in the
 *  bottom half of the window, where it opens upward, left edges aligned.
 *  Either way the arrow points at the anchor's center. */
function popoverPlacement(
  anchor: AnchorRect,
  viewport: { width: number; height: number },
  popoverWidth: number,
): Placement {
  const center = (anchor.left + anchor.right) / 2;
  const arrowAt = (popoverLeft: number) =>
    Math.min(Math.max(center - popoverLeft, ARROW_INSET), popoverWidth - ARROW_INSET);
  if (anchor.top > viewport.height / 2) {
    return {
      style: { bottom: viewport.height - anchor.top + GAP, left: anchor.left },
      arrow: { edge: "bottom", x: arrowAt(anchor.left) },
    };
  }
  return {
    style: { top: anchor.bottom + GAP, right: viewport.width - anchor.right },
    arrow: { edge: "top", x: arrowAt(anchor.right - popoverWidth) },
  };
}

export { type AnchorRect, type Placement, popoverPlacement };
