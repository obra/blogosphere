// ABOUTME: renameEntry — slug/date renames with URL-change confirmation and
// ABOUTME: extension preservation. Split from state.editingActions.ts (line cap).
import type { FieldEdit } from "../../core/model/types";
import type { EntryRecord } from "../../core/store/types";
import { todayIso } from "./format";
import { applyRename, findEntryInCache } from "./state.cache";
import type { ActionCtx } from "./state.types";

type RenameComputation =
  | { kind: "target"; newPath: string; newDate: string }
  | { kind: "noop" }
  | { kind: "error"; message: string };

const HTML_EXTENSION = ".html";
const MD_EXTENSION = ".md";

/** model.pathFor() only ever builds a canonical .md path — that's its job,
 *  it's for new/canonical markdown writes (see core/model/paths.ts). A
 *  rename/date-change of a legacy .html entry must not silently turn it
 *  into a .md file just because its path moved: the file's actual format
 *  hasn't changed. Mirrors core/model/publish.ts's identical
 *  extension-preserving transform for planPublish's newPath. */
function withSourceExtension(sourcePath: string, canonicalMdPath: string): string {
  if (sourcePath.endsWith(HTML_EXTENSION) && canonicalMdPath.endsWith(MD_EXTENSION)) {
    return `${canonicalMdPath.slice(0, -MD_EXTENSION.length)}${HTML_EXTENSION}`;
  }
  return canonicalMdPath;
}

function computeRenameTarget(
  ctx: ActionCtx,
  record: EntryRecord,
  changes: { slug?: string; date?: string },
): RenameComputation {
  const svc = ctx.get().services;
  const parsed = svc.model.parseEntry(record.path, record.workingContent);
  if (!parsed.ok) {
    return { kind: "error", message: `Couldn't rename: ${parsed.error}` };
  }
  const parts = svc.model.pathParts(record.path);
  const newSlug = changes.slug ?? parts?.slug;
  if (!newSlug) {
    return { kind: "error", message: "This entry needs a title before it can be renamed." };
  }
  const newDate = changes.date ?? parsed.entry.date ?? todayIso(ctx.deps.now());
  const newPath = withSourceExtension(
    record.path,
    svc.model.pathFor(record.kind, newDate, newSlug),
  );
  if (newPath === record.path) {
    return { kind: "noop" };
  }
  return { kind: "target", newPath, newDate };
}

async function confirmUrlChangeIfNeeded(ctx: ActionCtx, record: EntryRecord): Promise<boolean> {
  if (record.baseSha === null) {
    return true;
  }
  const svc = ctx.get().services;
  const parsed = svc.model.parseEntry(record.path, record.workingContent);
  const oldLink = parsed.ok ? (svc.model.permalinkFor(parsed.entry) ?? record.path) : record.path;
  return await ctx.deps.confirm(
    `Renaming changes this entry's web address (currently ${oldLink}). Continue?`,
  );
}

function buildDateEdits(changes: { date?: string }, newDate: string): FieldEdit[] {
  return changes.date ? [{ field: "date", value: newDate }] : [];
}

async function renameEntryInner(
  ctx: ActionCtx,
  record: EntryRecord,
  changes: { slug?: string; date?: string },
): Promise<void> {
  const computation = computeRenameTarget(ctx, record, changes);
  if (computation.kind === "noop") {
    return;
  }
  if (computation.kind === "error") {
    ctx.get().addToast({ tone: "error", message: computation.message });
    return;
  }
  if (!(await confirmUrlChangeIfNeeded(ctx, record))) {
    return;
  }
  const svc = ctx.get().services;
  const dateEdits = buildDateEdits(changes, computation.newDate);
  const editResult =
    dateEdits.length > 0
      ? svc.model.applyEdits(record.workingContent, dateEdits)
      : ({ ok: true, raw: record.workingContent } as const);
  if (!editResult.ok) {
    ctx.get().addToast({ tone: "error", message: `Couldn't rename: ${editResult.error}` });
    return;
  }
  await applyRename(ctx, record, computation.newPath, editResult.raw);
}

async function renameEntry(
  ctx: ActionCtx,
  path: string,
  changes: { slug?: string; date?: string },
): Promise<void> {
  // Force any still-debounced keystroke into the store first — the Date
  // field's onChange calls this directly, with no relation to whatever
  // title/body edit might still be sitting in the debounce timer, so
  // without this the rename could carry forward a stale pre-edit snapshot.
  await ctx.flush(path);
  const record = findEntryInCache(ctx.get, path) ?? (await ctx.get().services.store.getEntry(path));
  if (!record) {
    return;
  }
  ctx.set((state) => ({ busy: { ...state.busy, renaming: true } }));
  try {
    await renameEntryInner(ctx, record, changes);
  } catch {
    ctx.get().addToast({
      tone: "error",
      message: "Couldn't rename this entry.",
      retry: () => renameEntry(ctx, path, changes),
    });
  } finally {
    ctx.set((state) => ({ busy: { ...state.busy, renaming: false } }));
  }
}

export { renameEntry };
