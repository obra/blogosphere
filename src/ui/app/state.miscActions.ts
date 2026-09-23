// ABOUTME: Everything else: services/sync wiring, init, conflict resolution,
// ABOUTME: token save, per-entry editor mode, commit templates, toasts, dialogs.
import type { Services } from "../../core/services";
import type { CommitMessageTemplates, ConflictResolution, SyncApi } from "../../core/sync/types";
import type { EditorMode } from "../types";
import { parseCommitTemplates } from "./state.deps";
import { refresh } from "./state.entryActions";
import { restoreLastPosition } from "./state.lastPositionActions";
import type { ActionCtx, SetState, Toast } from "./state.types";
import {
  editorModeMetaKey,
  KEYCHAIN_TOKEN_KEY,
  META_COMMIT_TEMPLATES_KEY,
  SYNC_LOG_CAP,
} from "./state.types";

interface SyncSubscriptionBox {
  unsubscribe: (() => void) | null;
  unsubscribeLog: (() => void) | null;
}

function createSyncSubscriptionBox(): SyncSubscriptionBox {
  return { unsubscribe: null, unsubscribeLog: null };
}

function attachSync(ctx: ActionCtx, box: SyncSubscriptionBox, sync: SyncApi | null): void {
  box.unsubscribe?.();
  box.unsubscribe = null;
  box.unsubscribeLog?.();
  box.unsubscribeLog = null;
  if (!sync) {
    // syncLog is deliberately left intact: the history of what happened
    // before a disconnect is exactly what a user debugging one wants to see.
    ctx.set({ syncStatus: null });
    return;
  }
  const initialStatus = sync.status();
  ctx.set({ syncStatus: initialStatus });
  let wasSyncing = initialStatus.state === "syncing";
  box.unsubscribe = sync.onStatus((status) => {
    ctx.set({ syncStatus: status });
    // pull()/bootstrap() write straight to the store, bypassing the local
    // entries cache — reload it whenever a sync round just finished
    // (regardless of outcome) so remote-side changes actually show up
    // instead of waiting for some unrelated action to call refresh().
    const justFinished = wasSyncing && status.state !== "syncing";
    wasSyncing = status.state === "syncing";
    if (justFinished) {
      // Not awaited: onStatus's callback type is synchronous, and refresh()
      // already reports its own failures as a toast (see state.entryActions.ts)
      // rather than rejecting, so there's nothing more to do with the result here.
      refresh(ctx);
    }
  });
  box.unsubscribeLog = sync.onLog((entry) => {
    ctx.set((state) => ({ syncLog: [...state.syncLog, entry].slice(-SYNC_LOG_CAP) }));
    if (entry.commitSha !== undefined) {
      // A push landed — follow its Actions run to "live on the site".
      // Fire-and-forget; watchDeploy owns its own error handling.
      ctx.get().watchDeploy(entry.commitSha);
    }
  });
}

function setServices(ctx: ActionCtx, box: SyncSubscriptionBox, nextServices: Services): void {
  const prevSync = ctx.get().services.sync;
  ctx.set({ services: nextServices });
  if (nextServices.sync !== prevSync) {
    attachSync(ctx, box, nextServices.sync);
  }
}

async function init(ctx: ActionCtx): Promise<void> {
  const raw = await ctx.get().services.store.getMeta(META_COMMIT_TEMPLATES_KEY);
  if (raw) {
    const templates = parseCommitTemplates(raw);
    if (templates) {
      ctx.set({ commitTemplates: templates });
    }
  }
  await refresh(ctx);
  // Restore the section/entry the user had open last time — needs `entries`
  // populated (just above) to check the selected path still exists.
  await restoreLastPosition(ctx);
}

async function resolveConflict(
  ctx: ActionCtx,
  path: string,
  resolution: ConflictResolution,
): Promise<void> {
  const svc = ctx.get().services;
  if (!svc.sync) {
    return;
  }
  try {
    await svc.sync.resolveConflict(path, resolution);
    ctx.set((state) => (state.conflictSheetPath === path ? { conflictSheetPath: null } : {}));
    await refresh(ctx);
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't resolve the conflict.",
      retry: () => resolveConflict(ctx, path, resolution),
    });
  }
}

async function saveToken(ctx: ActionCtx, token: string): Promise<void> {
  ctx.set((state) => ({ busy: { ...state.busy, savingToken: true } }));
  try {
    await ctx.get().services.shell.keychainSet(KEYCHAIN_TOKEN_KEY, token);
  } catch (error) {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't save the token.",
      retry: () => saveToken(ctx, token),
    });
    // Rethrow so the caller (SettingsScreen) knows not to run its "rebuild
    // sync" callback — the token was never actually persisted.
    throw error;
  } finally {
    ctx.set((state) => ({ busy: { ...state.busy, savingToken: false } }));
  }
}

async function setEditorMode(ctx: ActionCtx, path: string, mode: EditorMode): Promise<void> {
  ctx.set((state) => ({ editorModes: { ...state.editorModes, [path]: mode } }));
  await ctx.get().services.store.setMeta(editorModeMetaKey(path), mode);
}

async function setCommitTemplates(
  ctx: ActionCtx,
  templates: CommitMessageTemplates,
): Promise<void> {
  ctx.set({ commitTemplates: templates });
  await ctx.get().services.store.setMeta(META_COMMIT_TEMPLATES_KEY, JSON.stringify(templates));
}

function addToast(ctx: ActionCtx, toast: Omit<Toast, "id">): string {
  const id = ctx.deps.createId();
  ctx.set((state) => ({ toasts: [...state.toasts, { id, ...toast }] }));
  return id;
}

function dismissToast(set: SetState, id: string): void {
  set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
}

async function syncNow(ctx: ActionCtx): Promise<void> {
  const { sync } = ctx.get().services;
  if (!sync) {
    return;
  }
  // sync() resolves (never throws) for offline; anything else unexpected
  // still lands in syncStatus via onStatus. The catch is belt-and-braces.
  await sync.sync().catch(() => undefined);
}

async function copyText(ctx: ActionCtx, text: string): Promise<void> {
  await ctx.deps.writeClipboardText(text).catch(() => undefined);
}

function openSettings(set: SetState): void {
  set({ settingsOpen: true });
}

function closeSettings(set: SetState): void {
  set({ settingsOpen: false });
}

function openSyncLog(set: SetState): void {
  set({ syncLogOpen: true });
}

function toggleSyncLog(set: SetState): void {
  set((state) => ({ syncLogOpen: !state.syncLogOpen }));
}

function closeSyncLog(set: SetState): void {
  set({ syncLogOpen: false });
}

export type { SyncSubscriptionBox };
export {
  addToast,
  attachSync,
  closeSettings,
  closeSyncLog,
  copyText,
  createSyncSubscriptionBox,
  dismissToast,
  init,
  openSettings,
  openSyncLog,
  resolveConflict,
  saveToken,
  setCommitTemplates,
  setEditorMode,
  setServices,
  syncNow,
  toggleSyncLog,
};
