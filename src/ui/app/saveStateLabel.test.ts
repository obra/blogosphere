// ABOUTME: Tests for saveStateLabel — the editor's autosave indicator copy,
// ABOUTME: especially the draft promise: synced to GitHub but NOT public.
import { describe, expect, it } from "vitest";
import type { SyncStatus } from "../../core/sync/types";
import { saveStateLabel } from "./saveStateLabel";

function status(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return { state: "idle", pendingCount: 0, conflicts: [], lastSyncAt: null, ...overrides };
}

describe("saveStateLabel", () => {
  it("with no sync configured, everything is local-only regardless of dirtiness", () => {
    expect(saveStateLabel({ dirty: true, draft: true }, null).text).toBe("Saved on this device");
    expect(saveStateLabel({ dirty: false, draft: false }, null).text).toBe("Saved on this device");
  });

  it("a dirty entry mid-sync reads as saving", () => {
    const label = saveStateLabel({ dirty: true, draft: true }, status({ state: "syncing" }));
    expect(label.text).toBe("Saving…");
  });

  it("a dirty entry while offline promises to sync later", () => {
    const label = saveStateLabel({ dirty: true, draft: true }, status({ state: "offline" }));
    expect(label.text).toBe("Saved on this device · offline");
    expect(label.title).toContain("back online");
  });

  it("a dirty entry between syncs (idle or error) is saved locally", () => {
    expect(saveStateLabel({ dirty: true, draft: true }, status()).text).toBe(
      "Saved on this device",
    );
    expect(saveStateLabel({ dirty: true, draft: false }, status({ state: "error" })).text).toBe(
      "Saved on this device",
    );
  });

  it("a clean draft says it's on GitHub but NOT public", () => {
    const label = saveStateLabel({ dirty: false, draft: true }, status());
    expect(label.text).toBe("Saved to GitHub · not public");
    expect(label.title).toContain("Publish");
  });

  it("a clean draft keeps its not-public text even while other entries sync", () => {
    const label = saveStateLabel({ dirty: false, draft: true }, status({ state: "syncing" }));
    expect(label.text).toBe("Saved to GitHub · not public");
  });

  it("a clean published entry is simply saved to GitHub", () => {
    const label = saveStateLabel({ dirty: false, draft: false }, status());
    expect(label.text).toBe("Saved to GitHub");
  });

  it("every state carries an explanatory tooltip", () => {
    const cases = [
      saveStateLabel({ dirty: true, draft: true }, null),
      saveStateLabel({ dirty: true, draft: true }, status({ state: "syncing" })),
      saveStateLabel({ dirty: true, draft: true }, status({ state: "offline" })),
      saveStateLabel({ dirty: true, draft: true }, status()),
      saveStateLabel({ dirty: false, draft: true }, status()),
      saveStateLabel({ dirty: false, draft: false }, status()),
    ];
    for (const label of cases) {
      expect(label.title.length).toBeGreaterThan(0);
    }
  });
});
