// ABOUTME: Pull must never integrate a head OLDER than history it already
// ABOUTME: synced: a stale GitHub read after our own push must not read as
// ABOUTME: "your freshly pushed files were deleted remotely".
import { describe, expect, it } from "vitest";
import { META_LAST_SYNC_AT } from "./meta";
import { baseEntry } from "./testing/fixtures";
import { createHarness } from "./testing/harness";
import type { SyncLogEntry } from "./types";

describe("pull vs a stale GitHub head (read-replica lag)", () => {
  it("does not delete freshly pushed entries when a later pull sees the pre-push head", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();
    const prePushHead = await remote.getRef();

    // The user's local-only draft, then a successful push.
    const draft = model.newEntry({ kind: "draft", title: "My Draft", date: "2026-07-16" });
    await store.upsertEntry(
      baseEntry({ path: draft.path, kind: "draft", workingContent: draft.raw, title: "My Draft" }),
    );
    const push = await sync.push();
    expect(push.committed).toBe(true);
    expect(await store.getEntry(draft.path)).not.toBeNull();

    // Seconds later (e.g. the window-focus refresh), GitHub serves the OLD
    // head. Naively diffing new-tree -> old-tree reads as "the draft was
    // deleted remotely" and removeEntry()s the user's clean local row.
    remote.serveStaleRefOnce(prePushHead);
    const result = await sync.pull();

    expect(result.updated).toEqual([]);
    const row = await store.getEntry(draft.path);
    expect(row).not.toBeNull();
    expect(row?.deleted).toBe(false);
  });

  it("records the check time for a stale-head pull (GitHub was reached)", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model, clock } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();
    const prePushHead = await remote.getRef();
    const draft = model.newEntry({ kind: "draft", title: "My Draft", date: "2026-07-16" });
    await store.upsertEntry(
      baseEntry({ path: draft.path, kind: "draft", workingContent: draft.raw, title: "My Draft" }),
    );
    await sync.push();

    clock.value += 60_000;
    remote.serveStaleRefOnce(prePushHead);
    const result = await sync.pull();
    expect(result.staleHead).toBe(prePushHead);
    expect(await store.getMeta(META_LAST_SYNC_AT)).toBe(String(clock.value));
  });

  it("logs a warning naming the stale head instead of silently no-opping", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const events: SyncLogEntry[] = [];
    sync.onLog((entry) => events.push(entry));
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();
    const prePushHead = await remote.getRef();
    const draft = model.newEntry({ kind: "draft", title: "My Draft", date: "2026-07-16" });
    await store.upsertEntry(
      baseEntry({ path: draft.path, kind: "draft", workingContent: draft.raw, title: "My Draft" }),
    );
    await sync.push();

    remote.serveStaleRefOnce(prePushHead);
    await sync.pull();

    const warn = events.find((e) => e.level === "warn" && e.message.includes("stale"));
    expect(warn).toBeDefined();
  });

  it("a head that KEEPS coming back is a real force-push rewind and gets accepted", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();
    const prePushHead = await remote.getRef();
    const draft = model.newEntry({ kind: "draft", title: "My Draft", date: "2026-07-16" });
    await store.upsertEntry(
      baseEntry({ path: draft.path, kind: "draft", workingContent: draft.raw, title: "My Draft" }),
    );
    await sync.push();

    // The remote genuinely rewound (force-push): every read serves the old
    // head. The first two are treated as suspicious lag; the third is
    // believed, and the pull integrates the rewind (the draft is gone
    // remotely and clean locally, so it goes).
    remote.serveStaleRefOnce(prePushHead);
    expect((await sync.pull()).staleHead).toBe(prePushHead);
    remote.serveStaleRefOnce(prePushHead);
    expect((await sync.pull()).staleHead).toBe(prePushHead);
    remote.serveStaleRefOnce(prePushHead);
    const accepted = await sync.pull();

    expect(accepted.staleHead).toBeUndefined();
    expect(await store.getEntry(draft.path)).toBeNull();
  });

  it("a genuinely new remote head still pulls normally afterwards", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();
    const draft = model.newEntry({ kind: "draft", title: "My Draft", date: "2026-07-16" });
    await store.upsertEntry(
      baseEntry({ path: draft.path, kind: "draft", workingContent: draft.raw, title: "My Draft" }),
    );
    await sync.push();

    const post = model.newEntry({ kind: "post", title: "From Elsewhere", date: "2026-07-16" });
    remote.pushExternalChange({ [post.path]: post.raw });
    const result = await sync.pull();

    expect(result.updated).toContain(post.path);
    expect(await store.getEntry(draft.path)).not.toBeNull();
  });
});
