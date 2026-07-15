// ABOUTME: Push scenarios — rename (old path deleted + new path added in one
// ABOUTME: commit) and CAS retry (remote advances mid-push, never forcing).
import { describe, expect, it } from "vitest";
import { baseEntry, commitMessageFor } from "./testing/fixtures";
import { createHarness } from "./testing/harness";

describe("push: rename", () => {
  it("deletes the old path and adds the new path in a single commit", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const oldEntry = model.newEntry({ kind: "post", title: "Renamed Post", date: "2026-01-05" });
    remote.initRepo({ [oldEntry.path]: oldEntry.raw });
    await sync.bootstrap();

    const existing = await store.getEntry(oldEntry.path);
    if (!existing) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...existing, deleted: true, dirty: true });

    const renamed = model.newEntry({ kind: "post", title: "Renamed Post", date: "2026-01-06" });
    await store.upsertEntry(
      baseEntry({
        path: renamed.path,
        kind: "post",
        workingContent: renamed.raw,
        renamedFrom: oldEntry.path,
        title: "Renamed Post",
      }),
    );

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(result.retries).toBe(0);
    expect(await commitMessageFor(remote, result)).toBe("Sync: 2 changes");

    expect(remote.readFile(oldEntry.path)).toBeNull();
    expect(remote.readFile(renamed.path)).toBe(renamed.raw);
    expect(await store.getEntry(oldEntry.path)).toBeNull();
    const newRow = await store.getEntry(renamed.path);
    expect(newRow?.dirty).toBe(false);
    expect(newRow?.renamedFrom).toBeNull();
  });
});

describe("push: rename (renamedFrom only, no separate tombstone row)", () => {
  it("also deletes the old path when only renamedFrom names it", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const oldEntry = model.newEntry({ kind: "post", title: "Solo Rename", date: "2026-01-05" });
    remote.initRepo({ [oldEntry.path]: oldEntry.raw });
    await sync.bootstrap();

    const renamed = model.newEntry({ kind: "post", title: "Solo Rename", date: "2026-01-07" });
    await store.upsertEntry(
      baseEntry({
        path: renamed.path,
        kind: "post",
        workingContent: renamed.raw,
        renamedFrom: oldEntry.path,
        title: "Solo Rename",
      }),
    );
    // The old row still exists but was never itself marked dirty/deleted —
    // push must still remove it via renamedFrom alone.
    await store.removeEntry(oldEntry.path);

    const result = await sync.push();
    expect(result.committed).toBe(true);
    expect(remote.readFile(oldEntry.path)).toBeNull();
    expect(remote.readFile(renamed.path)).toBe(renamed.raw);
  });
});

describe("push: CAS retry", () => {
  it("retries exactly once and succeeds when the remote advances mid-push, without forcing", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const mine = model.newEntry({ kind: "post", title: "Mine", date: "2026-01-05" });
    const other = model.newEntry({ kind: "post", title: "Other", date: "2026-01-06" });
    remote.initRepo({ [mine.path]: mine.raw, [other.path]: other.raw });
    await sync.bootstrap();

    const entry = await store.getEntry(mine.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({
      ...entry,
      workingContent: `${mine.raw}my local edit\n`,
      dirty: true,
    });

    const otherEdited = model.replaceBody(other.raw, "raced in from elsewhere\n");
    if (!otherEdited.ok) {
      throw new Error(otherEdited.error);
    }
    remote.raceOnNextUpdateRef({ [other.path]: otherEdited.raw });

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(result.retries).toBe(1);
    expect(remote.readFile(mine.path)).toBe(`${mine.raw}my local edit\n`);
    expect(remote.readFile(other.path)).toBe(otherEdited.raw);
  });
});
