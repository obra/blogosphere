// ABOUTME: The engine must serialize its operations and never build a push on
// ABOUTME: a stale head — the two halves of the live "CAS retry storm" where
// ABOUTME: overlapping rounds + a lagging replica fought our own last commit.
import { describe, expect, it } from "vitest";
import { baseEntry } from "./testing/fixtures";
import { createHarness } from "./testing/harness";
import type { SyncState } from "./types";

describe("engine op serialization", () => {
  it("concurrent sync() rounds run one at a time — a round settles before the next begins", async () => {
    const harness = await createHarness();
    const { remote, sync } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    const states: SyncState[] = [];
    sync.onStatus((status) => states.push(status.state));

    await Promise.all([sync.sync(), sync.sync(), sync.pull()]);

    // Three ops -> three begin/settle cycles. Interleaved rounds show up as
    // two consecutive "syncing" emissions with no settled state between.
    for (let i = 1; i < states.length; i += 1) {
      if (states[i] === "syncing") {
        expect(states[i - 1]).not.toBe("syncing");
      }
    }
    expect(states.filter((state) => state === "syncing")).toHaveLength(3);
  });
});

describe("push vs a stale GitHub head", () => {
  it("builds on the newest head this client has integrated instead of CAS-thrashing", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();
    const prePushHead = await remote.getRef();

    const first = model.newEntry({ kind: "draft", title: "First", date: "2026-07-16" });
    await store.upsertEntry(
      baseEntry({ path: first.path, kind: "draft", workingContent: first.raw, title: "First" }),
    );
    const push1 = await sync.push();
    expect(push1.committed).toBe(true);

    // More local work, and now the replica lags: every read for the whole
    // next round serves the PRE-push head. The old code built the commit on
    // it, updateRef refused (not fast-forward), and three retries later gave
    // "the remote kept moving under us" — with no other writer anywhere.
    const second = model.newEntry({ kind: "draft", title: "Second", date: "2026-07-17" });
    await store.upsertEntry(
      baseEntry({ path: second.path, kind: "draft", workingContent: second.raw, title: "Second" }),
    );
    remote.serveStaleRef(prePushHead, 10);
    const push2 = await sync.push();

    expect(push2.committed).toBe(true);
    expect(push2.retries).toBe(0);
    expect(remote.readFile(second.path)).toBe(second.raw);
    // The first push's file must still be present in the new head's tree —
    // building on the stale head would have silently dropped it.
    expect(remote.readFile(first.path)).toBe(first.raw);
  });
});
