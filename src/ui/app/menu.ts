// ABOUTME: Native app menu (Tauri runtime only) — real menu commands for
// ABOUTME: everything the buttons and shortcuts do, with enabled states
// ABOUTME: tracking the current selection. Browser dev keeps DOM shortcuts.
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import type { Section } from "../types";
import { SECTIONS } from "../types";
import { SECTION_LABELS } from "./grouping";
import { runMenuCommand, sidebarToggleItem } from "./menuModel";
import type { BoundAppStore } from "./state";
import type { AppState } from "./state.types";

interface MenuEnabledFlags {
  /** An entry is selected — Publish/Share/Delete apply. */
  hasSelection: boolean;
  /** Selected entry has unsynced changes over a synced base — Discard applies. */
  canDiscard: boolean;
}

/** Pure so it's testable without the Tauri runtime. */
function menuEnabledState(state: Pick<AppState, "entries" | "selectedPath">): MenuEnabledFlags {
  const record = state.entries.find((entry) => entry.path === state.selectedPath);
  return {
    hasSelection: record !== undefined,
    canDiscard: record?.dirty === true && record.baseContent !== null,
  };
}

function separator(): Promise<PredefinedMenuItem> {
  return PredefinedMenuItem.new({ item: "Separator" });
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

interface FileMenu {
  submenu: Submenu;
  publish: MenuItem;
  share: MenuItem;
  discard: MenuItem;
  deleteItem: MenuItem;
  history: MenuItem;
}

type EntryItems = Omit<FileMenu, "submenu">;

/** The selection-gated commands; each starts disabled until something is selected. */
async function buildEntryCommandItems(store: BoundAppStore): Promise<EntryItems> {
  const act = () => store.getState();
  const withSelection = (fn: (path: string) => void) => () => {
    const path = act().selectedPath;
    if (path !== null) {
      fn(path);
    }
  };
  return {
    publish: await MenuItem.new({
      text: "Publish…",
      enabled: false,
      action: withSelection(() => act().openPublishDialog()),
    }),
    share: await MenuItem.new({
      text: "Copy Secret Link",
      enabled: false,
      action: withSelection((path) => act().shareSecretLink(path)),
    }),
    discard: await MenuItem.new({
      text: "Discard Changes…",
      enabled: false,
      action: withSelection((path) => act().discardChanges(path)),
    }),
    deleteItem: await MenuItem.new({
      text: "Delete…",
      enabled: false,
      action: withSelection((path) => act().deleteEntry(path)),
    }),
    history: await MenuItem.new({
      text: "Versions…",
      enabled: false,
      action: withSelection((path) => act().openVersions(path)),
    }),
  };
}

async function buildFileSubmenu(store: BoundAppStore): Promise<FileMenu> {
  const act = () => store.getState();
  const { publish, share, discard, deleteItem, history } = await buildEntryCommandItems(store);
  const submenu = await Submenu.new({
    text: "File",
    items: [
      await MenuItem.new({
        text: "New Draft",
        accelerator: "CmdOrCtrl+N",
        action: () => act().newDraft({ title: "" }),
      }),
      await MenuItem.new({
        text: "New Link…",
        // biome-ignore lint/security/noSecrets: a keyboard accelerator, not a credential.
        accelerator: "CmdOrCtrl+Shift+L",
        action: () => act().openNewLinkDialog(),
      }),
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
      await separator(),
      publish,
      share,
      discard,
      history,
      await separator(),
      deleteItem,
    ],
  });
  return { submenu, publish, share, discard, deleteItem, history };
}

/** Standard Edit bindings — without these, replacing the default app menu
 *  would silently break ⌘C/⌘V/⌘Z inside the webview. */
async function buildEditSubmenu(): Promise<Submenu> {
  return Submenu.new({
    text: "Edit",
    items: await Promise.all([
      PredefinedMenuItem.new({ item: "Undo" }),
      PredefinedMenuItem.new({ item: "Redo" }),
      separator(),
      PredefinedMenuItem.new({ item: "Cut" }),
      PredefinedMenuItem.new({ item: "Copy" }),
      PredefinedMenuItem.new({ item: "Paste" }),
      PredefinedMenuItem.new({ item: "SelectAll" }),
    ]),
  });
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

async function buildWindowSubmenu(): Promise<Submenu> {
  return Submenu.new({
    text: "Window",
    items: await Promise.all([
      PredefinedMenuItem.new({ item: "Minimize" }),
      PredefinedMenuItem.new({ item: "Maximize", text: "Zoom" }),
      separator(),
      PredefinedMenuItem.new({ item: "CloseWindow" }),
    ]),
  });
}

function applyEnabledFlags(file: FileMenu, flags: MenuEnabledFlags): void {
  file.publish.setEnabled(flags.hasSelection).catch(() => undefined);
  file.share.setEnabled(flags.hasSelection).catch(() => undefined);
  file.deleteItem.setEnabled(flags.hasSelection).catch(() => undefined);
  file.history.setEnabled(flags.hasSelection).catch(() => undefined);
  file.discard.setEnabled(flags.canDiscard).catch(() => undefined);
}

/**
 * Builds and installs the native application menu, keeping the selection-
 * dependent items' enabled state in sync with the store (diffed, so a
 * keystroke doesn't cause four IPC calls). Returns a disposer that stops the
 * store subscription.
 */
async function installAppMenu(store: BoundAppStore): Promise<() => void> {
  const [appSubmenu, file, edit, view, windowSubmenu] = await Promise.all([
    buildAppSubmenu(store),
    buildFileSubmenu(store),
    buildEditSubmenu(),
    buildViewSubmenu(store),
    buildWindowSubmenu(),
  ]);
  const menu = await Menu.new({
    items: [appSubmenu, file.submenu, edit, view.submenu, windowSubmenu],
  });
  await menu.setAsAppMenu();

  let lastFlags = menuEnabledState(store.getState());
  applyEnabledFlags(file, lastFlags);
  let lastSidebarHidden = store.getState().sidebarHidden;
  return store.subscribe((state) => {
    if (view.sidebarItem && state.sidebarHidden !== lastSidebarHidden) {
      lastSidebarHidden = state.sidebarHidden;
      view.sidebarItem.setText(sidebarToggleItem(state.sidebarHidden).text).catch(() => undefined);
    }
    const flags = menuEnabledState(state);
    if (
      flags.hasSelection !== lastFlags.hasSelection ||
      flags.canDiscard !== lastFlags.canDiscard
    ) {
      lastFlags = flags;
      applyEnabledFlags(file, flags);
    }
  });
}

export type { MenuEnabledFlags };
export { installAppMenu, menuEnabledState };
