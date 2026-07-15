// ABOUTME: "Create something new" and "publish a draft" actions: newPost/
// ABOUTME: newDraft/newLink (via a shared createNew) and publishDraft.
import type { PublishOptions } from "../../core/model/types";
import type { EntryRecord } from "../../core/store/types";
import { todayIso } from "./format";
import { sectionForKind } from "./grouping";
import {
  applyRename,
  findEntryInCache,
  maybeBackgroundSync,
  replaceEntryInCache,
  withParsedFields,
} from "./state.cache";
import type { ActionCtx, CreatableKind, NewEntryFields, NewLinkFields } from "./state.types";

interface CreateNewInput extends NewEntryFields {
  url?: string;
}

function buildNewRecord(
  ctx: ActionCtx,
  kind: CreatableKind,
  scaffold: { path: string; raw: string },
  fallback: { title: string; date: string },
): EntryRecord {
  const svc = ctx.get().services;
  return {
    path: scaffold.path,
    kind,
    baseSha: null,
    baseContent: null,
    workingContent: scaffold.raw,
    dirty: true,
    deleted: false,
    renamedFrom: null,
    ...withParsedFields(svc, scaffold.path, scaffold.raw, {
      ...fallback,
      draft: kind === "draft",
      opaqueId: null,
    }),
    updatedAt: ctx.deps.now(),
  };
}

async function createNew(
  ctx: ActionCtx,
  kind: CreatableKind,
  input: CreateNewInput,
): Promise<string> {
  const svc = ctx.get().services;
  const date = input.date ?? todayIso(ctx.deps.now());
  const scaffold = svc.model.newEntry({
    kind,
    title: input.title,
    date,
    ...(input.url === undefined ? {} : { url: input.url }),
  });
  const record = buildNewRecord(ctx, kind, scaffold, { title: input.title, date });
  await svc.store.upsertEntry(record);
  replaceEntryInCache(ctx.set, record);
  ctx.set({ selectedPath: record.path, section: sectionForKind(kind) });
  maybeBackgroundSync(ctx.get);
  return record.path;
}

function newPost(ctx: ActionCtx, input: NewEntryFields): Promise<string> {
  return createNew(ctx, "post", input);
}

function newDraft(ctx: ActionCtx, input: NewEntryFields): Promise<string> {
  return createNew(ctx, "draft", input);
}

function newLink(ctx: ActionCtx, input: NewLinkFields): Promise<string> {
  return createNew(ctx, "link", input);
}

type PublishComputation =
  | { ok: true; record: EntryRecord; newPath: string; raw: string }
  | { ok: false; message: string };

function computePublishPlan(
  ctx: ActionCtx,
  record: EntryRecord,
  opts: PublishOptions,
): PublishComputation {
  const svc = ctx.get().services;
  const parsed = svc.model.parseEntry(record.path, record.workingContent);
  if (!parsed.ok) {
    return { ok: false, message: `Couldn't publish: ${parsed.error}` };
  }
  const plan = svc.model.planPublish(parsed.entry, opts);
  const editResult = svc.model.applyEdits(record.workingContent, plan.edits);
  if (!editResult.ok) {
    return { ok: false, message: `Couldn't publish: ${editResult.error}` };
  }
  return { ok: true, record, newPath: plan.newPath, raw: editResult.raw };
}

async function publishDraftInner(
  ctx: ActionCtx,
  path: string,
  opts: PublishOptions,
): Promise<void> {
  const svc = ctx.get().services;
  const record = findEntryInCache(ctx.get, path) ?? (await svc.store.getEntry(path));
  if (!record) {
    ctx.get().addToast({ tone: "error", message: "That entry isn't around anymore." });
    return;
  }
  const plan = computePublishPlan(ctx, record, opts);
  if (!plan.ok) {
    ctx.get().addToast({ tone: "error", message: plan.message });
    return;
  }
  await applyRename(ctx, plan.record, plan.newPath, plan.raw);
  ctx.get().addToast({ tone: "success", message: "Published." });
}

async function publishDraft(ctx: ActionCtx, path: string, opts: PublishOptions): Promise<void> {
  ctx.set((state) => ({ busy: { ...state.busy, publishing: true } }));
  try {
    await publishDraftInner(ctx, path, opts);
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't publish this entry.",
      retry: () => publishDraft(ctx, path, opts),
    });
  } finally {
    ctx.set((state) => ({ busy: { ...state.busy, publishing: false } }));
  }
}

export { newDraft, newLink, newPost, publishDraft };
