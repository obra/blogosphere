// ABOUTME: Window-layout preferences (sidebar hidden, later column widths),
// ABOUTME: read from store meta before first render so the layout never jumps.
import type { StoreApi } from "../../core/store/types";

const META_SIDEBAR_HIDDEN = "ui:sidebarHidden";

interface LayoutPrefs {
  sidebarHidden: boolean;
}

const DEFAULT_LAYOUT_PREFS: LayoutPrefs = { sidebarHidden: false };

/** Never rejects: unreadable or garbled prefs just mean the defaults. */
async function loadLayoutPrefs(store: StoreApi): Promise<LayoutPrefs> {
  try {
    const hidden = await store.getMeta(META_SIDEBAR_HIDDEN);
    return { sidebarHidden: hidden === "true" };
  } catch {
    return DEFAULT_LAYOUT_PREFS;
  }
}

export { DEFAULT_LAYOUT_PREFS, type LayoutPrefs, loadLayoutPrefs, META_SIDEBAR_HIDDEN };
