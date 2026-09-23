// ABOUTME: Window-layout actions: hide/show the sidebar and column widths, persisted to meta so
// ABOUTME: the next launch starts the same way (read before render, layoutPrefs).
import { META_LIST_WIDTH, META_SIDEBAR_HIDDEN, META_SIDEBAR_WIDTH } from "./layoutPrefs";
import { persistMeta } from "./state.lastPositionActions";
import type { ActionCtx } from "./state.types";

function toggleSidebar(ctx: ActionCtx): void {
  const hidden = !ctx.get().sidebarHidden;
  ctx.set({ sidebarHidden: hidden });
  persistMeta(ctx, META_SIDEBAR_HIDDEN, String(hidden));
}

function setColumnWidth(
  ctx: ActionCtx,
  column: "sidebar" | "list",
  width: number,
  save: boolean,
): void {
  const rounded = Math.round(width);
  ctx.set(column === "sidebar" ? { sidebarWidth: rounded } : { listWidth: rounded });
  if (save) {
    persistMeta(ctx, column === "sidebar" ? META_SIDEBAR_WIDTH : META_LIST_WIDTH, String(rounded));
  }
}

export { setColumnWidth, toggleSidebar };
