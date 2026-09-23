// ABOUTME: Where a toast goes on macOS (spec §5): the HUD for info and success,
// ABOUTME: a native alert for an action that failed, nothing when state shows it.
import type { Toast } from "./state.types";

type ToastRoute = "hud" | "alert" | "editor" | "none";

interface RouteContext {
  /** Whether the main window is in front (document.hasFocus()). */
  windowFocused: boolean;
}

function routeToast(toast: Omit<Toast, "id">, context: RouteContext): ToastRoute {
  const source: Toast["source"] = toast.source;
  // Background sync: the sync button's Error state carries it, and the
  // popover's Sync Now retries. Loading the list: refresh() runs after every
  // sync round, so it's rarely something the person just did, never an
  // alert; with no entries the list says so itself.
  if (source === "sync" || source === "load") {
    return "none";
  }
  // Autosave runs on every typing burst: an alert would come back each time.
  // The entry's editor shows it until a save lands.
  if (source === "autosave") {
    return "editor";
  }
  if (source === "deploy") {
    return context.windowFocused ? "hud" : "none";
  }
  return toast.tone === "error" ? "alert" : "hud";
}

export { type RouteContext, routeToast, type ToastRoute };
