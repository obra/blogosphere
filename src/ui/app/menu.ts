// ABOUTME: Native app menu (Tauri runtime only) — real menu commands for
// ABOUTME: everything the buttons and shortcuts do, with enabled states
// ABOUTME: tracking the current selection. Browser dev keeps DOM shortcuts.
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import type { ModelApi } from "../../core/model/types";
import type { EntryRecord } from "../../core/store/types";
import { getActiveEditor, subscribeActiveEditor } from "../editor/activeEditor";
import type { Section } from "../types";
import { SECTIONS } from "../types";
import { formatMenuItems } from "./formatCommands";
import { SECTION_LABELS } from "./grouping";
import { entryLiveUrl } from "./liveUrl";
import {
  createEnabledTracker,
  entryMenuItems,
  FILE_MENU_COMMANDS,
  type MenuItemModel,
  runMenuCommand,
  sidebarToggleItem,
} from "./menuModel";
import {
  buildEditSubmenu,
  buildFormatSubmenu,
  buildHelpSubmenu,
  buildWindowSubmenu,
  type FormatMenu,
  separator,
} from "./menuSubmenus";
import { applyEnabled, buildNativeItems, type NativeItems } from "./nativeMenu";
import type { BoundAppStore } from "./state";
import { modalOpen } from "./state.sheetActions";
import type { AppState } from "./state.types";

interface EntryMenuState {
  /** The selected entry the Entry menu acts on, or null (all disabled). */
  record: EntryRecord | null;
  liveUrl: string | null;
}

/** Pure so it's testable without the Tauri runtime. While a sheet (or Quick
 *  Open, or Settings) is up there's no record: its commands are refused
 *  then, so they show disabled, like a Mac window's menus under a sheet. */
function entryMenuState(
  state: Pick<
    AppState,
    | "entries"
    | "selectedPath"
    | "publishDialogOpen"
    | "newLinkDialogOpen"
    | "versionsPath"
    | "conflictSheetPath"
    | "quickOpenOpen"
    | "settingsOpen"
  >,
  model: ModelApi,
): EntryMenuState {
  if (modalOpen(state)) {
    return { record: null, liveUrl: null };
  }
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
        // Switching sections under an open sheet would change what it's for.
        action: () => {
          if (!modalOpen(store.getState())) {
            store.getState().setSection(section);
          }
        },
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

/* Building the menu takes many IPC round trips, and the store (a restored
   selection) or the focused editor may move meanwhile: each tracker brings
   its items up to date right away, then follows changes. */

function trackFormatMenu(format: FormatMenu): () => void {
  const update = createEnabledTracker((models) => applyEnabled(format.byId, models));
  const sync = () => update(formatMenuItems(getActiveEditor() !== null));
  const stop = subscribeActiveEditor(sync);
  sync();
  return stop;
}

/** The Entry menu's enabled states and View › Hide/Show Sidebar's title. */
function trackStoreItems(store: BoundAppStore, entry: EntryMenu, view: ViewMenu): () => void {
  const updateEntry = createEnabledTracker((models) => applyEnabled(entry.byId, models));
  // Parsing the entry for its live URL is only worth it when the selected
  // record (or the services parsing it) actually changed.
  let lastRecord: EntryRecord | null | undefined;
  let lastServices: AppState["services"] | undefined;
  let lastModal: boolean | undefined;
  // Starts opposite to the store so the first sync always sets the title.
  let lastSidebarHidden = !store.getState().sidebarHidden;
  const sync = (state: AppState) => {
    if (view.sidebarItem && state.sidebarHidden !== lastSidebarHidden) {
      lastSidebarHidden = state.sidebarHidden;
      view.sidebarItem.setText(sidebarToggleItem(state.sidebarHidden).text).catch(() => undefined);
    }
    const record = state.entries.find((e) => e.path === state.selectedPath) ?? null;
    const modal = modalOpen(state);
    if (record !== lastRecord || state.services !== lastServices || modal !== lastModal) {
      lastRecord = record;
      lastServices = state.services;
      lastModal = modal;
      updateEntry(currentEntryItems(state));
    }
  };
  sync(store.getState());
  return store.subscribe(sync);
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
  // Only submenus of the installed menu can take these roles: Help gets the
  // menu-search field, Window gets the list of open windows.
  await help.setAsHelpMenuForNSApp().catch(() => undefined);
  await windowSubmenu.setAsWindowsMenuForNSApp().catch(() => undefined);

  const stopFormat = trackFormatMenu(format);
  const stopStore = trackStoreItems(store, entry, view);
  return () => {
    stopStore();
    stopFormat();
  };
}

export type { EntryMenuState };
export { entryMenuState, installAppMenu };
