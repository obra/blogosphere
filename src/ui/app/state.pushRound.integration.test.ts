// ABOUTME: Repro harness for "drafts disappeared from the list right after a
// ABOUTME: push": real sync engine + real sqlite store under the app store,
// ABOUTME: asserting the entries cache never transiently drops a live draft.
import { expect, it } from "vitest";
import { DEFAULT_REPO, type Services } from "../../core/services";
import type { EntryRecord } from "../../core/store/types";
import { createHarness } from "../../core/sync/testing/harness";
import { sectionForEntry } from "./grouping";
import { createAppStore } from "./state";
import { createFakeShell } from "./testing/fakeShell";

async function connectedServices() {
  const harness = await createHarness();
  const { remote, store, model, sync } = harness;
  const seeded = model.newEntry({ kind: "post", title: "Existing Post", date: "2026-01-05" });
  remote.initRepo({ [seeded.path]: seeded.raw });
  await sync.bootstrap();
  const services: Services = {
    model,
    store,
    shell: createFakeShell(),
    github: remote,
    sync,
    repo: DEFAULT_REPO,
  };
  return { harness, services };
}

it("a freshly created draft never vanishes from the entries cache across a push round", async () => {
  const { services } = await connectedServices();
  const store = createAppStore(services, {
    confirm: () => true,
    writeClipboardText: () => Promise.resolve(),
  });
  await store.getState().init();

  const draftPath = await store.getState().newDraft({ title: "", date: "2026-07-16" });
  if (draftPath === null) {
    throw new Error("test setup: draft creation failed");
  }

  // Record every entries emission from here on; the draft must be in all of
  // them (it exists locally the whole time — nothing deletes it).
  const missing: Array<{ at: string; paths: string[] }> = [];
  let snapshotIndex = 0;
  const unsubscribe = store.subscribe((state) => {
    snapshotIndex += 1;
    const rows = state.entries.filter((e: EntryRecord) => !e.deleted);
    const draft = rows.find((e: EntryRecord) => e.path === draftPath);
    if (!draft || sectionForEntry(draft) !== "drafts") {
      missing.push({
        at: `snapshot ${snapshotIndex} (draft ${draft ? "wrong section" : "absent"})`,
        paths: rows.map((e: EntryRecord) => e.path),
      });
    }
  });

  store.getState().edit(draftPath, { kind: "body", body: "Some words before syncing.\n" });
  await store.getState().saveNow();
  // A second round, mirroring "synced again a moment later".
  await store.getState().saveNow();
  unsubscribe();

  expect(missing).toEqual([]);
  const finalRow = await services.store.getEntry(draftPath);
  expect(finalRow?.dirty).toBe(false);
});
