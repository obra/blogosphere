// ABOUTME: syncButtonState — which of the seven sync states the macOS toolbar
// ABOUTME: button shows, its symbol, badge, and tooltip (Error outranks Pending).
import { describe, expect, it } from "vitest";
import type { SyncStatus } from "../../core/sync/types";
import { syncButtonState } from "./syncButtonState";

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

function status(overrides: Partial<SyncStatus>): SyncStatus {
  return { state: "idle", pendingCount: 0, conflicts: [], lastSyncAt: null, ...overrides };
}

describe("syncButtonState", () => {
  it("is not connected when sync isn't configured, whatever the status says", () => {
    expect(syncButtonState(null, false, NOW)).toEqual({
      kind: "notConnected",
      icon: "syncNotConnected",
      badge: null,
      tooltip: "Not connected to GitHub",
    });
  });

  it("shows conflicts first, with their count", () => {
    const s = status({ state: "error", pendingCount: 2, conflicts: ["a.md", "b.md"] });
    expect(syncButtonState(s, true, NOW)).toMatchObject({
      kind: "conflict",
      icon: "syncConflict",
      badge: 2,
      tooltip: "2 conflicts",
    });
  });

  it("says 1 conflict, singular", () => {
    expect(syncButtonState(status({ conflicts: ["a.md"] }), true, NOW).tooltip).toBe("1 conflict");
  });

  it("shows offline", () => {
    expect(syncButtonState(status({ state: "offline" }), true, NOW)).toMatchObject({
      kind: "offline",
      icon: "syncOffline",
      tooltip: "Offline — changes stay on this device",
    });
  });

  it("shows syncing", () => {
    expect(syncButtonState(status({ state: "syncing", pendingCount: 3 }), true, NOW)).toMatchObject(
      {
        kind: "syncing",
        icon: "syncing",
        badge: null,
        tooltip: "Syncing…",
      },
    );
  });

  it("puts an error above pending changes, keeping the count as the badge", () => {
    const s = status({ state: "error", pendingCount: 3, message: "GitHub said 500" });
    expect(syncButtonState(s, true, NOW)).toEqual({
      kind: "error",
      icon: "syncError",
      badge: 3,
      tooltip: "Couldn't sync: GitHub said 500",
    });
  });

  it("shows an error with no pending changes and no badge", () => {
    expect(syncButtonState(status({ state: "error" }), true, NOW)).toMatchObject({
      kind: "error",
      badge: null,
      tooltip: "Couldn't sync",
    });
  });

  it("shows pending changes with their count", () => {
    expect(syncButtonState(status({ pendingCount: 1 }), true, NOW)).toMatchObject({
      kind: "pending",
      icon: "syncPending",
      badge: 1,
      tooltip: "1 change not yet on GitHub",
    });
    expect(syncButtonState(status({ pendingCount: 4 }), true, NOW).tooltip).toBe(
      "4 changes not yet on GitHub",
    );
  });

  it("shows synced with the time of the last check", () => {
    const s = status({ lastSyncAt: NOW - 3 * MINUTE });
    expect(syncButtonState(s, true, NOW)).toEqual({
      kind: "synced",
      icon: "synced",
      badge: null,
      tooltip: "Synced · 3m ago",
    });
  });

  it("shows plain synced before any check has happened", () => {
    expect(syncButtonState(status({}), true, NOW).tooltip).toBe("Synced");
  });

  it("keeps a status message visible on non-error states too", () => {
    const s = status({ pendingCount: 2, message: "Push skipped one file" });
    expect(syncButtonState(s, true, NOW).tooltip).toBe(
      "2 changes not yet on GitHub — Push skipped one file",
    );
  });
});

describe("a failed deploy", () => {
  const failed = { sha: "abc", state: "failed" as const, at: NOW - MINUTE };
  const DeployFailed = "Deploy failed — the site still shows the previous version";

  it("shows as an error, pending changes still badged", () => {
    expect(
      syncButtonState(status({ lastSyncAt: NOW - 2 * MINUTE, pendingCount: 1 }), true, NOW, failed),
    ).toEqual({ kind: "error", icon: "syncError", badge: 1, tooltip: DeployFailed });
  });

  it("stops showing once a later sync succeeds, even with nothing to push", () => {
    expect(syncButtonState(status({ lastSyncAt: NOW }), true, NOW, failed).kind).toBe("synced");
  });

  it("ranks below conflicts, offline and syncing", () => {
    const early = { lastSyncAt: NOW - 2 * MINUTE };
    expect(syncButtonState(status({ ...early, state: "syncing" }), true, NOW, failed).kind).toBe(
      "syncing",
    );
    expect(syncButtonState(status({ ...early, state: "offline" }), true, NOW, failed).kind).toBe(
      "offline",
    );
  });

  it("a deploy in progress or live changes nothing", () => {
    for (const state of ["deploying", "live"] as const) {
      expect(syncButtonState(status({}), true, NOW, { ...failed, state }).kind).toBe("synced");
    }
  });
});
