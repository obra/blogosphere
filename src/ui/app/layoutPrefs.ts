// ABOUTME: Window-layout preferences (sidebar hidden, column widths), read from
// ABOUTME: store meta before first render so the layout never jumps on launch.
import type { StoreApi } from "../../core/store/types";
import { DEFAULT_WIDTH } from "./columnLayout";

const META_SIDEBAR_HIDDEN = "ui:sidebarHidden";
const META_SIDEBAR_WIDTH = "ui:sidebarWidth";
const META_LIST_WIDTH = "ui:listWidth";

interface LayoutPrefs {
  sidebarHidden: boolean;
  sidebarWidth: number;
  listWidth: number;
}

const DEFAULT_LAYOUT_PREFS: LayoutPrefs = {
  sidebarHidden: false,
  sidebarWidth: DEFAULT_WIDTH.sidebar,
  listWidth: DEFAULT_WIDTH.list,
};

function parseWidth(raw: string | null, fallback: number): number {
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Never rejects: unreadable or garbled prefs just mean the defaults. */
async function loadLayoutPrefs(store: StoreApi): Promise<LayoutPrefs> {
  try {
    const [hidden, sidebarWidth, listWidth] = await Promise.all([
      store.getMeta(META_SIDEBAR_HIDDEN),
      store.getMeta(META_SIDEBAR_WIDTH),
      store.getMeta(META_LIST_WIDTH),
    ]);
    return {
      sidebarHidden: hidden === "true",
      sidebarWidth: parseWidth(sidebarWidth, DEFAULT_LAYOUT_PREFS.sidebarWidth),
      listWidth: parseWidth(listWidth, DEFAULT_LAYOUT_PREFS.listWidth),
    };
  } catch {
    return DEFAULT_LAYOUT_PREFS;
  }
}

export {
  DEFAULT_LAYOUT_PREFS,
  type LayoutPrefs,
  loadLayoutPrefs,
  META_LIST_WIDTH,
  META_SIDEBAR_HIDDEN,
  META_SIDEBAR_WIDTH,
};
