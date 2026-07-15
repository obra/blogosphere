// ABOUTME: Small shared helpers for the push test suite — a defaulted
// ABOUTME: EntryRecord builder and a commit-message lookup by PushResult.
import type { EntryRecord } from "../../store/types";
import type { PushResult } from "../types";
import type { FakeRemote } from "./fakeRemote";

/** A dirty EntryRecord with sensible defaults; pass only what a test cares about. */
export function baseEntry(
  overrides: Partial<EntryRecord> & Pick<EntryRecord, "path" | "kind" | "workingContent">,
): EntryRecord {
  return {
    baseSha: null,
    baseContent: null,
    dirty: true,
    deleted: false,
    renamedFrom: null,
    title: null,
    date: null,
    draft: false,
    opaqueId: null,
    updatedAt: 0,
    ...overrides,
  };
}

/** The commit message a push() call produced, or null if it didn't commit. */
export async function commitMessageFor(
  remote: FakeRemote,
  result: PushResult,
): Promise<string | null> {
  if (result.commitSha === undefined) {
    return null;
  }
  const commit = await remote.getCommit(result.commitSha);
  return commit.message;
}
