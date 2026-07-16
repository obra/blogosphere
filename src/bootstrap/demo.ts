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
      title:
        "Notes on building offline-first sync — a very long draft title to exercise wrapping in the entry list",
      date: "2026-07-10",
      dirty: true,
      workingContent: `---\ntitle: "Notes on building offline-first sync — a very long draft title to exercise wrapping in the entry list"\ndate: 2026-07-10\ndraft: true\n---\n${Array.from(
        { length: 40 },
        (_, i) =>
          `Paragraph ${i + 1}. Offline-first means writing never waits on the network — sync is a background concern, not a gate. This seed paragraph exists so scrolling long documents is exercised in the demo.`,
      ).join("\n\n")}`,
    }),
    makeEntry({
      path: "content/blog/2004/2004-01-24-orkut.html",
      kind: "post",
      title: "Orkut (legacy HTML)",
      date: "2004-01-24",
      workingContent: `---\ntitle: Orkut (legacy HTML)\ndate: 2004-01-24 00:04:00 -08:00\n---\n<p>So <a href="https://example.com">orkut</a> launched. <em>Everyone</em> is joining.</p>\n<p>Second paragraph with a list:</p>\n<ul><li>one</li><li>two</li></ul>`,
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
  // Design/dev preview of the first-run experience: `vite dev` +
  // ?onboarding renders the connect card exactly as a tokenless Tauri
  // launch would (sync === null, empty library). Never in the packaged app.
  if (globalThis.location?.search.includes("onboarding")) {
    const empty = buildFakeServices({ seedEntries: [] });
    return { ...empty.services, sync: null };
  }
  return services;
}
