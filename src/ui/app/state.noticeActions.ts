// ABOUTME: Notices: addToast, and on macOS its routing (spec §5) to the HUD, a
// ABOUTME: native alert (one at a time), or nothing when state already shows it.

import type { ActionCtx, SetState, Toast } from "./state.types";
import { routeToast } from "./toastRoute";

/** Native alerts, shown one at a time. A message already showing or
 *  waiting isn't shown twice, but its retry isn't lost either: two entries
 *  failing to save with the same words both retry on one Try Again. */
interface AlertQueue {
  /** Message → the retries waiting on that alert's answer. */
  pending: Map<string, Array<() => void>>;
  last: Promise<void>;
}

function createAlertQueue(): AlertQueue {
  return { pending: new Map(), last: Promise.resolve() };
}

function queueAlert(ctx: ActionCtx, queue: AlertQueue, toast: Omit<Toast, "id">): void {
  const retries = toast.retry ? [toast.retry] : [];
  const waiting = queue.pending.get(toast.message);
  if (waiting) {
    waiting.push(...retries);
    return;
  }
  queue.pending.set(toast.message, retries);
  const show = async () => {
    let tryAgain = false;
    try {
      tryAgain = await ctx.deps.alert(toast.message, { retry: retries.length > 0 });
    } catch {
      // No native alert (IPC trouble): the toast stack still says it.
      ctx.set((state) => ({ toasts: [...state.toasts, { id: ctx.deps.createId(), ...toast }] }));
    } finally {
      queue.pending.delete(toast.message);
    }
    if (tryAgain) {
      for (const retry of retries) {
        retry();
      }
    }
  };
  // A retry that throws mustn't stall every alert after it.
  queue.last = queue.last.then(show).catch(() => undefined);
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
    case "editor":
      ctx.set({
        saveFailure: {
          path: toast.path ?? "",
          message: toast.message,
          ...(toast.retry ? { retry: toast.retry } : {}),
        },
      });
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
