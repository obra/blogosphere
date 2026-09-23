// ABOUTME: What the Entry menu acts on: the selected record and its live URL,
// ABOUTME: or nothing while a sheet is up. Pure, so it's testable without Tauri.
import type { ModelApi } from "../../core/model/types";
import type { EntryRecord } from "../../core/store/types";
import { entryLiveUrl } from "./liveUrl";
import { entryMenuItems, type MenuItemModel } from "./menuModel";
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

export { currentEntryItems, type EntryMenuState, entryMenuState };
