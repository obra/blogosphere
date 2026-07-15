// ABOUTME: Everything else: services/sync wiring, init, conflict resolution,
// ABOUTME: token save, per-entry editor mode, commit templates, toasts, dialogs.
import type { Services } from "../../core/services";
import type { CommitMessageTemplates, ConflictResolution, SyncApi } from "../../core/sync/types";
import type { EditorMode } from "../types";
import { parseCommitTemplates } from "./state.deps";
import { refresh } from "./state.entryActions";
import type { ActionCtx, SetState, Toast } from "./state.types";
import { editorModeMetaKey, KEYCHAIN_TOKEN_KEY, META_COMMIT_TEMPLATES_KEY } from "./state.types";

interface SyncSubscriptionBox {
  unsubscribe: (() => void) | null;
}

function createSyncSubscriptionBox(): SyncSubscriptionBox {
  return { unsubscribe: null };
}

function attachSync(ctx: ActionCtx, box: SyncSubscriptionBox, sync: SyncApi | null): void {
  box.unsubscribe?.();
  box.unsubscribe = null;
  if (!sync) {
    ctx.set({ syncStatus: null });
    return;
  }
  ctx.set({ syncStatus: sync.status() });
  box.unsubscribe = sync.onStatus((status) => {
    ctx.set({ syncStatus: status });
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

function openNewLinkDialog(set: SetState): void {
  set({ newLinkDialogOpen: true });
}

function closeNewLinkDialog(set: SetState): void {
  set({ newLinkDialogOpen: false });
}

function openSettings(set: SetState): void {
  set({ settingsOpen: true });
}

function closeSettings(set: SetState): void {
  set({ settingsOpen: false });
}

export type { SyncSubscriptionBox };
export {
  addToast,
  attachSync,
  closeNewLinkDialog,
  closeSettings,
  createSyncSubscriptionBox,
  dismissToast,
  init,
  openNewLinkDialog,
  openSettings,
  resolveConflict,
  saveToken,
  setCommitTemplates,
  setEditorMode,
  setServices,
};
