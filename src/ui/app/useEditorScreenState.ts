// ABOUTME: Local-echo + debounced-persist state for the open entry in
// ABOUTME: EditorScreen: title/tags/body/date/mode, each wired to the store.
import { useEffect, useMemo, useRef, useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import type { EditorMode } from "../types";
import { makeOnImage, makeResolveImage } from "./editorImageHandlers";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";
import { DEFAULT_EDIT_DEBOUNCE_MS, EMPTY_CONFLICTS, SITE_ORIGIN } from "./state.types";

interface ParsedView {
  title: string | null;
  tags: string[];
  body: string;
  /** Site-relative permalink (null when the model can't derive one). */
  permalink: string | null;
}

function useParsedView(record: EntryRecord): ParsedView | null {
  const services = useServices();
  return useMemo(() => {
    const result = services.model.parseEntry(record.path, record.workingContent);
    if (!result.ok) {
      return null;
    }
    return {
      title: result.entry.title,
      tags: result.entry.tags,
      body: result.entry.body,
      permalink: services.model.permalinkFor(result.entry),
    };
  }, [record, services]);
}

/** The full URL where the live site serves this entry, or null when nothing
 *  is (or will be) reachable: drafts without an opaqueId never render in the
 *  production build, and some legacy entries have no derivable permalink. */
function liveUrlFor(record: EntryRecord, parsed: ParsedView | null): string | null {
  if (!parsed?.permalink) {
    return null;
  }
  if (record.draft && !record.opaqueId) {
    return null;
  }
  return `${SITE_ORIGIN}${parsed.permalink}`;
}

function useEditorCommitHandlers(path: string) {
  const store = useAppStoreApi();
  return useMemo(
    () => ({
      commitTitle: (value: string) =>
        store.getState().edit(path, { kind: "fields", edits: [{ field: "title", value }] }),
      commitTags: (value: string[]) =>
        store.getState().edit(path, { kind: "fields", edits: [{ field: "tags", value }] }),
      commitBody: (body: string) => store.getState().edit(path, { kind: "body", body }),
      commitDate: (date: string) => store.getState().renameEntry(path, { date }),
      commitMode: (mode: EditorMode) => store.getState().setEditorMode(path, mode),
    }),
    [store, path],
  );
}

/** Margin past the store's edit debounce before the deferred reconcile runs,
 *  so the burst's own commit has landed by then. */
const RECONCILE_MARGIN_MS = 250;

/** How long after the user's last keystroke the reconciling effect keeps its
 *  hands off the local echo. Longer than the store's edit debounce on
 *  purpose: by the time the deferred pass runs, the burst's own commit has
 *  landed, so reconciling from the store is a visual no-op for plain typing
 *  (same strings) instead of a flicker back to a not-yet-committed snapshot. */
const LOCAL_EDIT_WINDOW_MS = DEFAULT_EDIT_DEBOUNCE_MS + RECONCILE_MARGIN_MS;

/**
 * Local-echo title/tags/body, kept in sync with `record.workingContent`
 * without a remount, since EditorScreenBody is keyed only by path
 * (EditorScreen.tsx), so it never remounts when the *content* at the same
 * path changes underneath it. pull()'s fast-forward/diff3-merge, conflict
 * resolution, and discardChanges all write straight to the store, bypassing
 * this component entirely; without the reconciling effect below, the editor
 * would keep showing stale text until the user switched entries and back,
 * and resuming typing on that stale text would silently blow away whatever
 * landed externally.
 *
 * Two guards shape when reconciliation runs:
 *  - `localEditPendingRef` defers it for LOCAL_EDIT_WINDOW_MS after the
 *    user's own last keystroke, so an external change landing mid-burst
 *    doesn't blow away in-progress typing. The window's expiry bumps
 *    `reconcileTick` so the deferred pass actually runs (deferred, never
 *    dropped).
 *  - `localDivergedRef` records that the user has typed since the last
 *    reconcile. It closes the discard hole: discardChanges restores content
 *    equal to the last-reconciled snapshot, which a bare "did
 *    workingContent change?" check reads as nothing-to-do while the editor
 *    still shows the discarded keystrokes. A store row that is clean
 *    (dirty: false) while the echo has diverged means the store was
 *    authoritatively reverted — reconcile even though the content string
 *    never "changed".
 */
/** Reconcile when the store's content moved, or when a revert landed: the
 *  row is clean while the echo has diverged (discard restores content equal
 *  to the last-reconciled snapshot, so the string alone can't signal it). */
function needsReconcile(record: EntryRecord, syncedContent: string, diverged: boolean): boolean {
  return record.workingContent !== syncedContent || (diverged && !record.dirty);
}

interface EchoSetters {
  setTitleState: (value: string) => void;
  setTagsState: (value: string[]) => void;
  setBodyState: (value: string) => void;
}

function applyParsedToEcho(parsed: ParsedView | null, setters: EchoSetters): void {
  if (!parsed) {
    return;
  }
  setters.setTitleState(parsed.title ?? "");
  setters.setTagsState(parsed.tags);
  setters.setBodyState(parsed.body);
}

function useLocalEcho(record: EntryRecord, parsed: ParsedView | null) {
  // Ternaries on `parsed` narrowing it to non-null (rather than `parsed?.x
  // ?? fallback`) so both type checkers agree there's nothing left to guard:
  // tsc sees .tags/.body (non-nullable fields) need no `??`, and Biome's
  // checker — which doesn't model tsconfig's noUncheckedIndexedAccess, only
  // "is the receiver's own type nullable" — agrees, since after `parsed ?`
  // the receiver plainly is ParsedView, not ParsedView | null.
  const [title, setTitleState] = useState(parsed ? (parsed.title ?? "") : "");
  const [tags, setTagsState] = useState<string[]>(parsed ? parsed.tags : []);
  const [body, setBodyState] = useState(parsed ? parsed.body : "");
  const [reconcileTick, setReconcileTick] = useState(0);
  const syncedContentRef = useRef(record.workingContent);
  const localEditPendingRef = useRef(false);
  const localDivergedRef = useRef(false);
  const windowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (windowTimerRef.current !== null) {
        clearTimeout(windowTimerRef.current);
      }
    },
    [],
  );

  // reconcileTick is deliberately an extra dep — it re-runs the deferred
  // pass after the local-edit window expires.
  useEffect(() => {
    if (
      localEditPendingRef.current ||
      !needsReconcile(record, syncedContentRef.current, localDivergedRef.current)
    ) {
      return;
    }
    syncedContentRef.current = record.workingContent;
    localDivergedRef.current = false;
    applyParsedToEcho(parsed, { setTitleState, setTagsState, setBodyState });
  }, [record, parsed, reconcileTick]);

  function markLocalEditPending() {
    localEditPendingRef.current = true;
    localDivergedRef.current = true;
    // Reset (not stack) the timer: the window measures from the LAST
    // keystroke — stacked timeouts from earlier keystrokes would clear the
    // flag mid-burst.
    if (windowTimerRef.current !== null) {
      clearTimeout(windowTimerRef.current);
    }
    windowTimerRef.current = setTimeout(() => {
      localEditPendingRef.current = false;
      setReconcileTick((tick) => tick + 1);
    }, LOCAL_EDIT_WINDOW_MS);
  }

  return { title, tags, body, setTitleState, setTagsState, setBodyState, markLocalEditPending };
}

const HTML_EXTENSION = ".html";

/** Keyed by path at the call site (EditorScreen), so switching entries
 *  re-initializes this local state instead of carrying over stale text. */
function useEditorScreenState(record: EntryRecord) {
  const services = useServices();
  const parsed = useParsedView(record);
  const handlers = useEditorCommitHandlers(record.path);
  const echo = useLocalEcho(record, parsed);
  const persistedMode = useAppStore((state) => state.editorModes[record.path] ?? "wysiwyg");
  const conflicts = useAppStore((state) => state.syncStatus?.conflicts ?? EMPTY_CONFLICTS);

  // The ~440 legacy 1996-2014 LiveJournal-import .html posts are source-mode
  // only — Milkdown/Crepe is markdown-only and must stay unreachable for
  // them. Force source mode here regardless of any per-entry persisted
  // toggle (a stale "wysiwyg" preference saved before this file existed, or
  // just never cleared) — this is the single point every other WYSIWYG-vs-
  // source decision for this entry flows through.
  const isLegacyHtml = record.path.endsWith(HTML_EXTENSION);
  const editorMode: EditorMode = isLegacyHtml ? "source" : persistedMode;

  function setTitle(value: string) {
    echo.setTitleState(value);
    echo.markLocalEditPending();
    handlers.commitTitle(value);
  }
  function setTags(value: string[]) {
    echo.setTagsState(value);
    echo.markLocalEditPending();
    handlers.commitTags(value);
  }
  function setBody(value: string) {
    echo.setBodyState(value);
    echo.markLocalEditPending();
    handlers.commitBody(value);
  }

  return {
    parsed,
    title: echo.title,
    tags: echo.tags,
    body: echo.body,
    editorMode,
    isLegacyHtml,
    sourceLanguage: isLegacyHtml ? ("html" as const) : ("markdown" as const),
    isConflicted: conflicts.includes(record.path),
    liveUrl: liveUrlFor(record, parsed),
    resolveImage: useMemo(() => makeResolveImage(services, record.path), [services, record.path]),
    onImage: useMemo(() => makeOnImage(services, record.path), [services, record.path]),
    setTitle,
    setTags,
    setBody,
    commitDate: handlers.commitDate,
    commitMode: handlers.commitMode,
  };
}

export { useEditorScreenState };
