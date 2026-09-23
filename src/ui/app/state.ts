// ABOUTME: Composes the action slices into one zustand store, and provides it
// ABOUTME: (plus the DI-friendly Provider/hooks) to the component tree.
import { createContext, createElement, type ReactNode, useContext, useEffect, useRef } from "react";
import type { UseBoundStore, StoreApi as ZustandStoreApi } from "zustand";
import { create } from "zustand";
import type { Services } from "../../core/services";
import { DEFAULT_LAYOUT_PREFS, type LayoutPrefs } from "./layoutPrefs";
import { useServices } from "./ServicesContext";
import { newDraft, newLink, newPost, publishDraft } from "./state.creationActions";
import { watchDeploy } from "./state.deployActions";
import { buildDeps } from "./state.deps";
import { deleteEntry, discardChanges, shareSecretLink } from "./state.editingActions";
import type { PendingEdits } from "./state.entryActions";
import {
  cancelEdit,
  createPendingEdits,
  edit,
  flushEdit,
  saveNow,
  select,
  setSection,
} from "./state.entryActions";
import { setColumnWidth, toggleSidebar } from "./state.layoutActions";
import type { SearchDebouncer } from "./state.listActions";
import { createSearchDebouncer, refresh, setSearchQuery } from "./state.listActions";
import type { SyncSubscriptionBox } from "./state.miscActions";
import {
  attachSync,
  copyText,
  createSyncSubscriptionBox,
  init,
  resolveConflict,
  saveToken,
  setCommitTemplates,
  setEditorMode,
  setServices,
  syncNow,
} from "./state.miscActions";
import {
  type AlertQueue,
  addToast,
  createAlertQueue,
  dismissHud,
  dismissToast,
} from "./state.noticeActions";
import { renameEntry } from "./state.renameActions";
import {
  closeConflict,
  closeNewLinkDialog,
  closePublishDialog,
  closeQuickOpen,
  closeSettings,
  closeSyncLog,
  closeVersions,
  openConflict,
  openNewLinkDialog,
  openPublishDialog,
  openQuickOpen,
  openSettings,
  openSyncLog,
  openVersions,
  toggleSyncLog,
} from "./state.sheetActions";
import type { ActionCtx, AppActions, AppData, AppState, AppStoreDeps } from "./state.types";
import { DEFAULT_COMMIT_TEMPLATES, INITIAL_BUSY, INITIAL_SECTION } from "./state.types";
import { restoreVersion } from "./state.versionsActions";

type BoundAppStore = UseBoundStore<ZustandStoreApi<AppState>>;

function initialAppData(services: Services, layout: LayoutPrefs): AppData {
  return {
    services,
    entries: [],
    selectedPath: null,
    section: INITIAL_SECTION,
    searchQuery: "",
    searchResults: null,
    syncStatus: null,
    syncLog: [],
    busy: INITIAL_BUSY,
    toasts: [],
    entriesLoadFailed: false,
    deploy: null,
    hud: null,
    editorModes: {},
    commitTemplates: DEFAULT_COMMIT_TEMPLATES,
    newLinkDialogOpen: false,
    settingsOpen: false,
    syncLogOpen: false,
    sidebarHidden: layout.sidebarHidden,
    sidebarWidth: layout.sidebarWidth,
    listWidth: layout.listWidth,
    publishDialogOpen: false,
    quickOpenOpen: false,
    versionsPath: null,
    conflictSheetPath: null,
  };
}

interface ActionResources {
  ctx: ActionCtx;
  pendingEdits: PendingEdits;
  searchDebouncer: SearchDebouncer;
  syncBox: SyncSubscriptionBox;
  alerts: AlertQueue;
}

function bindActions(resources: ActionResources): AppActions {
  const { ctx, pendingEdits, searchDebouncer, syncBox, alerts } = resources;
  return {
    setServices: (next) => setServices(ctx, syncBox, next),
    attachSync: (sync) => attachSync(ctx, syncBox, sync),
    init: () => init(ctx),
    refresh: () => refresh(ctx),
    select: (path) => select(ctx, path),
    setSection: (section) => setSection(ctx, section),
    setSearchQuery: (query) => setSearchQuery(ctx, searchDebouncer, query),
    edit: (path, change) => edit(ctx, pendingEdits, path, change),
    flushEdit: (path) => flushEdit(ctx, pendingEdits, path),
    saveNow: () => saveNow(ctx, pendingEdits),
    newPost: (input) => newPost(ctx, input),
    newDraft: (input) => newDraft(ctx, input),
    newLink: (input) => newLink(ctx, input),
    publishDraft: (path, opts) => publishDraft(ctx, path, opts),
    shareSecretLink: (path, options) => shareSecretLink(ctx, path, options),
    deleteEntry: (path) => deleteEntry(ctx, path),
    discardChanges: (path) => discardChanges(ctx, path),
    renameEntry: (path, changes) => renameEntry(ctx, path, changes),
    resolveConflict: (path, resolution) => resolveConflict(ctx, path, resolution),
    saveToken: (token) => saveToken(ctx, token),
    syncNow: () => syncNow(ctx),
    copyText: (text) => copyText(ctx, text),
    setEditorMode: (path, mode) => setEditorMode(ctx, path, mode),
    setCommitTemplates: (templates) => setCommitTemplates(ctx, templates),
    addToast: (toast) => addToast(ctx, alerts, toast),
    dismissToast: (id) => dismissToast(ctx.set, id),
    dismissHud: (id) => dismissHud(ctx.set, id),
    openNewLinkDialog: () => openNewLinkDialog(ctx.get, ctx.set),
    closeNewLinkDialog: () => closeNewLinkDialog(ctx.set),
    openSettings: () => openSettings(ctx.get, ctx.set),
    closeSettings: () => closeSettings(ctx.set),
    openSyncLog: () => openSyncLog(ctx.get, ctx.set),
    closeSyncLog: () => closeSyncLog(ctx.set),
    toggleSyncLog: () => toggleSyncLog(ctx.get, ctx.set),
    toggleSidebar: () => toggleSidebar(ctx),
    setColumnWidth: (column, width, save) => setColumnWidth(ctx, column, width, save),
    openPublishDialog: () => openPublishDialog(ctx.get, ctx.set),
    closePublishDialog: () => closePublishDialog(ctx.set),
    openQuickOpen: () => openQuickOpen(ctx.get, ctx.set),
    closeQuickOpen: () => closeQuickOpen(ctx.set),
    openVersions: (path) => openVersions(ctx.get, ctx.set, path),
    closeVersions: () => closeVersions(ctx.set),
    openConflict: (path) => openConflict(ctx.get, ctx.set, path),
    closeConflict: () => closeConflict(ctx.set),
    restoreVersion: (path, raw) => restoreVersion(ctx, path, raw),
    watchDeploy: (commitSha) => watchDeploy(ctx, commitSha),
  };
}

/**
 * Build a fresh app store bound to one Services instance. Side effects
 * (clock, confirm dialog, clipboard, id generation, debounce timing) are all
 * injectable so action logic is testable without a DOM.
 */
function createAppStore(
  services: Services,
  overrides: Partial<AppStoreDeps> = {},
  layout: Partial<LayoutPrefs> = {},
): BoundAppStore {
  const deps = buildDeps(overrides);
  const pendingEdits = createPendingEdits();
  const syncBox = createSyncSubscriptionBox();

  const store = create<AppState>()((set, get) => {
    // `flush` closes over `ctx` itself (assigned below) — safe because
    // nothing invokes it until well after this object literal finishes
    // constructing.
    const ctx: ActionCtx = {
      get,
      set,
      deps,
      flush: (path) => flushEdit(ctx, pendingEdits, path),
      cancel: (path) => cancelEdit(pendingEdits, path),
    };
    const searchDebouncer = createSearchDebouncer(ctx);
    return {
      ...initialAppData(services, { ...DEFAULT_LAYOUT_PREFS, ...layout }),
      ...bindActions({ ctx, pendingEdits, searchDebouncer, syncBox, alerts: createAlertQueue() }),
    };
  });

  store.getState().attachSync(services.sync);
  return store;
}

const AppStoreReactContext = createContext<BoundAppStore | null>(null);

interface AppStoreProviderProps {
  children: ReactNode;
  /** Test-only escape hatch: use a pre-built store instead of creating one. */
  store?: BoundAppStore;
  /** Platform-specific side-effect overrides (e.g. the Tauri clipboard
   *  writer) for a freshly-created store. Ignored when `store` is given —
   *  read once, at store creation, same as `store` itself. */
  deps?: Partial<AppStoreDeps>;
  /** Window-layout prefs read before first render (layoutPrefs.ts). */
  layout?: Partial<LayoutPrefs>;
}

/** Creates (once) and provides the app store for the Services in context. */
function AppStoreProvider(props: AppStoreProviderProps) {
  const services = useServices();
  const storeRef = useRef<BoundAppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = props.store ?? createAppStore(services, props.deps, props.layout);
  }
  const activeStore = storeRef.current;

  useEffect(() => {
    activeStore.getState().setServices(services);
  }, [activeStore, services]);

  return createElement(AppStoreReactContext.Provider, { value: activeStore }, props.children);
}

function useAppStoreContext(): BoundAppStore {
  const store = useContext(AppStoreReactContext);
  if (!store) {
    throw new Error("useAppStore was called outside an AppStoreProvider");
  }
  return store;
}

/** Select a slice of app state; re-renders only when the selected slice changes. */
function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useAppStoreContext();
  return store(selector);
}

/** Escape hatch for imperative access (event handlers, effects) to the full API. */
function useAppStoreApi(): BoundAppStore {
  return useAppStoreContext();
}

export type { AppStoreProviderProps, BoundAppStore };
export { AppStoreProvider, createAppStore, useAppStore, useAppStoreApi };
