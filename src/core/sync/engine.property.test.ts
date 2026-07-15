// ABOUTME: Model-based property test — random interleavings of local edits,
// ABOUTME: remote edits, and sync() must never silently lose a local edit.
import process from "node:process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createHarness, type TestHarness } from "./testing/harness";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;
const NUM_FILES = 2;
const MAX_OPS = 10;

type Region = "title" | "body";
type OpSpec =
  | { kind: "localEdit"; fileIndex: number; region: Region }
  | { kind: "remoteEdit"; fileIndex: number; region: Region }
  | { kind: "sync" };
interface FileHandle {
  path: string;
}

const arbFileIndex = fc.integer({ min: 0, max: NUM_FILES - 1 });
const arbRegion: fc.Arbitrary<Region> = fc.constantFrom("title", "body");
const arbLocalEdit: fc.Arbitrary<OpSpec> = fc
  .tuple(arbFileIndex, arbRegion)
  .map(([fileIndex, region]) => ({ kind: "localEdit", fileIndex, region }) as const);
const arbRemoteEdit: fc.Arbitrary<OpSpec> = fc
  .tuple(arbFileIndex, arbRegion)
  .map(([fileIndex, region]) => ({ kind: "remoteEdit", fileIndex, region }) as const);
const arbOpSpec: fc.Arbitrary<OpSpec> = fc.oneof(
  arbLocalEdit,
  arbRemoteEdit,
  fc.constant<OpSpec>({ kind: "sync" }),
);
const arbOps = fc.array(arbOpSpec, { minLength: 1, maxLength: MAX_OPS });

/** Everything one sequence run threads through: the harness under test, the
 *  fixed set of seeded files, and markers still awaiting confirmation. */
interface SequenceContext {
  harness: TestHarness;
  files: readonly FileHandle[];
  pending: Map<string, string>;
}

/** A single invariant check, gathered by helpers and asserted only back in
 *  the it() body — keeps every expect() call in the test's own scope. */
interface Check {
  description: string;
  pass: boolean;
}

/** Applies one field edit via the real model; null if the model refuses (e.g.
 *  content it can no longer edit surgically) so callers can just skip the op. */
function editedText(
  harness: TestHarness,
  region: Region,
  text: string,
  marker: string,
): string | null {
  const edited =
    region === "title"
      ? harness.model.applyEdits(text, [{ field: "title", value: marker }])
      : harness.model.replaceBody(text, `${marker}\n`);
  return edited.ok ? edited.raw : null;
}

async function applyLocalEdit(
  ctx: SequenceContext,
  op: Extract<OpSpec, { kind: "localEdit" }>,
  marker: string,
): Promise<void> {
  const path = ctx.files[op.fileIndex]?.path;
  if (path === undefined || ctx.harness.sync.status().conflicts.includes(path)) {
    return;
  }
  const entry = await ctx.harness.store.getEntry(path);
  if (!entry) {
    return;
  }
  const raw = editedText(ctx.harness, op.region, entry.workingContent, marker);
  if (raw === null) {
    return;
  }
  await ctx.harness.store.upsertEntry({ ...entry, workingContent: raw, dirty: true });
  ctx.pending.set(`${path}:${op.region}`, marker);
}

function applyRemoteEdit(
  ctx: SequenceContext,
  op: Extract<OpSpec, { kind: "remoteEdit" }>,
  marker: string,
): void {
  const path = ctx.files[op.fileIndex]?.path;
  if (path === undefined) {
    return;
  }
  const currentText = ctx.harness.remote.readFile(path);
  if (currentText === null) {
    return;
  }
  const raw = editedText(ctx.harness, op.region, currentText, marker);
  if (raw !== null) {
    ctx.harness.remote.pushExternalChange({ [path]: raw });
  }
}

interface FileSnapshot {
  path: string;
  isConflicted: boolean;
  baseContent: string | null;
  workingContent: string;
  remoteText: string | null;
}

/** One path's pending-marker checks: a still-pending edit must show up
 *  either in the remote (landed) or in workingContent (held by a conflict). */
function pendingMarkerChecks(snapshot: FileSnapshot, pending: Map<string, string>): Check[] {
  const checks: Check[] = [];
  for (const region of ["title", "body"] as const) {
    const key = `${snapshot.path}:${region}`;
    const marker = pending.get(key);
    if (marker !== undefined) {
      if (snapshot.isConflicted) {
        checks.push({
          description: `${key}: pending edit "${marker}" survives in workingContent while conflicted`,
          pass: snapshot.workingContent.includes(marker),
        });
      } else {
        checks.push({
          description: `${key}: pending edit "${marker}" lands in the remote`,
          pass: (snapshot.remoteText ?? "").includes(marker),
        });
        pending.delete(key);
      }
    }
  }
  return checks;
}

/**
 * Invariants, gathered after every sync() point (asserted later, back in the
 * test body):
 *  1. For any path not currently conflicted, the store's base content matches
 *     what the remote actually has.
 *  2. Every local edit still pending (not yet confirmed landed) survives
 *     either in the remote (pushed) or in workingContent (held by a
 *     conflict) — never silently dropped. Once confirmed landed in the
 *     remote, it stops being tracked (a *later* unrelated remote edit
 *     superseding it from here on is not this engine's data loss).
 */
async function gatherInvariantChecks(ctx: SequenceContext): Promise<Check[]> {
  const status = ctx.harness.sync.status();
  const entries = await Promise.all(ctx.files.map((file) => ctx.harness.store.getEntry(file.path)));

  const snapshots: FileSnapshot[] = ctx.files.map((file, i) => ({
    path: file.path,
    isConflicted: status.conflicts.includes(file.path),
    baseContent: entries[i]?.baseContent ?? null,
    workingContent: entries[i]?.workingContent ?? "",
    remoteText: ctx.harness.remote.readFile(file.path),
  }));

  const checks: Check[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.isConflicted) {
      checks.push({
        description: `${snapshot.path}: base content matches remote once not conflicted`,
        pass: snapshot.baseContent === snapshot.remoteText,
      });
    }
    checks.push(...pendingMarkerChecks(snapshot, ctx.pending));
  }
  return checks;
}

async function runSequence(ctx: SequenceContext, opSpecs: readonly OpSpec[]): Promise<Check[]> {
  const checks: Check[] = [];
  for (const [index, op] of opSpecs.entries()) {
    if (op.kind === "sync") {
      // Sequence steps are inherently ordered: each op must observe the
      // state left by the previous one, so this cannot be parallelized.
      // biome-ignore lint/performance/noAwaitInLoops: scripted, ordered steps.
      await ctx.harness.sync.sync();
      checks.push(...(await gatherInvariantChecks(ctx)));
    } else if (op.kind === "localEdit") {
      await applyLocalEdit(ctx, op, `local-${index}`);
    } else {
      applyRemoteEdit(ctx, op, `remote-${index}`);
    }
  }
  await ctx.harness.sync.sync();
  checks.push(...(await gatherInvariantChecks(ctx)));
  return checks;
}

// Each run stands up a real in-memory SQLite store from scratch, so this
// property is far slower per-iteration than a pure-function one; at
// FUZZ_RUNS=10000 (npm run fuzz) it needs real headroom over vitest's
// default 5s per-test timeout.
const PROPERTY_TEST_TIMEOUT_MS = 120_000;

describe("sync engine: property", () => {
  it(
    "property: local edits survive random local/remote/sync interleavings",
    async () => {
      await fc.assert(
        fc.asyncProperty(arbOps, async (opSpecs) => {
          const harness = await createHarness();
          const files = Array.from({ length: NUM_FILES }, (_, i) =>
            harness.model.newEntry({ kind: "post", title: `File ${i}`, date: `2026-02-0${i + 1}` }),
          );
          harness.remote.initRepo(Object.fromEntries(files.map((file) => [file.path, file.raw])));
          await harness.sync.bootstrap();
          const checks = await runSequence({ harness, files, pending: new Map() }, opSpecs);
          for (const check of checks) {
            expect(check.pass, check.description).toBe(true);
          }
        }),
        { numRuns: FUZZ_RUNS },
      );
    },
    PROPERTY_TEST_TIMEOUT_MS,
  );
});
