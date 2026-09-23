// ABOUTME: Shared types, zustand set/get aliases, and constants for the app
// ABOUTME: store. No logic here — see state.*Actions.ts and state.ts.
import type { EntryKind, FieldEdit, PublishOptions } from "../../core/model/types";
import type { Services } from "../../core/services";
import type { EntryRecord } from "../../core/store/types";
import { DEFAULT_COMMIT_MESSAGE_TEMPLATES, META_COMMIT_TEMPLATES } from "../../core/sync/meta";
import type {
  CommitMessageTemplates,
  ConflictResolution,
  SyncApi,
  SyncLogEntry,
  SyncStatus,
} from "../../core/sync/types";
import type { EditorMode, Section } from "../types";

const KEYCHAIN_TOKEN_KEY = "github-token";
/** The section a fresh launch starts in — shared by initialAppData and
 *  restoreLastPosition's has-the-user-navigated-yet check, which must agree
 *  on what "still the untouched default" looks like. */
const INITIAL_SECTION: Section = "drafts";
// Kept as a locally-named alias so call sites in this slice don't change,
// but the value itself now comes from core/sync/meta.ts — the app store and
// the sync engine must never again drift onto two different meta keys for
// the same setting (see state.commitTemplates.integration.test.ts, which
// proves a template saved here changes the commit message the sync engine
// produces).
const META_COMMIT_TEMPLATES_KEY = META_COMMIT_TEMPLATES;
const META_EDITOR_MODE_PREFIX = "editorMode:";
const DEFAULT_EDIT_DEBOUNCE_MS = 400;
/** Upper bound between a keystroke and its local commit while typing
 *  continuously: the debounce timer resets on every keystroke, so without
 *  this cap an unbroken burst never commits and a hard kill (crash, force
 *  quit, mobile OS reaping a backgrounded app) loses the whole burst —
 *  this bounds that loss to ~2s of typing. */
const DEFAULT_EDIT_MAX_UNCOMMITTED_MS = 2000;
const DEFAULT_SEARCH_DEBOUNCE_MS = 150;
/** Activity-log ring size — enough history to diagnose a session, bounded. */
const SYNC_LOG_CAP = 200;

/**
 * Shared stable reference for "no conflicts" (syncStatus is null: no token
 * configured yet). Every `useAppStore((state) => state.syncStatus?.conflicts
 * ?? EMPTY_CONFLICTS)` call site MUST use this constant, never a fresh `[]`
 * literal: zustand's useSyncExternalStore compares selector results by
 * reference, and a new `[]` on every call reads as "the store changed" on
 * every render, forever — an actual infinite render loop (React: "Maximum
 * update depth exceeded"), not just a wasted re-render. Never mutate this.
 */
const EMPTY_CONFLICTS: string[] = [];

function editorModeMetaKey(path: string): string {
  return `${META_EDITOR_MODE_PREFIX}${path}`;
}

/** A single debounced edit: either the body (WYSIWYG/source) or known-field edits. */
type EditChange = { kind: "body"; body: string } | { kind: "fields"; edits: FieldEdit[] };

interface Toast {
  id: string;
  message: string;
  tone: "error" | "info" | "success";
  retry?: () => void;
}

interface BusyFlags {
  refreshing: boolean;
  creating: boolean;
  publishing: boolean;
  deleting: boolean;
  renaming: boolean;
  savingToken: boolean;
  sharingLink: boolean;
}

const INITIAL_BUSY: BusyFlags = {
  refreshing: false,
  creating: false,
  publishing: false,
  deleting: false,
  renaming: false,
  savingToken: false,
  sharingLink: false,
};

interface NewEntryFields {
  title: string;
  /** YYYY-MM-DD; defaults to today when omitted. */
  date?: string;
}

interface NewLinkFields extends NewEntryFields {
  url: string;
}

/** Injectable side effects, so action logic is testable without a DOM.
 *  `confirm` may resolve async: the Tauri runtime injects the native NSAlert
 *  (tauri-plugin-dialog), which is Promise-based; browser/dev and tests use
 *  the synchronous window.confirm / a stub. */
interface AppStoreDeps {
  confirm: (message: string) => boolean | Promise<boolean>;
  now: () => number;
  writeClipboardText: (text: string) => Promise<void>;
  createId: () => string;
  editDebounceMs: number;
  editMaxUncommittedMs: number;
  searchDebounceMs: number;
}

/** Plain data fields — everything a selector can read. */
interface AppData {
  services: Services;

  entries: EntryRecord[];
  selectedPath: string | null;
  section: Section;
  searchQuery: string;
  /** null = not searching; render the section-filtered `entries` instead. */
  searchResults: EntryRecord[] | null;

  syncStatus: SyncStatus | null;
  /** Rolling activity log fed by SyncApi.onLog (capped at SYNC_LOG_CAP). */
  syncLog: SyncLogEntry[];
  busy: BusyFlags;
  toasts: Toast[];

  editorModes: Record<string, EditorMode>;
  commitTemplates: CommitMessageTemplates;

  newLinkDialogOpen: boolean;
  settingsOpen: boolean;
  syncLogOpen: boolean;
  publishDialogOpen: boolean;
  /** ⌘K fuzzy jump-to-entry palette. */
  quickOpenOpen: boolean;
  /** Path whose git history the Versions panel is showing, or null (closed). */
  versionsPath: string | null;
  /** The person hid the sidebar (macOS; ⌃⌘S or the toolbar toggle). */
  sidebarHidden: boolean;
}

/** Everything that mutates the store. */
interface AppActions {
  setServices(services: Services): void;
  attachSync(sync: SyncApi | null): void;

  init(): Promise<void>;
  refresh(): Promise<void>;
  select(path: string | null): void;
  setSection(section: Section): void;
  setSearchQuery(query: string): void;

  edit(path: string, change: EditChange): void;
  flushEdit(path?: string): Promise<void>;
  saveNow(): Promise<void>;

  /** Resolves to the new entry's path, or null if creation failed (reported
   *  via a toast with a retry — see state.creationActions.ts's createNew). */
  newPost(input: NewEntryFields): Promise<string | null>;
  newDraft(input: NewEntryFields): Promise<string | null>;
  newLink(input: NewLinkFields): Promise<string | null>;

  publishDraft(path: string, opts: PublishOptions): Promise<void>;
  shareSecretLink(path: string): Promise<void>;
  deleteEntry(path: string): Promise<void>;
  /** Revert an entry's working copy to its last-synced base (confirm-gated).
   *  Cancels any still-debounced keystrokes rather than committing them. */
  discardChanges(path: string): Promise<void>;
  renameEntry(path: string, changes: { slug?: string; date?: string }): Promise<void>;
  resolveConflict(path: string, resolution: ConflictResolution): Promise<void>;
  saveToken(token: string): Promise<void>;
  /** User-initiated "sync now" (⌘R / the sidebar sync button). No-op until a
   *  token is configured; failures surface through syncStatus, not a throw. */
  syncNow(): Promise<void>;
  /** Copy arbitrary text via the injected clipboard dep (Tauri or browser). */
  copyText(text: string): Promise<void>;

  setEditorMode(path: string, mode: EditorMode): Promise<void>;
  setCommitTemplates(templates: CommitMessageTemplates): Promise<void>;

  addToast(toast: Omit<Toast, "id">): string;
  dismissToast(id: string): void;

  openNewLinkDialog(): void;
  closeNewLinkDialog(): void;
  openSettings(): void;
  closeSettings(): void;
  openSyncLog(): void;
  closeSyncLog(): void;
  toggleSyncLog(): void;
  toggleSidebar(): void;
  openPublishDialog(): void;
  closePublishDialog(): void;
  openQuickOpen(): void;
  closeQuickOpen(): void;
  openVersions(path: string): void;
  closeVersions(): void;

  /** Replace an entry's working copy with `raw` (a past version from git
   *  history), marked dirty — the Versions panel's "Restore". */
  restoreVersion(path: string, raw: string): Promise<void>;

  /** Follow the Actions run for a just-pushed commit until the deploy lands
   *  (or fails), reporting through the activity log. Fire-and-forget; must
   *  tolerate tokens without Actions read scope. */
  watchDeploy(commitSha: string): Promise<void>;
}

type AppState = AppData & AppActions;

/** Every entry kind the "create new" flows can produce directly. */
type CreatableKind = Extract<EntryKind, "post" | "draft" | "link">;

type GetState = () => AppState;
type SetState = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;

/** Bundles the things nearly every action needs, so action-function
 *  signatures stay within the 4-parameter budget instead of threading
 *  get/set/deps/pendingEdits separately through every call.
 *
 *  `flush` forces any debounced-but-not-yet-committed edit(s) for `path`
 *  (or every pending path, if omitted) into the store immediately — bound
 *  once in state.ts to the store's single PendingEdits map. Every action
 *  that reads an entry's workingContent to build something durable from it
 *  (publish, rename, delete, share-secret-link) MUST call this first, or it
 *  risks silently working from a stale pre-edit snapshot while the user's
 *  actual last keystrokes are still sitting in the debounce timer.
 *
 *  `cancel` is flush's opposite: it drops a path's pending debounced edit
 *  WITHOUT committing it — for discardChanges, where flushing would commit
 *  the very keystrokes being thrown away. */
interface ActionCtx {
  get: GetState;
  set: SetState;
  deps: AppStoreDeps;
  flush: (path?: string) => Promise<void>;
  cancel: (path: string) => void;
}

/** Hardcoded per spec: the live site origin, used to build "Copy secret link" URLs. */
const SITE_ORIGIN = "https://blog.fsck.com";

// Aliased (not redeclared) so the app store's seeded default and the sync
// engine's own fallback (core/sync/meta.ts's loadCommitMessageTemplates)
// can never again drift onto two independently hand-copied literals — the
// same lesson META_COMMIT_TEMPLATES_KEY above already applies to the meta
// *key*. See state.commitTemplates.integration.test.ts.
const DEFAULT_COMMIT_TEMPLATES: CommitMessageTemplates = DEFAULT_COMMIT_MESSAGE_TEMPLATES;

export type {
  ActionCtx,
  AppActions,
  AppData,
  AppState,
  AppStoreDeps,
  BusyFlags,
  CreatableKind,
  EditChange,
  GetState,
  NewEntryFields,
  NewLinkFields,
  SetState,
  Toast,
};
export {
  DEFAULT_COMMIT_TEMPLATES,
  DEFAULT_EDIT_DEBOUNCE_MS,
  DEFAULT_EDIT_MAX_UNCOMMITTED_MS,
  DEFAULT_SEARCH_DEBOUNCE_MS,
  EMPTY_CONFLICTS,
  editorModeMetaKey,
  INITIAL_BUSY,
  INITIAL_SECTION,
  KEYCHAIN_TOKEN_KEY,
  META_COMMIT_TEMPLATES_KEY,
  SITE_ORIGIN,
  SYNC_LOG_CAP,
};
