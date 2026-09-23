// ABOUTME: What the macOS toolbar's sync button shows: one of seven states with
// ABOUTME: its symbol, optional count badge, and tooltip (native redesign spec §3).
import type { SyncStatus } from "../../core/sync/types";
import type { IconName } from "../icons/iconNames";
import { relativeTimeLabel } from "./format";

type SyncButtonKind =
  | "notConnected"
  | "syncing"
  | "synced"
  | "pending"
  | "conflict"
  | "offline"
  | "error";

interface SyncButtonState {
  kind: SyncButtonKind;
  icon: IconName;
  /** A count to badge the symbol with, or null for none. */
  badge: number | null;
  tooltip: string;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function withMessage(tooltip: string, message: string | undefined): string {
  return message ? `${tooltip} — ${message}` : tooltip;
}

/**
 * Precedence: not connected, conflict, offline, syncing, error, pending,
 * synced. Unlike the sidebar pill (syncLabel.ts), an error outranks pending
 * changes here: a failed push leaves entries dirty, and showing only
 * "N pending" would hide the failure.
 */
function syncButtonState(
  status: SyncStatus | null,
  connected: boolean,
  nowMs: number,
): SyncButtonState {
  if (!(connected && status)) {
    return {
      kind: "notConnected",
      icon: "syncNotConnected",
      badge: null,
      tooltip: "Not connected to GitHub",
    };
  }
  const conflicts = status.conflicts.length;
  if (conflicts > 0) {
    return {
      kind: "conflict",
      icon: "syncConflict",
      badge: conflicts,
      tooltip: withMessage(plural(conflicts, "conflict", "conflicts"), status.message),
    };
  }
  if (status.state === "offline") {
    return {
      kind: "offline",
      icon: "syncOffline",
      badge: null,
      tooltip: withMessage("Offline — changes stay on this device", status.message),
    };
  }
  if (status.state === "syncing") {
    return { kind: "syncing", icon: "syncing", badge: null, tooltip: "Syncing…" };
  }
  const pending = status.pendingCount > 0 ? status.pendingCount : null;
  if (status.state === "error") {
    return {
      kind: "error",
      icon: "syncError",
      badge: pending,
      tooltip: status.message ? `Couldn't sync: ${status.message}` : "Couldn't sync",
    };
  }
  if (pending !== null) {
    return {
      kind: "pending",
      icon: "syncPending",
      badge: pending,
      tooltip: withMessage(
        `${plural(pending, "change", "changes")} not yet on GitHub`,
        status.message,
      ),
    };
  }
  return {
    kind: "synced",
    icon: "synced",
    badge: null,
    tooltip:
      status.lastSyncAt === null
        ? "Synced"
        : `Synced · ${relativeTimeLabel(status.lastSyncAt, nowMs)}`,
  };
}

export { type SyncButtonKind, type SyncButtonState, syncButtonState };
