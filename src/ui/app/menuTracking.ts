// ABOUTME: Keeps the menu bar's state-dependent items current: Entry and Format
// ABOUTME: enabled states, Hide/Show Sidebar's title, and View's editor modes.
import type { MenuItem, Submenu } from "@tauri-apps/api/menu";
import type { EntryRecord } from "../../core/store/types";
import { getActiveEditor, subscribeActiveEditor } from "../editor/activeEditor";
import { formatMenuItems } from "./formatCommands";
import { createEnabledTracker, sidebarToggleItem } from "./menuModel";
import { currentEntryItems } from "./menuState";
import type { FormatMenu } from "./menuSubmenus";
import { applyEnabled, type NativeItems } from "./nativeMenu";
import type { BoundAppStore } from "./state";
import { modalOpen } from "./state.sheetActions";
import type { AppState } from "./state.types";

interface EntryMenu {
  submenu: Submenu;
  byId: NativeItems["byId"];
}

interface ViewMenu {
  submenu: Submenu;
  /** View › Hide/Show Sidebar — macOS only (the sidebar hides only there). */
  sidebarItem: MenuItem | null;
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

export { type EntryMenu, trackFormatMenu, trackStoreItems, type ViewMenu };
