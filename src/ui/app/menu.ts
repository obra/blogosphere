// ABOUTME: Native app menu (Tauri runtime only): builds and installs the menu
// ABOUTME: bar; menuTracking.ts keeps its items current. Browser dev keeps DOM shortcuts.
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import type { Section } from "../types";
import { SECTIONS } from "../types";
import { SECTION_LABELS } from "./grouping";
import { FILE_MENU_COMMANDS, runMenuCommand, sidebarToggleItem } from "./menuModel";
import { currentEntryItems } from "./menuState";
import {
  buildEditSubmenu,
  buildFormatSubmenu,
  buildHelpSubmenu,
  buildWindowSubmenu,
  separator,
} from "./menuSubmenus";
import { type EntryMenu, trackFormatMenu, trackStoreItems, type ViewMenu } from "./menuTracking";
import { buildNativeItems } from "./nativeMenu";
import type { BoundAppStore } from "./state";
import { modalOpen } from "./state.sheetActions";

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

/** The selected entry's commands (Publish…, Open on Site, Versions…, …). */
async function buildEntrySubmenu(store: BoundAppStore): Promise<EntryMenu> {
  const { items, byId } = await buildNativeItems(currentEntryItems(store.getState()), (id) =>
    runMenuCommand(id, store),
  );
  return { submenu: await Submenu.new({ text: "Entry", items }), byId };
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

export { installAppMenu };
