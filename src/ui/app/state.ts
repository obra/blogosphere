// ABOUTME: Composes the action slices into one zustand store, and provides it
// ABOUTME: (plus the DI-friendly Provider/hooks) to the component tree.
import { createContext, createElement, type ReactNode, useContext, useEffect, useRef } from "react";
import type { UseBoundStore, StoreApi as ZustandStoreApi } from "zustand";
import { create } from "zustand";
import type { Services } from "../../core/services";
import { useServices } from "./ServicesContext";
import { newDraft, newLink, newPost, publishDraft } from "./state.creationActions";
import { buildDeps } from "./state.deps";
import { deleteEntry, renameEntry, shareSecretLink } from "./state.editingActions";
import type { PendingEdits, SearchDebouncer } from "./state.entryActions";
import {
  createPendingEdits,
  createSearchDebouncer,
  edit,
  flushEdit,
  refresh,
  saveNow,
  select,
  setSearchQuery,
  setSection,
} from "./state.entryActions";
import type { SyncSubscriptionBox } from "./state.miscActions";
import {
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
} from "./state.miscActions";
import type { ActionCtx, AppActions, AppData, AppState, AppStoreDeps } from "./state.types";
import { DEFAULT_COMMIT_TEMPLATES, INITIAL_BUSY } from "./state.types";

type BoundAppStore = UseBoundStore<ZustandStoreApi<AppState>>;

function initialAppData(services: Services): AppData {
  return {
    services,
    entries: [],
    selectedPath: null,
    section: "drafts",
    searchQuery: "",
    searchResults: null,
    syncStatus: null,
    busy: INITIAL_BUSY,
    toasts: [],
    editorModes: {},
    commitTemplates: DEFAULT_COMMIT_TEMPLATES,
    newLinkDialogOpen: false,
    settingsOpen: false,
  };
}

interface ActionResources {
  ctx: ActionCtx;
  pendingEdits: PendingEdits;
  searchDebouncer: SearchDebouncer;
  syncBox: SyncSubscriptionBox;
}

function bindActions(resources: ActionResources): AppActions {
  const { ctx, pendingEdits, searchDebouncer, syncBox } = resources;
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
    shareSecretLink: (path) => shareSecretLink(ctx, path),
    deleteEntry: (path) => deleteEntry(ctx, path),
    renameEntry: (path, changes) => renameEntry(ctx, path, changes),
    resolveConflict: (path, resolution) => resolveConflict(ctx, path, resolution),
    saveToken: (token) => saveToken(ctx, token),
    setEditorMode: (path, mode) => setEditorMode(ctx, path, mode),
    setCommitTemplates: (templates) => setCommitTemplates(ctx, templates),
    addToast: (toast) => addToast(ctx, toast),
    dismissToast: (id) => dismissToast(ctx.set, id),
    openNewLinkDialog: () => openNewLinkDialog(ctx.set),
    closeNewLinkDialog: () => closeNewLinkDialog(ctx.set),
    openSettings: () => openSettings(ctx.set),
    closeSettings: () => closeSettings(ctx.set),
  };
}

/**
 * Build a fresh app store bound to one Services instance. Side effects
 * (clock, confirm dialog, clipboard, id generation, debounce timing) are all
 * injectable so action logic is testable without a DOM.
 */
function createAppStore(services: Services, overrides: Partial<AppStoreDeps> = {}): BoundAppStore {
  const deps = buildDeps(overrides);
  const pendingEdits = createPendingEdits();
  const syncBox = createSyncSubscriptionBox();

  const store = create<AppState>()((set, get) => {
    const ctx: ActionCtx = { get, set, deps };
    const searchDebouncer = createSearchDebouncer(ctx);
    return {
      ...initialAppData(services),
      ...bindActions({ ctx, pendingEdits, searchDebouncer, syncBox }),
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
}

/** Creates (once) and provides the app store for the Services in context. */
function AppStoreProvider(props: AppStoreProviderProps) {
  const services = useServices();
  const storeRef = useRef<BoundAppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = props.store ?? createAppStore(services, props.deps);
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
