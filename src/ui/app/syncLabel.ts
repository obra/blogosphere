// ABOUTME: Sync-status-pill copy — plain language only, zero git jargon, one
// ABOUTME: place deciding which of Synced/N pending/Offline/Conflict/… wins.
import type { SyncStatus } from "../../core/sync/types";

export type SyncTone = "ok" | "pending" | "offline" | "conflict" | "error";

export interface SyncLabel {
  text: string;
  tone: SyncTone;
}

/**
 * Priority: an unresolved conflict always wins (needs the user); then offline
 * (or no sync configured yet); then an active sync; then pending changes;
 * then a sync error; otherwise fully synced.
 */
export function syncStatusLabel(status: SyncStatus | null): SyncLabel {
  if (!status) {
    return { text: "Offline", tone: "offline" };
  }
  if (status.conflicts.length > 0) {
    return { text: "Conflict", tone: "conflict" };
  }
  if (status.state === "offline") {
    return { text: "Offline", tone: "offline" };
  }
  if (status.state === "syncing") {
    return { text: "Syncing…", tone: "pending" };
  }
  if (status.pendingCount > 0) {
    return { text: `${status.pendingCount} pending`, tone: "pending" };
  }
  if (status.state === "error") {
    return { text: "Couldn't sync", tone: "error" };
  }
  return { text: "Synced", tone: "ok" };
}
