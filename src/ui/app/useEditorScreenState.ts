// ABOUTME: Local-echo + debounced-persist state for the open entry in
// ABOUTME: EditorScreen: title/tags/body/date/mode, each wired to the store.
import { useMemo, useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import type { EditorMode } from "../types";
import { makeOnImage, makeResolveImage } from "./editorImageHandlers";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";

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

/** Keyed by path at the call site (EditorScreen), so switching entries
 *  re-initializes this local state instead of carrying over stale text. */
function useEditorScreenState(record: EntryRecord) {
  const services = useServices();
  const parsed = useParsedView(record);
  const handlers = useEditorCommitHandlers(record.path);
  const [title, setTitleState] = useState(parsed?.title ?? "");
  const [tags, setTagsState] = useState<string[]>(parsed?.tags ?? []);
  const [body, setBodyState] = useState(parsed?.body ?? "");
  const editorMode = useAppStore((state) => state.editorModes[record.path] ?? "wysiwyg");
  const conflicts = useAppStore((state) => state.syncStatus?.conflicts ?? []);

  function setTitle(value: string) {
    setTitleState(value);
    handlers.commitTitle(value);
  }
  function setTags(value: string[]) {
    setTagsState(value);
    handlers.commitTags(value);
  }
  function setBody(value: string) {
    setBodyState(value);
    handlers.commitBody(value);
  }

  return {
    parsed,
    title,
    tags,
    body,
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
