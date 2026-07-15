// ABOUTME: fast-check property test — random sequences of upsert/remove keep
// ABOUTME: store.listEntries() consistent with an in-memory reference map.

import process from "node:process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createBetterSqliteDriver } from "./drivers/better-sqlite3";
import { createStore } from "./store";
import type { EntryRecord } from "./types";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;

const PATHS = ["a.md", "b.md", "c.md", "d.md"] as const;
const DATES: readonly (string | null)[] = [
  null,
  "2026-01-01",
  "2026-01-02",
  "2026-02-01",
  "2025-12-31",
];

interface UpsertOp {
  type: "upsert";
  path: (typeof PATHS)[number];
  date: string | null;
  dirty: boolean;
  deleted: boolean;
  seq: number;
}

interface RemoveOp {
  type: "remove";
  path: (typeof PATHS)[number];
}

type Op = UpsertOp | RemoveOp;

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    type: fc.constant("upsert" as const),
    path: fc.constantFrom(...PATHS),
    date: fc.constantFrom(...DATES),
    dirty: fc.boolean(),
    deleted: fc.boolean(),
    seq: fc.nat(),
  }),
  fc.record({
    type: fc.constant("remove" as const),
    path: fc.constantFrom(...PATHS),
  }),
);

function toRecord(op: UpsertOp): EntryRecord {
  return {
    path: op.path,
    kind: "post",
    baseSha: null,
    baseContent: null,
    workingContent: `content ${op.seq}`,
    dirty: op.dirty,
    deleted: op.deleted,
    renamedFrom: null,
    title: `title ${op.seq}`,
    date: op.date,
    draft: false,
    opaqueId: null,
    updatedAt: op.seq,
  };
}

/** Mirrors schema.ts's ENTRIES_ORDER_BY: date desc, nulls last, then path asc. */
function compareEntries(a: EntryRecord, b: EntryRecord): number {
  if (a.date === null && b.date !== null) {
    return 1;
  }
  if (a.date !== null && b.date === null) {
    return -1;
  }
  if (a.date !== null && b.date !== null && a.date !== b.date) {
    return a.date < b.date ? 1 : -1;
  }
  if (a.path !== b.path) {
    return a.path < b.path ? -1 : 1;
  }
  return 0;
}

/** Applies one op to both the real store and the plain-JS reference map. */
async function applyOp(
  store: {
    upsertEntry: (r: EntryRecord) => Promise<void>;
    removeEntry: (p: string) => Promise<void>;
  },
  reference: Map<string, EntryRecord>,
  op: Op,
): Promise<void> {
  if (op.type === "upsert") {
    const record = toRecord(op);
    await store.upsertEntry(record);
    reference.set(op.path, record);
    return;
  }
  await store.removeEntry(op.path);
  reference.delete(op.path);
}

describe("store", () => {
  it("property: listEntries stays consistent with an in-memory reference map under random upsert/remove sequences", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbOp, { maxLength: 40 }), async (ops) => {
        const driver = createBetterSqliteDriver();
        const store = createStore(driver);
        await store.init();
        const reference = new Map<string, EntryRecord>();

        await ops.reduce(async (previous, op) => {
          await previous;
          await applyOp(store, reference, op);
        }, Promise.resolve());

        const actual = await store.listEntries();
        const expected = [...reference.values()]
          .filter((entry) => !entry.deleted)
          .sort(compareEntries);

        expect(actual).toEqual(expected);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
