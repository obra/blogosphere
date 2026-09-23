// ABOUTME: Places a fixed-position popover next to its anchor, so no scrolling
// ABOUTME: or overflow-hidden ancestor (sidebar, toolbar row) can clip it.

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

type Placement = { top: number; right: number } | { bottom: number; left: number };

const GAP = 8;

/** Below the anchor, right edges aligned — unless the anchor sits in the
 *  bottom half of the window, where it opens upward, left edges aligned. */
function popoverPlacement(
  anchor: AnchorRect,
  viewport: { width: number; height: number },
): Placement {
  if (anchor.top > viewport.height / 2) {
    return { bottom: viewport.height - anchor.top + GAP, left: anchor.left };
  }
  return { top: anchor.bottom + GAP, right: viewport.width - anchor.right };
}

export { type AnchorRect, type Placement, popoverPlacement };
