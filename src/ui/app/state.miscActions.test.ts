// @vitest-environment jsdom
// ABOUTME: Tests for resolveConflict, saveToken, editor-mode/commit-template
// ABOUTME: persistence, toasts, and the sync-status mirror, against fakes.
import { expect, it } from "vitest";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

it("the sync status mirror reflects the fake sync's initial status", () => {
  const { services, sync } = buildFakeServices({
    syncOptions: { status: { state: "idle", pendingCount: 2, conflicts: [], lastSyncAt: null } },
  });
  const store = createAppStore(services);

  expect(store.getState().syncStatus?.pendingCount).toBe(2);

  sync?.setStatus({ state: "syncing", pendingCount: 1, conflicts: [], lastSyncAt: null });
  expect(store.getState().syncStatus?.state).toBe("syncing");
});

it("syncStatus is null when no sync is configured (no token yet)", () => {
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore(services);

  expect(store.getState().syncStatus).toBeNull();
});

it("resolveConflict delegates to sync.resolveConflict and refreshes entries", async () => {
  const { services, sync } = buildFakeServices();
  const store = createAppStore(services);

  await store.getState().resolveConflict("content/drafts/2026-01-01-a.md", { choose: "mine" });

  expect(sync?.resolvedConflicts()).toEqual([
    { path: "content/drafts/2026-01-01-a.md", resolution: { choose: "mine" } },
  ]);
});

it("saveToken persists the token via shell.keychainSet", async () => {
  const { services, shell } = buildFakeServices();
  const store = createAppStore(services);

  await store.getState().saveToken("ghp_example");

  expect(await shell.keychainGet("github-token")).toBe("ghp_example");
});

it("saveToken toasts and rethrows when the keychain write fails", async () => {
  const { services, shell } = buildFakeServices();
  const originalSet = shell.keychainSet;
  shell.keychainSet = () => Promise.reject(new Error("locked"));

  const store = createAppStore(services);

  await expect(store.getState().saveToken("ghp_example")).rejects.toThrow("locked");
  expect(store.getState().toasts.some((toast) => toast.tone === "error")).toBe(true);
  expect(store.getState().busy.savingToken).toBe(false);

  shell.keychainSet = originalSet;
});

it("setEditorMode updates state and persists to store meta", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  await store.getState().setEditorMode("content/drafts/2026-01-01-a.md", "source");

  expect(store.getState().editorModes["content/drafts/2026-01-01-a.md"]).toBe("source");
  expect(await services.store.getMeta("editorMode:content/drafts/2026-01-01-a.md")).toBe("source");
});

it("setCommitTemplates updates state and persists as JSON", async () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);
  const templates = {
    newPost: "New: {title}",
    edit: "Edit: {title}",
    newDraft: "Draft: {title}",
    newLink: "Link: {title}",
    delete: "Delete: {path}",
  };

  await store.getState().setCommitTemplates(templates);

  expect(store.getState().commitTemplates).toEqual(templates);
  // "commitMsgTemplates" is the sync engine's own META_COMMIT_TEMPLATES key
  // (src/core/sync/meta.ts) — asserting the literal here, rather than
  // importing the constant, is deliberate: it catches the app store ever
  // drifting onto a different key name than what the sync engine reads.
  const raw = await services.store.getMeta("commitMsgTemplates");
  expect(JSON.parse(raw ?? "{}")).toEqual(templates);
});

it("init loads persisted commit templates before refreshing", async () => {
  const { services } = buildFakeServices();
  await services.store.setMeta(
    "commitMsgTemplates",
    JSON.stringify({
      newPost: "Custom post",
      edit: "Custom edit",
      newDraft: "Custom draft",
      newLink: "Custom link",
      delete: "Custom delete",
    }),
  );
  const store = createAppStore(services);

  await store.getState().init();

  expect(store.getState().commitTemplates.newPost).toBe("Custom post");
});

it("init restores the last section and selected path when the entry still exists", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  await services.store.setMeta("ui:lastSection", "posts");
  await services.store.setMeta("ui:lastSelectedPath", draft.path);
  const store = createAppStore(services);

  await store.getState().init();

  expect(store.getState().section).toBe("posts");
  expect(store.getState().selectedPath).toBe(draft.path);
});

it("init drops a restored selected path whose entry no longer exists", async () => {
  const { services } = buildFakeServices();
  await services.store.setMeta("ui:lastSection", "links");
  await services.store.setMeta("ui:lastSelectedPath", "content/drafts/gone.md");
  const store = createAppStore(services);

  await store.getState().init();

  expect(store.getState().section).toBe("links");
  expect(store.getState().selectedPath).toBeNull();
});

it("init falls back to the default section when the persisted value is corrupt", async () => {
  const { services } = buildFakeServices();
  await services.store.setMeta("ui:lastSection", "not-a-real-section");
  const store = createAppStore(services);

  await store.getState().init();

  expect(store.getState().section).toBe("drafts");
  expect(store.getState().selectedPath).toBeNull();
});

/** Makes the two restore-key reads resolve only after `release()`, and always
 *  with `staleMeta` (last session's values) — standing in for the real Tauri
 *  SQL driver, whose async IPC read can be served from a pre-write snapshot
 *  and resolve after the user has already navigated. AppShell fires init()
 *  without gating interaction on it, so this interleaving is reachable. */
function gateRestoreMetaReads(
  services: ReturnType<typeof buildFakeServices>["services"],
  staleMeta: { section: string | null; path: string | null },
): { release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const originalGetMeta = services.store.getMeta;
  services.store.getMeta = async (key: string) => {
    if (key === "ui:lastSection") {
      await gate;
      return staleMeta.section;
    }
    if (key === "ui:lastSelectedPath") {
      await gate;
      return staleMeta.path;
    }
    return originalGetMeta(key);
  };
  return { release };
}

it("restore never clobbers a selection the user made while init was still reading meta", async () => {
  const stale = makeEntry({ path: "content/drafts/2026-01-01-old.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [stale] });
  const { release } = gateRestoreMetaReads(services, { section: "posts", path: stale.path });
  const store = createAppStore(services);

  const initPromise = store.getState().init();
  // The user hits Cmd-N before the restore reads resolve.
  const newPath = await store.getState().newDraft({ title: "Typed Right Away" });
  release();
  await initPromise;

  expect(store.getState().selectedPath).toBe(newPath);
  expect(store.getState().section).toBe("drafts");
});

it("restore leaves a section the user already switched to alone", async () => {
  const { services } = buildFakeServices();
  const { release } = gateRestoreMetaReads(services, { section: "links", path: null });
  const store = createAppStore(services);

  const initPromise = store.getState().init();
  store.getState().setSection("posts");
  release();
  await initPromise;

  expect(store.getState().section).toBe("posts");
});

it("init never crashes when store.getMeta rejects for the position keys", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft" });
  const { services } = buildFakeServices({ seedEntries: [draft] });
  const originalGetMeta = services.store.getMeta;
  services.store.getMeta = (key: string) =>
    key === "ui:lastSection" ? Promise.reject(new Error("disk error")) : originalGetMeta(key);
  const store = createAppStore(services);

  await expect(store.getState().init()).resolves.toBeUndefined();

  expect(store.getState().section).toBe("drafts");
  expect(store.getState().selectedPath).toBeNull();

  services.store.getMeta = originalGetMeta;
});

it("addToast/dismissToast add and remove toasts by id", () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  const id = store.getState().addToast({ tone: "info", message: "Hello" });
  expect(store.getState().toasts).toHaveLength(1);

  store.getState().dismissToast(id);
  expect(store.getState().toasts).toHaveLength(0);
});

it("openNewLinkDialog/closeNewLinkDialog and openSettings/closeSettings toggle flags", () => {
  const { services } = buildFakeServices();
  const store = createAppStore(services);

  store.getState().openNewLinkDialog();
  expect(store.getState().newLinkDialogOpen).toBe(true);
  store.getState().closeNewLinkDialog();
  expect(store.getState().newLinkDialogOpen).toBe(false);

  store.getState().openSettings();
  expect(store.getState().settingsOpen).toBe(true);
  store.getState().closeSettings();
  expect(store.getState().settingsOpen).toBe(false);
});
