// ABOUTME: Local-echo + debounced-persist state for the open entry in
// ABOUTME: EditorScreen: title/tags/body/date/mode, each wired to the store.
import { useEffect, useMemo, useRef, useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import type { EditorMode } from "../types";
import { makeOnImage, makeResolveImage } from "./editorImageHandlers";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";
import { DEFAULT_EDIT_DEBOUNCE_MS, EMPTY_CONFLICTS } from "./state.types";

interface ParsedView {
  title: string | null;
  tags: string[];
  body: string;
}

function useParsedView(record: EntryRecord): ParsedView | null {
  const services = useServices();
  return useMemo(() => {
    const result = services.model.parseEntry(record.path, record.workingContent);
    if (!result.ok) {
      return null;
    }
    return { title: result.entry.title, tags: result.entry.tags, body: result.entry.body };
  }, [record, services]);
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

/**
 * Local-echo title/tags/body, kept in sync with `record.workingContent`
 * without a remount, since EditorScreenBody is keyed only by path
 * (EditorScreen.tsx), so it never remounts when the *content* at the same
 * path changes underneath it. pull()'s fast-forward/diff3-merge and conflict
 * resolution all write straight to the store, bypassing this component
 * entirely; without the reconciling effect below, the editor would keep
 * showing stale pre-merge/pre-resolution text until the user switched
 * entries and back, and resuming typing on that stale text would silently
 * blow away whatever landed externally. `markLocalEditPending` defers that
 * reconciliation for a short window after the user's own last keystroke, so
 * an external change landing mid-burst doesn't blow away in-progress typing
 * the moment it arrives — it's deferred until the burst's own debounce would
 * have settled, not dropped.
 */
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
  const syncedContentRef = useRef(record.workingContent);
  const localEditPendingRef = useRef(false);

  useEffect(() => {
    if (record.workingContent === syncedContentRef.current || localEditPendingRef.current) {
      return;
    }
    syncedContentRef.current = record.workingContent;
    if (parsed) {
      setTitleState(parsed.title ?? "");
      setTagsState(parsed.tags);
      setBodyState(parsed.body);
    }
  }, [record.workingContent, parsed]);

  function markLocalEditPending() {
    localEditPendingRef.current = true;
    setTimeout(() => {
      localEditPendingRef.current = false;
    }, DEFAULT_EDIT_DEBOUNCE_MS);
  }

  return { title, tags, body, setTitleState, setTagsState, setBodyState, markLocalEditPending };
}

/** Keyed by path at the call site (EditorScreen), so switching entries
 *  re-initializes this local state instead of carrying over stale text. */
function useEditorScreenState(record: EntryRecord) {
  const services = useServices();
  const parsed = useParsedView(record);
  const handlers = useEditorCommitHandlers(record.path);
  const echo = useLocalEcho(record, parsed);
  const editorMode = useAppStore((state) => state.editorModes[record.path] ?? "wysiwyg");
  const conflicts = useAppStore((state) => state.syncStatus?.conflicts ?? EMPTY_CONFLICTS);

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
    isConflicted: conflicts.includes(record.path),
    resolveImage: useMemo(() => makeResolveImage(services), [services]),
    onImage: useMemo(() => makeOnImage(services, record.path), [services, record.path]),
    setTitle,
    setTags,
    setBody,
    commitDate: handlers.commitDate,
    commitMode: handlers.commitMode,
  };
}

export { useEditorScreenState };
