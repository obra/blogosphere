// ABOUTME: Pure menu models — the compose menu, the entry "…" menu, and View ›
// ABOUTME: Hide/Show Sidebar — plus runMenuCommand, which both menu kinds call.
import type { EntryRecord } from "../../core/store/types";
import { entryLiveUrl } from "./liveUrl";
import { openExternal } from "./openExternal";
import type { BoundAppStore } from "./state";

type MenuCommandId =
  | "newPost"
  | "newLink"
  | "openOnSite"
  | "versions"
  | "copySecretLink"
  | "discard"
  | "delete"
  | "toggleSidebar";

type MenuItemModel =
  | { kind: "command"; id: MenuCommandId; text: string; enabled: boolean; accelerator?: string }
  | { kind: "separator" };

function command(id: MenuCommandId, text: string, enabled = true): MenuItemModel {
  return { kind: "command", id, text, enabled };
}

/** The editor toolbar's "…" menu (and, in phase 3, the Entry menu). */
function entryActionItems(record: EntryRecord, liveUrl: string | null): MenuItemModel[] {
  return [
    command("openOnSite", "Open on Site", liveUrl !== null),
    command("versions", "Versions…"),
    // Same rule as SecretLinkControl: drafts can mint a link; published
    // entries only have one if they already carry an opaque id.
    command("copySecretLink", "Copy Secret Link", record.opaqueId !== null || record.draft),
    { kind: "separator" },
    command("discard", "Discard Changes…", record.dirty && record.baseContent !== null),
    command("delete", "Delete…"),
  ];
}

function composeMenuItems(): MenuItemModel[] {
  return [command("newPost", "New Post"), command("newLink", "New Link…")];
}

function sidebarToggleItem(
  hidden: boolean,
): Extract<MenuItemModel, { kind: "command" }> & { accelerator: string } {
  return {
    kind: "command",
    id: "toggleSidebar",
    text: hidden ? "Show Sidebar" : "Hide Sidebar",
    enabled: true,
    accelerator: "Ctrl+Cmd+S",
  };
}

function openOnSite(store: BoundAppStore, path: string): void {
  const { entries, services } = store.getState();
  const record = entries.find((entry) => entry.path === path);
  const url = record ? entryLiveUrl(services.model, record) : null;
  if (url !== null) {
    openExternal(url);
  }
}

/** Runs a menu command against the store. Entry commands act on `path` (a
 *  context menu's row), or on the selected entry, and do nothing without one. */
function runMenuCommand(
  id: MenuCommandId,
  store: BoundAppStore,
  path: string | null = store.getState().selectedPath,
): void {
  const state = store.getState();
  switch (id) {
    case "newPost":
      state.newDraft({ title: "" });
      return;
    case "newLink":
      state.openNewLinkDialog();
      return;
    case "toggleSidebar":
      state.toggleSidebar();
      return;
    default:
      break;
  }
  if (path === null) {
    return;
  }
  switch (id) {
    case "openOnSite":
      openOnSite(store, path);
      return;
    case "versions":
      state.openVersions(path);
      return;
    case "copySecretLink":
      state.shareSecretLink(path, { announce: true });
      return;
    case "discard":
      state.discardChanges(path);
      return;
    case "delete":
      state.deleteEntry(path);
      return;
    default:
      return;
  }
}

export {
  composeMenuItems,
  entryActionItems,
  type MenuCommandId,
  type MenuItemModel,
  runMenuCommand,
  sidebarToggleItem,
};
