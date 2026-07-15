// @vitest-environment jsdom
// ABOUTME: Tests for resolveConflict, saveToken, editor-mode/commit-template
// ABOUTME: persistence, toasts, and the sync-status mirror, against fakes.
import { expect, it } from "vitest";
import { createAppStore } from "./state";
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
  const raw = await services.store.getMeta("commitMessageTemplates");
  expect(JSON.parse(raw ?? "{}")).toEqual(templates);
});

it("init loads persisted commit templates before refreshing", async () => {
  const { services } = buildFakeServices();
  await services.store.setMeta(
    "commitMessageTemplates",
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
