// ABOUTME: Browser/dev bootstrap — an in-memory demo Services built entirely
// ABOUTME: from the app's own test fakes, seeded with sample entries so
// ABOUTME: `npm run dev` renders a functional three-pane app with no Tauri
// ABOUTME: runtime and no GitHub token required. Never reached from the
// ABOUTME: Tauri runtime path — see src/bootstrap/index.ts's isTauri() gate.

import type { Services } from "../core/services";
import type { EntryRecord } from "../core/store/types";
import { makeEntry, makeRaw } from "../ui/app/testing/builders";
import { buildFakeServices } from "../ui/app/testing/fakes";

function seedEntries(): EntryRecord[] {
  return [
    makeEntry({
      path: "content/drafts/2026-07-10-notes-on-offline-sync.md",
      kind: "draft",
      title: "Notes on building offline-first sync",
      date: "2026-07-10",
      dirty: true,
    }),
    makeEntry({
      path: "content/blog/2026/2026-06-01-a-week-with-crepe.md",
      kind: "post",
      title: "A week with Crepe for WYSIWYG markdown",
      date: "2026-06-01",
    }),
    makeEntry({
      path: "content/blog/2025/2025-11-20-split-keyboard-redux.md",
      kind: "post",
      title: "Split keyboard, redux",
      date: "2025-11-20",
    }),
    makeEntry({
      path: "content/_linkblog/2026-07-12-cool-find.md",
      kind: "link",
      title: "A neat piece on three-way merges",
      date: "2026-07-12",
      // makeEntry doesn't thread url/type through to its auto-generated
      // workingContent (they aren't EntryRecord fields), so build the raw
      // front matter directly to get a realistic link post.
      workingContent: makeRaw({
        title: "A neat piece on three-way merges",
        date: "2026-07-12",
        url: "https://example.com/diff3",
        type: "link",
      }),
    }),
    makeEntry({
      path: "content/releases/2026/2026-05-01-v0-1.md",
      kind: "release",
      title: "Blogosphere v0.1",
      date: "2026-05-01",
    }),
  ];
}

/**
 * A fully in-memory Services aggregate: fake model/store/shell/sync, no
 * filesystem, no network, no OS keychain. `sync` is a live-looking FakeSync
 * (idle status) rather than null, so the sidebar's sync pill and the
 * save/publish flows behave like the real app instead of the "no token
 * configured yet" empty state.
 */
export function createDemoServices(): Services {
  const { services } = buildFakeServices({ seedEntries: seedEntries() });
  return services;
}
