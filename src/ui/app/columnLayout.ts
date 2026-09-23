// ABOUTME: Column widths for the macOS window: each column's minimum, and the
// ABOUTME: editor's 420pt floor that the list, then the sidebar, give way to.

const MIN_WIDTH = { sidebar: 160, list: 240, editor: 420 } as const;
const DEFAULT_WIDTH = { sidebar: 200, list: 280 } as const;

interface ColumnInput {
  windowWidth: number;
  sidebarWidth: number;
  listWidth: number;
  sidebarHidden: boolean;
}

interface ColumnWidths {
  sidebarWidth: number;
  listWidth: number;
}

/**
 * The widths to draw at this window size. Stored widths are the person's
 * choice and stay untouched; this only decides what fits. The window's own
 * minimum (820 = the three minimums) guarantees the result always fits, so
 * the sidebar never has to disappear by itself. A hidden sidebar keeps its
 * width for when it comes back.
 */
function layoutColumns(input: ColumnInput): ColumnWidths {
  const room = input.windowWidth - MIN_WIDTH.editor;
  let sidebar = Math.max(input.sidebarWidth, MIN_WIDTH.sidebar);
  let list = Math.max(input.listWidth, MIN_WIDTH.list);
  if (input.sidebarHidden) {
    return { sidebarWidth: sidebar, listWidth: Math.max(MIN_WIDTH.list, Math.min(list, room)) };
  }
  if (sidebar + list > room) {
    list = Math.max(MIN_WIDTH.list, room - sidebar);
  }
  if (sidebar + list > room) {
    sidebar = Math.max(MIN_WIDTH.sidebar, room - list);
  }
  return { sidebarWidth: sidebar, listWidth: list };
}

/** A divider drag's proposed width, limited to what keeps every other
 *  column at its minimum (and the editor at 420). */
function clampDividerDrag(
  column: "sidebar" | "list",
  proposed: number,
  input: ColumnInput,
): number {
  const current = layoutColumns(input);
  const room = input.windowWidth - MIN_WIDTH.editor;
  if (column === "sidebar") {
    return Math.min(Math.max(proposed, MIN_WIDTH.sidebar), room - current.listWidth);
  }
  const sidebar = input.sidebarHidden ? 0 : current.sidebarWidth;
  return Math.min(Math.max(proposed, MIN_WIDTH.list), room - sidebar);
}

export {
  type ColumnInput,
  type ColumnWidths,
  clampDividerDrag,
  DEFAULT_WIDTH,
  layoutColumns,
  MIN_WIDTH,
};
