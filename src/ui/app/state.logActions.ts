// ABOUTME: appendLog — adds a line to the Activity log (capped), for the app's
// ABOUTME: own events alongside the sync engine's.
import type { SyncLogEntry } from "../../core/sync/types";
import type { ActionCtx } from "./state.types";
import { SYNC_LOG_CAP } from "./state.types";

function appendLog(ctx: ActionCtx, entry: Omit<SyncLogEntry, "at">): void {
  const full: SyncLogEntry = { at: ctx.deps.now(), ...entry };
  ctx.set((state) => ({ syncLog: [...state.syncLog, full].slice(-SYNC_LOG_CAP) }));
}

export { appendLog };
