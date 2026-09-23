// ABOUTME: Sheets (Publish, New Link, Versions, Conflict) and the other modal
// ABOUTME: surfaces (Quick Open, Settings, Activity): one at a time, like macOS.
import type { GetState, SetState } from "./state.types";

/** Whether a sheet is up; while one is, nothing else opens over it. */
function anySheetOpen(
  state: Pick<
    ReturnType<GetState>,
    "publishDialogOpen" | "newLinkDialogOpen" | "versionsPath" | "conflictSheetPath"
  >,
): boolean {
  return (
    state.publishDialogOpen ||
    state.newLinkDialogOpen ||
    state.versionsPath !== null ||
    state.conflictSheetPath !== null
  );
}

/** A sheet, Quick Open, or the Settings modal: while one is up, no other
 *  opens over it. */
function modalOpen(state: ReturnType<GetState>): boolean {
  return anySheetOpen(state) || state.quickOpenOpen || state.settingsOpen;
}

/** Opens a sheet unless something modal is already up. The Activity
 *  popover isn't modal: a sheet replaces it. */
function openSheet(get: GetState, set: SetState, change: Partial<ReturnType<GetState>>): void {
  if (!modalOpen(get())) {
    set({ ...change, syncLogOpen: false });
  }
}

function openPublishDialog(get: GetState, set: SetState): void {
  openSheet(get, set, { publishDialogOpen: true });
}

function closePublishDialog(set: SetState): void {
  set({ publishDialogOpen: false });
}

function openNewLinkDialog(get: GetState, set: SetState): void {
  openSheet(get, set, { newLinkDialogOpen: true });
}

function closeNewLinkDialog(set: SetState): void {
  set({ newLinkDialogOpen: false });
}

function openVersions(get: GetState, set: SetState, path: string): void {
  openSheet(get, set, { versionsPath: path });
}

function closeVersions(set: SetState): void {
  set({ versionsPath: null });
}

function openConflict(get: GetState, set: SetState, path: string): void {
  openSheet(get, set, { conflictSheetPath: path });
}

function closeConflict(set: SetState): void {
  set({ conflictSheetPath: null });
}

function openQuickOpen(get: GetState, set: SetState): void {
  openSheet(get, set, { quickOpenOpen: true });
}

function closeQuickOpen(set: SetState): void {
  set({ quickOpenOpen: false });
}

function openSettings(get: GetState, set: SetState): void {
  openSheet(get, set, { settingsOpen: true });
}

function closeSettings(set: SetState): void {
  set({ settingsOpen: false });
}

function openSyncLog(get: GetState, set: SetState): void {
  if (!modalOpen(get())) {
    set({ syncLogOpen: true });
  }
}

function toggleSyncLog(get: GetState, set: SetState): void {
  if (get().syncLogOpen) {
    set({ syncLogOpen: false });
  } else {
    openSyncLog(get, set);
  }
}

function closeSyncLog(set: SetState): void {
  set({ syncLogOpen: false });
}

export {
  anySheetOpen,
  closeConflict,
  closeNewLinkDialog,
  closePublishDialog,
  closeQuickOpen,
  closeSettings,
  closeSyncLog,
  closeVersions,
  modalOpen,
  openConflict,
  openNewLinkDialog,
  openPublishDialog,
  openQuickOpen,
  openSettings,
  openSyncLog,
  openVersions,
  toggleSyncLog,
};
