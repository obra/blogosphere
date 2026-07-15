// ABOUTME: Shared types, zustand set/get aliases, and constants for the app
// ABOUTME: store. No logic here — see state.*Actions.ts and state.ts.
import type { EntryKind, FieldEdit, PublishOptions } from "../../core/model/types";
import type { Services } from "../../core/services";
import type { EntryRecord } from "../../core/store/types";
import type {
  CommitMessageTemplates,
  ConflictResolution,
  SyncApi,
  SyncStatus,
} from "../../core/sync/types";
import type { EditorMode, Section } from "../types";

const KEYCHAIN_TOKEN_KEY = "github-token";
const META_COMMIT_TEMPLATES_KEY = "commitMessageTemplates";
const META_EDITOR_MODE_PREFIX = "editorMode:";
const DEFAULT_EDIT_DEBOUNCE_MS = 400;
const DEFAULT_SEARCH_DEBOUNCE_MS = 150;

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
  publishing: boolean;
  deleting: boolean;
  renaming: boolean;
  savingToken: boolean;
  sharingLink: boolean;
}

const INITIAL_BUSY: BusyFlags = {
  refreshing: false,
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

/** Injectable side effects, so action logic is testable without a DOM. */
interface AppStoreDeps {
  confirm: (message: string) => boolean;
  now: () => number;
  writeClipboardText: (text: string) => Promise<void>;
  createId: () => string;
  editDebounceMs: number;
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
  busy: BusyFlags;
  toasts: Toast[];

  editorModes: Record<string, EditorMode>;
  commitTemplates: CommitMessageTemplates;

  newLinkDialogOpen: boolean;
  settingsOpen: boolean;
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

  newPost(input: NewEntryFields): Promise<string>;
  newDraft(input: NewEntryFields): Promise<string>;
  newLink(input: NewLinkFields): Promise<string>;

  publishDraft(path: string, opts: PublishOptions): Promise<void>;
  shareSecretLink(path: string): Promise<void>;
  deleteEntry(path: string): Promise<void>;
  renameEntry(path: string, changes: { slug?: string; date?: string }): Promise<void>;
  resolveConflict(path: string, resolution: ConflictResolution): Promise<void>;
  saveToken(token: string): Promise<void>;

  setEditorMode(path: string, mode: EditorMode): Promise<void>;
  setCommitTemplates(templates: CommitMessageTemplates): Promise<void>;

  addToast(toast: Omit<Toast, "id">): string;
  dismissToast(id: string): void;

  openNewLinkDialog(): void;
  closeNewLinkDialog(): void;
  openSettings(): void;
  closeSettings(): void;
}

type AppState = AppData & AppActions;

/** Every entry kind the "create new" flows can produce directly. */
type CreatableKind = Extract<EntryKind, "post" | "draft" | "link">;

type GetState = () => AppState;
type SetState = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;

/** Bundles the three things nearly every action needs, so action-function
 *  signatures stay within the 4-parameter budget instead of threading
 *  get/set/deps separately through every call. */
interface ActionCtx {
  get: GetState;
  set: SetState;
  deps: AppStoreDeps;
}

/** Hardcoded per spec: the live site origin, used to build "Copy secret link" URLs. */
const SITE_ORIGIN = "https://blog.fsck.com";

const DEFAULT_COMMIT_TEMPLATES: CommitMessageTemplates = {
  newPost: "Post: {title}",
  edit: "Edit: {title}",
  newDraft: "Draft: {title}",
  newLink: "Link: {title}",
  delete: "Delete: {path}",
};

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
  DEFAULT_SEARCH_DEBOUNCE_MS,
  editorModeMetaKey,
  INITIAL_BUSY,
  KEYCHAIN_TOKEN_KEY,
  META_COMMIT_TEMPLATES_KEY,
  SITE_ORIGIN,
};
