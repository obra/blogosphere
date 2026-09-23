// ABOUTME: Pure menu models — the compose menu, the entry "…" menu, and View ›
// ABOUTME: Hide/Show Sidebar — plus runMenuCommand, which both menu kinds call.
import type { EntryRecord } from "../../core/store/types";
import type { Section } from "../types";
import { entryLiveUrl } from "./liveUrl";
import { openExternal } from "./openExternal";
import type { BoundAppStore } from "./state";

type MenuCommandId =
  | "publish"
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

/** The editor toolbar's "…" menu, and the body of the Entry menu. With no
 *  record (nothing selected) every command is disabled. */
function entryActionItems(record: EntryRecord | null, liveUrl: string | null): MenuItemModel[] {
  return [
    command("openOnSite", "Open on Site", record !== null && liveUrl !== null),
    command("versions", "Versions…", record !== null),
    // Same rule as SecretLinkControl: drafts can mint a link; published
    // entries only have one if they already carry an opaque id.
    command(
      "copySecretLink",
      "Copy Secret Link",
      record !== null && (record.opaqueId !== null || record.draft),
    ),
    { kind: "separator" },
    command("discard", "Discard Changes…", record?.dirty === true && record.baseContent !== null),
    command("delete", "Delete…", record !== null),
  ];
}

// biome-ignore lint/security/noSecrets: a keyboard accelerator, not a credential.
const PUBLISH_ACCELERATOR = "CmdOrCtrl+Shift+P";

/** Publish… is for drafts only; published entries republish through Save & Sync. */
function publishItem(record: EntryRecord | null): MenuItemModel {
  return command("publish", "Publish…", record?.draft === true);
}

/** The menu bar's Entry menu: Publish… plus everything in the "…" menu,
 *  all disabled when nothing is selected. */
function entryMenuItems(record: EntryRecord | null, liveUrl: string | null): MenuItemModel[] {
  return [
    { ...publishItem(record), accelerator: PUBLISH_ACCELERATOR } as MenuItemModel,
    { kind: "separator" },
    ...entryActionItems(record, liveUrl),
  ];
}

/** A row's context menu. The same items for every entry (popup menus are
 *  cached per key), with Publish… disabled for anything but a draft. */
function entryRowItems(record: EntryRecord, liveUrl: string | null): MenuItemModel[] {
  const actions = entryActionItems(record, liveUrl);
  const pick = (id: MenuCommandId) =>
    actions.find((item) => item.kind === "command" && item.id === id) as MenuItemModel;
  return [
    pick("openOnSite"),
    pick("copySecretLink"),
    { kind: "separator" },
    publishItem(record),
    pick("delete"),
  ];
}

/** A sidebar section's context menu. */
function sectionMenuItems(section: Section): MenuItemModel[] {
  switch (section) {
    case "drafts":
    case "posts":
      return [command("newPost", "New Post")];
    case "links":
      return [command("newLink", "New Link…")];
    default:
      return [];
  }
}

/** The File menu's commands that also live in toolbar and context menus. */
const FILE_MENU_COMMANDS: readonly MenuCommandId[] = ["newPost", "newLink"];

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
    case "publish":
      // The Publish sheet publishes the selected entry.
      if (state.selectedPath !== path) {
        state.select(path);
      }
      state.openPublishDialog();
      return;
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
  entryMenuItems,
  entryRowItems,
  FILE_MENU_COMMANDS,
  type MenuCommandId,
  type MenuItemModel,
  runMenuCommand,
  sectionMenuItems,
  sidebarToggleItem,
};
