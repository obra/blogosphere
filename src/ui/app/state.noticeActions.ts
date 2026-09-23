// ABOUTME: Notices: addToast, and on macOS its routing (spec §5) to the HUD or
// ABOUTME: to nothing when the app's own state already shows it.

import type { ActionCtx, SetState, Toast } from "./state.types";
import { routeToast } from "./toastRoute";

function addToast(ctx: ActionCtx, toast: Omit<Toast, "id">): string {
  const id = ctx.deps.createId();
  if (ctx.get().services.shell.platform() !== "macos") {
    ctx.set((state) => ({ toasts: [...state.toasts, { id, ...toast }] }));
    return id;
  }
  switch (routeToast(toast, { windowFocused: ctx.deps.windowFocused() })) {
    case "hud":
      // One HUD at a time: the newest message replaces the one showing.
      ctx.set({ hud: { id, message: toast.message } });
      return id;
    case "none":
      return id;
    default:
      ctx.set((state) => ({ toasts: [...state.toasts, { id, ...toast }] }));
      return id;
  }
}

function dismissToast(set: SetState, id: string): void {
  set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
}

/** Clears the HUD if it's still the one `id` names (a newer one may have
 *  replaced it before this one's timer ran out). */
function dismissHud(set: SetState, id: string): void {
  set((state) => (state.hud?.id === id ? { hud: null } : {}));
}

export { addToast, dismissHud, dismissToast };
