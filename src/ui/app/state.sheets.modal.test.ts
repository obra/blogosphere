// ABOUTME: Sheets stay modal against everything else: Quick Open, Settings and
// ABOUTME: the Activity popover, a selection change, and a conflict vanishing.
import { describe, expect, it } from "vitest";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

const draft = makeEntry({ path: "content/drafts/2026-03-04-one.md", kind: "draft" });
const other = makeEntry({ path: "content/drafts/2026-03-05-two.md", kind: "draft" });

async function storeWithDrafts() {
  const fake = buildFakeServices({ seedEntries: [draft, other] });
  const store = createAppStore(fake.services, { confirm: () => true });
  await store.getState().refresh();
  store.getState().select(draft.path);
  return { store, sync: fake.sync };
}

describe("Quick Open and sheets", () => {
  it("no sheet opens while Quick Open is up", async () => {
    const { store } = await storeWithDrafts();
    store.getState().openQuickOpen();
    store.getState().openPublishDialog();
    store.getState().openNewLinkDialog();
    store.getState().openVersions(draft.path);
    store.getState().openConflict(draft.path);
    const state = store.getState();
    expect([
      state.publishDialogOpen,
      state.newLinkDialogOpen,
      state.versionsPath,
      state.conflictSheetPath,
    ]).toEqual([false, false, null, null]);
  });
});

describe("Settings and the Activity popover", () => {
  it("neither opens over a sheet", async () => {
    const { store } = await storeWithDrafts();
    store.getState().openPublishDialog();
    store.getState().openSettings();
    store.getState().openSyncLog();
    store.getState().toggleSyncLog();
    expect(store.getState().settingsOpen).toBe(false);
    expect(store.getState().syncLogOpen).toBe(false);
  });

  it("opening a sheet closes the Activity popover", async () => {
    const { store } = await storeWithDrafts();
    store.getState().openSyncLog();
    store.getState().openNewLinkDialog();
    expect(store.getState().newLinkDialogOpen).toBe(true);
    expect(store.getState().syncLogOpen).toBe(false);
  });
});

describe("the Publish sheet belongs to one entry", () => {
  it("closes when the selection moves to another entry", async () => {
    const { store } = await storeWithDrafts();
    store.getState().openPublishDialog();
    store.getState().select(other.path);
    expect(store.getState().publishDialogOpen).toBe(false);
  });
});

describe("a conflict that goes away while its sheet is requested", () => {
  const conflicted = {
    state: "conflict" as const,
    pendingCount: 0,
    conflicts: [draft.path],
    lastSyncAt: null,
  };

  it("closes the sheet, so nothing stays locked", async () => {
    const { store, sync } = await storeWithDrafts();
    sync?.setStatus(conflicted);
    store.getState().openConflict(draft.path);
    sync?.setStatus({ ...conflicted, state: "idle", conflicts: [] });
    expect(store.getState().conflictSheetPath).toBeNull();
    store.getState().openPublishDialog();
    expect(store.getState().publishDialogOpen).toBe(true);
  });

  it("closes it when sync is disconnected too", async () => {
    const { store, sync } = await storeWithDrafts();
    sync?.setStatus(conflicted);
    store.getState().openConflict(draft.path);
    store.getState().attachSync(null);
    expect(store.getState().conflictSheetPath).toBeNull();
  });
});
