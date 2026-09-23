// ABOUTME: Window-layout actions: hide/show the sidebar, persisted to meta so
// ABOUTME: the next launch starts the same way (read before render, layoutPrefs).
import { META_SIDEBAR_HIDDEN } from "./layoutPrefs";
import { persistMeta } from "./state.lastPositionActions";
import type { ActionCtx } from "./state.types";

function toggleSidebar(ctx: ActionCtx): void {
  const hidden = !ctx.get().sidebarHidden;
  ctx.set({ sidebarHidden: hidden });
  persistMeta(ctx, META_SIDEBAR_HIDDEN, String(hidden));
}

export { toggleSidebar };
