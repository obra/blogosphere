// ABOUTME: Entry-list + editing actions: refresh/select/section/search, and
// ABOUTME: the debounced autosave pipeline (edit/flushEdit/saveNow).
import type { EditResult } from "../../core/model/types";
import type { Services } from "../../core/services";
import type { EntryRecord } from "../../core/store/types";
import type { EditorMode, Section } from "../types";
import { debounce } from "./format";
import {
  findEntryInCache,
  maybeBackgroundSync,
  replaceEntryInCache,
  withParsedFields,
} from "./state.cache";
import type { ActionCtx, EditChange } from "./state.types";
import { editorModeMetaKey } from "./state.types";

type PendingEdits = Map<string, { change: EditChange; timer: ReturnType<typeof setTimeout> }>;

interface SearchDebouncer {
  call: (query: string) => void;
}

function createPendingEdits(): PendingEdits {
  return new Map();
}

function createSearchDebouncer(ctx: ActionCtx): SearchDebouncer {
  return debounce<[string]>((query) => {
    runSearch(ctx, query);
  }, ctx.deps.searchDebounceMs);
}

async function refresh(ctx: ActionCtx): Promise<void> {
  ctx.set((state) => ({ busy: { ...state.busy, refreshing: true } }));
  try {
    const entries = await ctx.get().services.store.listEntries();
    ctx.set({ entries });
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't load your entries.",
      retry: () => refresh(ctx),
    });
  } finally {
    ctx.set((state) => ({ busy: { ...state.busy, refreshing: false } }));
  }
}

function hydrateEditorMode(ctx: ActionCtx, path: string): void {
  ctx
    .get()
    .services.store.getMeta(editorModeMetaKey(path))
    .then((value) => {
      const mode: EditorMode = value === "source" ? "source" : "wysiwyg";
      ctx.set((state) => ({ editorModes: { ...state.editorModes, [path]: mode } }));
    })
    .catch(() => undefined);
}

function select(ctx: ActionCtx, path: string | null): void {
  ctx.set({ selectedPath: path });
  if (path && !(path in ctx.get().editorModes)) {
    hydrateEditorMode(ctx, path);
  }
}

function setSection(ctx: ActionCtx, section: Section): void {
  ctx.set({ section, selectedPath: null });
}

async function runSearch(ctx: ActionCtx, query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) {
    ctx.set({ searchResults: null });
    return;
  }
  try {
    const results = await ctx.get().services.store.searchEntries(trimmed);
    ctx.set({ searchResults: results });
  } catch {
    ctx
      .get()
      .addToast({ tone: "error", message: "Search failed.", retry: () => runSearch(ctx, query) });
  }
}

function setSearchQuery(ctx: ActionCtx, searchDebouncer: SearchDebouncer, query: string): void {
  ctx.set({ searchQuery: query });
  searchDebouncer.call(query);
}

function applyEditToRaw(svc: Services, workingContent: string, change: EditChange): EditResult {
  if (change.kind === "body") {
    return svc.model.replaceBody(workingContent, change.body);
  }
  return svc.model.applyEdits(workingContent, change.edits);
}

function reportEditFailure(
  ctx: ActionCtx,
  record: EntryRecord,
  change: EditChange,
  error: string,
): void {
  ctx.get().addToast({
    tone: "error",
    message: `Couldn't save "${record.title ?? record.path}": ${error}`,
    retry: () => commitEdit(ctx, record.path, change),
  });
}

async function commitEditInner(ctx: ActionCtx, path: string, change: EditChange): Promise<void> {
  const svc = ctx.get().services;
  const record = findEntryInCache(ctx.get, path) ?? (await svc.store.getEntry(path));
  if (!record) {
    return;
  }
  const editResult = applyEditToRaw(svc, record.workingContent, change);
  if (!editResult.ok) {
    reportEditFailure(ctx, record, change, editResult.error);
    return;
  }
  const updated: EntryRecord = {
    ...record,
    ...withParsedFields(svc, path, editResult.raw, record),
    workingContent: editResult.raw,
    dirty: true,
    updatedAt: ctx.deps.now(),
  };
  await svc.store.upsertEntry(updated);
  replaceEntryInCache(ctx.set, updated);
  maybeBackgroundSync(ctx.get);
}

async function commitEdit(ctx: ActionCtx, path: string, change: EditChange): Promise<void> {
  try {
    await commitEditInner(ctx, path, change);
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't save your changes.",
      retry: () => commitEdit(ctx, path, change),
    });
  }
}

function edit(ctx: ActionCtx, pending: PendingEdits, path: string, change: EditChange): void {
  const existing = pending.get(path);
  if (existing) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    pending.delete(path);
    commitEdit(ctx, path, change);
  }, ctx.deps.editDebounceMs);
  pending.set(path, { change, timer });
}

async function flushOne(ctx: ActionCtx, pending: PendingEdits, path: string): Promise<void> {
  const entry = pending.get(path);
  if (!entry) {
    return;
  }
  clearTimeout(entry.timer);
  pending.delete(path);
  await commitEdit(ctx, path, entry.change);
}

async function flushEdit(ctx: ActionCtx, pending: PendingEdits, path?: string): Promise<void> {
  if (path !== undefined) {
    await flushOne(ctx, pending, path);
    return;
  }
  await Promise.all([...pending.keys()].map((p) => flushOne(ctx, pending, p)));
}

async function saveNow(ctx: ActionCtx, pending: PendingEdits): Promise<void> {
  await flushEdit(ctx, pending);
  const svc = ctx.get().services;
  if (!svc.sync) {
    ctx.get().addToast({ tone: "info", message: "Saved." });
    return;
  }
  if (ctx.get().syncStatus?.state === "offline") {
    ctx.get().addToast({ tone: "info", message: "Saved. Will sync when you're back online." });
    return;
  }
  try {
    await svc.sync.sync();
  } catch {
    ctx
      .get()
      .addToast({ tone: "error", message: "Couldn't sync.", retry: () => saveNow(ctx, pending) });
  }
}

export type { PendingEdits, SearchDebouncer };
export {
  createPendingEdits,
  createSearchDebouncer,
  edit,
  flushEdit,
  refresh,
  saveNow,
  select,
  setSearchQuery,
  setSection,
};
