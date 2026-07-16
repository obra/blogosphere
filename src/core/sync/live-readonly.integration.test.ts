// ABOUTME: Read-only integration test against the REAL obra/blog repo. Skipped unless
// ABOUTME: LIVE_GITHUB_TOKEN is set. Bootstraps the full corpus; never writes to GitHub.

import process from "node:process";
import { describe, expect, it } from "vitest";
import { createGitHubApi } from "../github/client";
import type { UpdateRefResult } from "../github/types";
import { createModel } from "../model";
import { createBetterSqliteDriver } from "../store/drivers/better-sqlite3";
import { createStore } from "../store/store";
import { createSync } from "./engine";

const token = process.env.LIVE_GITHUB_TOKEN;
const BOOTSTRAP_TIMEOUT_MS = 300_000;
// The real repo holds 131 md + ~440 legacy html: 131 managed .md entries,
// plus the ~440 legacy 1996-2014 LiveJournal-import .html posts under
// content/blog/, which are now first-class (browse/read/edit/sync; body
// editing is source-mode only — see ui/editor). 500 leaves headroom below
// the real ~570 total without being so loose it'd miss a regression that
// dropped .html bootstrapping back out.
const MIN_EXPECTED_ENTRIES = 500;
const KNOWN_POST = "content/blog/2025/2025-04-06-posting-through-it.md";
const KNOWN_LEGACY_HTML_POST = "content/blog/2004/2004-01-24-orkut.html";

describe.skipIf(!token)("live read-only bootstrap against obra/blog", () => {
  it(
    "bootstraps the real corpus without ever writing to the remote",
    async () => {
      if (!token) {
        throw new Error("unreachable: describe.skipIf guards this");
      }
      const real = createGitHubApi({
        owner: "obra",
        repo: "blog",
        branch: "main",
        token,
        fetchImpl: (input, init) => fetch(input, init),
      });
      // Wrap the client so ANY ref update attempt fails the test loudly: this
      // test must be provably read-only against Jesse's real blog.
      const readOnly = {
        ...real,
        createBlob(): Promise<string> {
          throw new Error("live test attempted createBlob (write!)");
        },
        createTree(): Promise<string> {
          throw new Error("live test attempted createTree (write!)");
        },
        createCommit(): Promise<string> {
          throw new Error("live test attempted createCommit (write!)");
        },
        updateRef(): Promise<UpdateRefResult> {
          throw new Error("live test attempted updateRef (write!)");
        },
      };
      const store = createStore(createBetterSqliteDriver(":memory:"));
      await store.init();
      const sync = createSync({
        github: readOnly,
        store,
        model: createModel(),
        now: () => Date.now(),
        readAsset: () => Promise.reject(new Error("no assets in this test")),
      });

      await sync.bootstrap();

      const entries = await store.listEntries();
      expect(entries.length).toBeGreaterThan(MIN_EXPECTED_ENTRIES);
      const known = await store.getEntry(KNOWN_POST);
      expect(known).not.toBeNull();
      expect(known?.title).toBe("Posting through it");
      expect(known?.dirty).toBe(false);

      const knownLegacyHtml = await store.getEntry(KNOWN_LEGACY_HTML_POST);
      expect(knownLegacyHtml).not.toBeNull();
      expect(knownLegacyHtml?.title).not.toBeNull();
      expect(knownLegacyHtml?.dirty).toBe(false);

      expect(await store.getMeta("lastRootTreeSha")).not.toBeNull();
    },
    BOOTSTRAP_TIMEOUT_MS,
  );
});
