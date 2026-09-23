// ABOUTME: Native app menu (Tauri runtime only) — real menu commands for
// ABOUTME: everything the buttons and shortcuts do, with enabled states
// ABOUTME: tracking the current selection. Browser dev keeps DOM shortcuts.
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import type { ModelApi } from "../../core/model/types";
import type { EntryRecord } from "../../core/store/types";
import { getActiveEditor, subscribeActiveEditor } from "../editor/activeEditor";
import type { Section } from "../types";
import { SECTIONS } from "../types";
import { SECTION_LABELS } from "./grouping";
import { entryLiveUrl } from "./liveUrl";
import {
  entryMenuItems,
  FILE_MENU_COMMANDS,
  formatMenuItems,
  type MenuItemModel,
  runMenuCommand,
  sidebarToggleItem,
} from "./menuModel";
import {
  buildEditSubmenu,
  buildFormatSubmenu,
  buildHelpSubmenu,
  buildWindowSubmenu,
  separator,
} from "./menuSubmenus";
import { applyEnabled, buildNativeItems, type NativeItems } from "./nativeMenu";
import type { BoundAppStore } from "./state";
import type { AppState } from "./state.types";

interface EntryMenuState {
  /** The selected entry the Entry menu acts on, or null (all disabled). */
  record: EntryRecord | null;
  liveUrl: string | null;
}

/** Pure so it's testable without the Tauri runtime. */
function entryMenuState(
  state: Pick<AppState, "entries" | "selectedPath">,
  model: ModelApi,
): EntryMenuState {
  const record = state.entries.find((entry) => entry.path === state.selectedPath) ?? null;
  return { record, liveUrl: record ? entryLiveUrl(model, record) : null };
}

function currentEntryItems(state: AppState): MenuItemModel[] {
  const { record, liveUrl } = entryMenuState(state, state.services.model);
  return entryMenuItems(record, liveUrl);
}

async function buildAppSubmenu(store: BoundAppStore): Promise<Submenu> {
  return Submenu.new({
    text: "Blogosphere",
    items: await Promise.all([
      PredefinedMenuItem.new({
        text: "About Blogosphere",
        // biome-ignore lint/style/useNamingConvention: `About` is Tauri's own discriminant key in PredefinedMenuItemOptions, not ours to rename.
        item: { About: { name: "Blogosphere" } },
      }),
      separator(),
      MenuItem.new({
        text: "Settings…",
        accelerator: "CmdOrCtrl+,",
        action: () => store.getState().openSettings(),
      }),
      separator(),
      PredefinedMenuItem.new({ item: "Hide" }),
      PredefinedMenuItem.new({ item: "HideOthers" }),
      PredefinedMenuItem.new({ item: "ShowAll" }),
      separator(),
      PredefinedMenuItem.new({ item: "Quit" }),
    ]),
  });
}

const FILE_ITEMS: Record<
  (typeof FILE_MENU_COMMANDS)[number],
  { text: string; accelerator: string }
> = {
  newPost: { text: "New Draft", accelerator: "CmdOrCtrl+N" },
  // biome-ignore lint/security/noSecrets: a keyboard accelerator, not a credential.
  newLink: { text: "New Link…", accelerator: "CmdOrCtrl+Shift+L" },
};

async function buildFileSubmenu(store: BoundAppStore): Promise<Submenu> {
  const act = () => store.getState();
  const newItems = await Promise.all(
    FILE_MENU_COMMANDS.map((id) =>
      MenuItem.new({ ...FILE_ITEMS[id], action: () => runMenuCommand(id, store) }),
    ),
  );
  return Submenu.new({
    text: "File",
    items: [
      ...newItems,
      await separator(),
      await MenuItem.new({
        text: "Save & Sync",
        accelerator: "CmdOrCtrl+S",
        action: () => act().saveNow(),
      }),
      await MenuItem.new({
        text: "Sync Now",
        accelerator: "CmdOrCtrl+R",
        action: () => act().syncNow(),
      }),
    ],
  });
}

interface EntryMenu {
  submenu: Submenu;
  byId: NativeItems["byId"];
}

/** The selected entry's commands (Publish…, Open on Site, Versions…, …). */
async function buildEntrySubmenu(store: BoundAppStore): Promise<EntryMenu> {
  const { items, byId } = await buildNativeItems(currentEntryItems(store.getState()), (id) =>
    runMenuCommand(id, store),
  );
  return { submenu: await Submenu.new({ text: "Entry", items }), byId };
}

interface ViewMenu {
  submenu: Submenu;
  /** View › Hide/Show Sidebar — macOS only (the sidebar hides only there). */
  sidebarItem: MenuItem | null;
}

function buildSidebarItem(store: BoundAppStore): Promise<MenuItem | null> {
  if (store.getState().services.shell.platform() !== "macos") {
    return Promise.resolve(null);
  }
  const model = sidebarToggleItem(store.getState().sidebarHidden);
  return MenuItem.new({
    text: model.text,
    accelerator: model.accelerator,
    action: () => runMenuCommand(model.id, store),
  });
}

async function buildViewSubmenu(store: BoundAppStore): Promise<ViewMenu> {
  const sectionItems = await Promise.all(
    SECTIONS.map((section: Section, index) =>
      MenuItem.new({
        text: SECTION_LABELS[section],
        accelerator: `CmdOrCtrl+${index + 1}`,
        action: () => store.getState().setSection(section),
      }),
    ),
  );
  const sidebarItem = await buildSidebarItem(store);
  const sidebarItems = sidebarItem ? [sidebarItem, await separator()] : [];
  const submenu = await Submenu.new({
    text: "View",
    items: [
      ...sidebarItems,
      await MenuItem.new({
        text: "Quick Open…",
        accelerator: "CmdOrCtrl+K",
        action: () => store.getState().openQuickOpen(),
      }),
      await separator(),
      ...sectionItems,
      await separator(),
      await MenuItem.new({
        text: "Activity Log",
        // biome-ignore lint/security/noSecrets: a keyboard accelerator, not a credential.
        accelerator: "Alt+CmdOrCtrl+L",
        action: () => store.getState().openSyncLog(),
      }),
    ],
  });
  return { submenu, sidebarItem };
}

/** The enabled flags as one comparable string: typing replaces the record
 *  object on every keystroke, but the flags rarely change. */
function enabledSignature(models: readonly MenuItemModel[]): string {
  return models.map((model) => (model.kind === "command" && model.enabled ? "1" : "0")).join("");
}

/**
 * Builds and installs the native application menu, keeping the selection-
 * dependent items' enabled state in sync with the store (diffed, so a
 * keystroke doesn't cause four IPC calls). Returns a disposer that stops the
 * store subscription.
 */
async function installAppMenu(store: BoundAppStore): Promise<() => void> {
  const [appSubmenu, file, entry, edit, format, view, windowSubmenu, help] = await Promise.all([
    buildAppSubmenu(store),
    buildFileSubmenu(store),
    buildEntrySubmenu(store),
    buildEditSubmenu(),
    buildFormatSubmenu(store),
    buildViewSubmenu(store),
    buildWindowSubmenu(),
    buildHelpSubmenu(),
  ]);
  const menu = await Menu.new({
    items: [
      appSubmenu,
      file,
      entry.submenu,
      edit,
      format.submenu,
      view.submenu,
      windowSubmenu,
      help,
    ],
  });
  await menu.setAsAppMenu();

  const stopFormat = subscribeActiveEditor(() => {
    applyEnabled(format.byId, formatMenuItems(getActiveEditor() !== null));
  });

  let lastRecordKey = { record: null as EntryRecord | null, services: store.getState().services };
  let lastSignature = enabledSignature(currentEntryItems(store.getState()));
  let lastSidebarHidden = store.getState().sidebarHidden;
  const stopEntry = store.subscribe((state) => {
    if (view.sidebarItem && state.sidebarHidden !== lastSidebarHidden) {
      lastSidebarHidden = state.sidebarHidden;
      view.sidebarItem.setText(sidebarToggleItem(state.sidebarHidden).text).catch(() => undefined);
    }
    const record = state.entries.find((e) => e.path === state.selectedPath) ?? null;
    if (record === lastRecordKey.record && state.services === lastRecordKey.services) {
      return;
    }
    lastRecordKey = { record, services: state.services };
    const models = currentEntryItems(state);
    const signature = enabledSignature(models);
    if (signature !== lastSignature) {
      lastSignature = signature;
      applyEnabled(entry.byId, models);
    }
  });
  return () => {
    stopEntry();
    stopFormat();
  };
}

export type { EntryMenuState };
export { entryMenuState, installAppMenu };
