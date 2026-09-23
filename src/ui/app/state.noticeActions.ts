// ABOUTME: Notices: addToast, and on macOS its routing (spec §5) to the HUD, a
// ABOUTME: native alert (one at a time), or nothing when state already shows it.

import type { ActionCtx, SetState, Toast } from "./state.types";
import { routeToast } from "./toastRoute";

/** Native alerts, shown one at a time. A message already showing or
 *  waiting isn't queued twice (a retry loop failing again, say). */
interface AlertQueue {
  pending: Set<string>;
  last: Promise<void>;
}

function createAlertQueue(): AlertQueue {
  return { pending: new Set(), last: Promise.resolve() };
}

function queueAlert(ctx: ActionCtx, queue: AlertQueue, toast: Omit<Toast, "id">): void {
  if (queue.pending.has(toast.message)) {
    return;
  }
  queue.pending.add(toast.message);
  const show = async () => {
    const tryAgain = await ctx.deps.alert(toast.message, { retry: toast.retry !== undefined });
    queue.pending.delete(toast.message);
    if (tryAgain) {
      toast.retry?.();
    }
  };
  queue.last = queue.last.then(show).catch(() => {
    queue.pending.delete(toast.message);
  });
}

function addToast(ctx: ActionCtx, alerts: AlertQueue, toast: Omit<Toast, "id">): string {
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
    case "alert":
      queueAlert(ctx, alerts, toast);
      return id;
    default:
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

export { type AlertQueue, addToast, createAlertQueue, dismissHud, dismissToast };
