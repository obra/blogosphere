// ABOUTME: Keeps the menu bar's state-dependent items current: Entry and Format
// ABOUTME: enabled states, Hide/Show Sidebar's title, and View's editor modes.
import type { MenuItem, Submenu } from "@tauri-apps/api/menu";
import type { EntryRecord } from "../../core/store/types";
import { getActiveEditor, subscribeActiveEditor } from "../editor/activeEditor";
import { formatMenuItems } from "./formatCommands";
import { createItemTracker, sidebarToggleItem } from "./menuModel";
import { currentEntryItems } from "./menuState";
import type { FormatMenu } from "./menuSubmenus";
import { applyEnabled, applyText, type NativeItems } from "./nativeMenu";
import type { BoundAppStore } from "./state";
import { modalOpen } from "./state.sheetActions";
import type { AppState } from "./state.types";
import { getViewModes, subscribeViewModes, viewModeItems } from "./viewModes";

interface EntryMenu {
  submenu: Submenu;
  byId: NativeItems["byId"];
}

interface ViewMenu {
  submenu: Submenu;
  /** View › Hide/Show Sidebar — macOS only (the sidebar hides only there). */
  sidebarItem: MenuItem | null;
  /** View › the editor modes (⌃⌘1–3) — macOS only. */
  modeItems: NativeItems["byId"] | null;
}

/* Building the menu takes many IPC round trips, and the store (a restored
   selection) or the focused editor may move meanwhile: each tracker brings
   its items up to date right away, then follows changes. */

function trackFormatMenu(format: FormatMenu): () => void {
  const update = createItemTracker((models) => applyEnabled(format.byId, models));
  const sync = () => update(formatMenuItems(getActiveEditor() !== null));
  const stop = subscribeActiveEditor(sync);
  sync();
  return stop;
}

/** The Entry menu's enabled states and View › Hide/Show Sidebar's title. */
function trackStoreItems(store: BoundAppStore, entry: EntryMenu, view: ViewMenu): () => void {
  const updateEntry = createItemTracker((models) => applyEnabled(entry.byId, models));
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

/** View's editor-mode items follow whichever editor is showing: titles
 *  (Write/Markdown vs Preview/HTML) and whether Live is available. Switching
 *  entries unmounts one editor screen and mounts the next in the same beat,
 *  so updates wait a microtask and only what actually changed goes over IPC. */
function trackViewModes(view: ViewMenu): () => void {
  const { modeItems } = view;
  if (!modeItems) {
    return () => undefined;
  }
  let lastTitles: string | null = null;
  let lastEnabled: string | null = null;
  let scheduled = false;
  const sync = () => {
    const models = viewModeItems(getViewModes());
    const commands = models.flatMap((model) => (model.kind === "command" ? [model] : []));
    const titles = commands.map((model) => model.text).join("\n");
    const enabled = commands.map((model) => model.enabled).join(",");
    if (titles !== lastTitles) {
      lastTitles = titles;
      applyText(modeItems, models);
    }
    if (enabled !== lastEnabled) {
      lastEnabled = enabled;
      applyEnabled(modeItems, models);
    }
  };
  const stop = subscribeViewModes(() => {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        sync();
      });
    }
  });
  sync();
  return stop;
}

export { type EntryMenu, trackFormatMenu, trackStoreItems, trackViewModes, type ViewMenu };
