// ABOUTME: The sync engine's activity log (SyncApi.onLog) — every operation
// ABOUTME: reports what actually happened so the app can show a real log.
import { describe, expect, it } from "vitest";
import { baseEntry } from "./testing/fixtures";
import { createHarness } from "./testing/harness";
import type { SyncLogEntry } from "./types";

async function harnessWithLog() {
  const harness = await createHarness();
  const events: SyncLogEntry[] = [];
  harness.sync.onLog((entry) => events.push(entry));
  return { ...harness, events };
}

function messages(events: SyncLogEntry[]): string {
  return events.map((e) => `${e.level}: ${e.message}`).join("\n");
}

describe("sync log events", () => {
  it("bootstrap logs how many entries it loaded", async () => {
    const { remote, sync, model, events } = await harnessWithLog();
    const post = model.newEntry({ kind: "post", title: "Seeded", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });

    await sync.bootstrap();

    expect(messages(events)).toContain("Loaded 1 entr");
  });

  it("a push with changes logs the commit and which paths went up", async () => {
    const { remote, store, sync, model, events } = await harnessWithLog();
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();
    const post = model.newEntry({ kind: "post", title: "Fresh", date: "2026-01-06" });
    await store.upsertEntry(
      baseEntry({ path: post.path, kind: "post", workingContent: post.raw, title: "Fresh" }),
    );

    const result = await sync.push();

    expect(result.committed).toBe(true);
    const pushLine = events.find((e) => e.message.startsWith("Pushed"));
    expect(pushLine).toBeDefined();
    expect(pushLine?.level).toBe("info");
    expect(pushLine?.detail).toContain(post.path);
  });

  it("a validation skip logs an error naming the path and the reason", async () => {
    const { remote, store, sync, model, events } = await harnessWithLog();
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();
    const created = model.newEntry({ kind: "post", title: "Bad", date: "2026-01-10" });
    const badPath = "content/blog/2026/not-a-dated-filename.md";
    await store.upsertEntry(
      baseEntry({ path: badPath, kind: "post", workingContent: created.raw, title: "Bad" }),
    );

    await sync.push();

    const skipLine = events.find((e) => e.level === "error" && e.message.includes(badPath));
    expect(skipLine).toBeDefined();
    expect(skipLine?.message).toContain("filename");
  });

  it("a pull that picks up remote changes logs them", async () => {
    const { remote, sync, model, events } = await harnessWithLog();
    const post = model.newEntry({ kind: "post", title: "Original", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();
    remote.pushExternalChange({ [post.path]: `${post.raw}\nEdited elsewhere.\n` });

    await sync.pull();

    const pullLine = events.find((e) => e.message.startsWith("Pulled"));
    expect(pullLine).toBeDefined();
    expect(pullLine?.detail).toContain(post.path);
  });

  it("a sync round with nothing to do logs that it checked", async () => {
    const { remote, sync, events } = await harnessWithLog();
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    await sync.sync();

    expect(messages(events)).toContain("Nothing to push");
  });

  it("a conflict discovered by pull logs a warning naming the path", async () => {
    const { remote, store, sync, model, events } = await harnessWithLog();
    const post = model.newEntry({ kind: "post", title: "Contested", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();
    const entry = await store.getEntry(post.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({
      ...entry,
      workingContent: `${post.raw}mine mine mine\n`,
      dirty: true,
    });
    remote.pushExternalChange({ [post.path]: `${post.raw}theirs theirs theirs\n` });

    await sync.pull();

    const conflictLine = events.find((e) => e.level === "warn" && e.message.includes("onflict"));
    expect(conflictLine).toBeDefined();
    expect(`${conflictLine?.message} ${conflictLine?.detail ?? ""}`).toContain(post.path);
  });

  it("resolving a conflict logs it", async () => {
    const { remote, store, sync, model, events } = await harnessWithLog();
    const post = model.newEntry({ kind: "post", title: "Contested", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();
    const entry = await store.getEntry(post.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({
      ...entry,
      workingContent: `${post.raw}mine mine mine\n`,
      dirty: true,
    });
    remote.pushExternalChange({ [post.path]: `${post.raw}theirs theirs theirs\n` });
    await sync.pull();

    await sync.resolveConflict(post.path, { choose: "theirs" });

    const resolveLine = events.find((e) => e.message.startsWith("Resolved"));
    expect(resolveLine).toBeDefined();
    expect(resolveLine?.message).toContain(post.path);
  });
});
