// ABOUTME: Sheets (Publish, New Link, Versions, Conflict) and Quick Open: one
// ABOUTME: at a time, like a window's sheets on macOS.
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

function unlessSheetOpen(get: GetState, set: SetState, change: Parameters<SetState>[0]): void {
  if (!anySheetOpen(get())) {
    set(change);
  }
}

function openPublishDialog(get: GetState, set: SetState): void {
  unlessSheetOpen(get, set, { publishDialogOpen: true });
}

function closePublishDialog(set: SetState): void {
  set({ publishDialogOpen: false });
}

function openNewLinkDialog(get: GetState, set: SetState): void {
  unlessSheetOpen(get, set, { newLinkDialogOpen: true });
}

function closeNewLinkDialog(set: SetState): void {
  set({ newLinkDialogOpen: false });
}

function openVersions(get: GetState, set: SetState, path: string): void {
  unlessSheetOpen(get, set, { versionsPath: path });
}

function closeVersions(set: SetState): void {
  set({ versionsPath: null });
}

function openConflict(get: GetState, set: SetState, path: string): void {
  unlessSheetOpen(get, set, { conflictSheetPath: path });
}

function closeConflict(set: SetState): void {
  set({ conflictSheetPath: null });
}

function openQuickOpen(get: GetState, set: SetState): void {
  unlessSheetOpen(get, set, { quickOpenOpen: true });
}

function closeQuickOpen(set: SetState): void {
  set({ quickOpenOpen: false });
}

export {
  anySheetOpen,
  closeConflict,
  closeNewLinkDialog,
  closePublishDialog,
  closeQuickOpen,
  closeVersions,
  openConflict,
  openNewLinkDialog,
  openPublishDialog,
  openQuickOpen,
  openVersions,
};
