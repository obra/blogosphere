# Blogosphere: a blogging client for blog.fsck.com

**Date:** 2026-07-15
**Status:** Approved design, pre-implementation
**Working title:** Blogosphere (rename is trivial; the old app was "Post Through It")

## Overview

A blogging client for Jesse's Eleventy blog (`obra/blog`, published at blog.fsck.com via
GitHub Pages). The blog is a static site with no server: publishing means committing
markdown to `main`. The client makes that pleasant from a Mac, an iPhone, and an Android
phone — online or offline — for the full writing loop: drafting, editing, publishing,
link-blogging, and inline images.

Reference material lives in `inspo/`: `inspo/blog` is a checkout of the blog itself;
`inspo/post-through-it` is the previous SwiftUI client (useful for its iOS Share
Extension pattern and as a feature checklist, not as code to port).

### Goals

- Full-parity writing experience on macOS, iOS, and Android from one codebase.
- Fully functional offline; sync is the only thing that needs a network.
- Talk directly to GitHub. No middleware server, ever.
- Faithfully support the blog's existing conventions (drafts, opaqueId secret URLs,
  linkblog, releases, asset paths). The client adapts to the blog, not vice versa.
- Never corrupt the repo. Byte-level respect for content the client doesn't understand.

### Non-goals (out of scope for v1)

- Mentions and talks archives (monolith mirroring is a desktop/Claude workflow).
- About-page editing.
- Multi-user support, multi-blog support (design leaves room; build for one repo).
- Embedded git (see Sync engine — we use the GitHub Git Data API).
- Branch-based draft workflows; drafts commit to `main` with `draft: true`, matching
  current practice.
- Editing `_data/`, templates, or site config.

## Platform & stack decision

**Tauri v2, one project, three targets (macOS, iOS, Android).**

- **UI:** React + Vite + TypeScript (strict).
- **App core:** portable TypeScript with zero Tauri imports — runs under vitest on Node,
  and could be lifted into Capacitor shells or a PWA without a rewrite. This is the
  explicit hedge against mobile-Tauri immaturity.
- **Rust shell:** thin. Window/shell glue, SQLite plugin, keychain access, share intake.
  No business logic.
- **Editor:** Milkdown (Crepe preset) for WYSIWYG — markdown-first, remark AST
  underneath, faithful serialization — plus a raw-source mode (CodeMirror 6). The
  document of record is always the markdown string; WYSIWYG⌄source is a lossless toggle.
  Nunjucks shortcodes (`{% image %}`, `{% dotfile %}`) and raw HTML render as literal
  preserved blocks in WYSIWYG mode.

**Alternatives considered:**

- *Capacitor (mobile) + Tauri (desktop):* most battle-tested mobile web shells; costs a
  second toolchain. Fallback position if Tauri mobile disappoints.
- *PWA only:* fastest to ship, but iOS PWAs cannot be share targets and iOS can evict
  PWA storage — unacceptable for offline drafts.
- *Flutter / native SwiftUI:* no mature dual-mode markdown editor ecosystem; the
  previous SwiftUI client demonstrated the maintenance cost of a bespoke editor.

## Architecture

```
blogosphere/
  src/                      # TypeScript app (React + Vite)
    core/                   # portable, no Tauri imports, fully unit-testable
      model/                # entry types; front matter parsing & surgical editing
      store/                # SQLite persistence, asset cache, outbox, FTS search
      github/               # typed GitHub Git Data API client
      sync/                 # pull/push engine, mutation queue, diff3 merge, conflicts
    ui/                     # screens & components
    shell/                  # Tauri bindings: keychain, share inbox, fs paths, http
  src-tauri/                # Rust shell + mobile project scaffolding
  ios/ShareExtension/       # small Swift share extension (App Group inbox)
  android/                  # share-target intent filter + minimal Kotlin glue
  docs/superpowers/specs/   # this document and successors
```

Each `core/` module has one purpose, a typed public interface, and no knowledge of UI:

- **model:** what is an entry (post/draft/link/release), how front matter parses,
  how field edits serialize.
- **store:** how entries, sync state, queued mutations, and cached assets persist.
- **github:** how to read trees/blobs and write blobs/trees/commits/refs. Nothing else.
- **sync:** the state machine composing store + github: pull, push, merge, conflict.

## Content model

Four entry kinds; each is a markdown file with YAML front matter at a conventional path:

| Kind | Path | Front matter |
|---|---|---|
| Post | `content/blog/YYYY/YYYY-MM-DD-slug.md` | `type: post`, `title`, `date`, `tags?` |
| Draft | `content/drafts/YYYY-MM-DD-slug.md` | post fields + `draft: true`, `opaqueId?` |
| Link | `content/_linkblog/YYYY-MM-DD-slug.md` | `type: link`, `title`, `date`, `url` |
| Release | `content/releases/YYYY/YYYY-MM-DD-slug.md` | like post |

Permalinks derive from date + slug: `/YYYY/MM/DD/slug/`. Filename and front-matter date
must agree; the client keeps them in lockstep.

**Legacy HTML entries** (added 2026-07-15): the ~439 LiveJournal-era posts
(2002–2014) are `.html` files with the same YAML front matter. They are first-class
for browse/read/edit/sync — front-matter surgical edits work identically, and the
byte-stability guarantee covers them — but body editing is source mode only with HTML
highlighting (WYSIWYG is markdown-only and unreachable for them). New entries are
always markdown. Their front-matter `date:` is a full LJ-export timestamp; the client
tolerates that everywhere it reads dates. Renames/publishes preserve the `.html`
extension.

### Front matter handling: surgical edits only

The raw front-matter text is the document of record. The client parses YAML (js-yaml) to
*read* fields, but writes happen as minimal text edits to the raw block — replace the
`title:` line, insert a `draft: true` line, delete the `opaqueId:` line. The client
never re-serializes the whole YAML document. Consequences:

- Unknown fields, comments, key order, and formatting (e.g. `title: |` block scalars)
  survive untouched.
- A file the client opened but didn't edit round-trips byte-identical. This is enforced
  by the corpus test (see Testing).
- If a field edit can't be applied surgically with confidence (e.g. malformed YAML), the
  client refuses to save that field and says why, rather than guessing.

### Drafts lifecycle

- **New draft** → `content/drafts/YYYY-MM-DD-slug.md` with `draft: true` (belt and
  suspenders: a bare file in `drafts/` would otherwise publish — the directory's
  11tydata assigns layout and tags; only the flag excludes it from production builds).
- **Share a draft** → add `opaqueId: <uuid4>`, push. The blog's drafts plugin checks
  `opaqueId` *before* the draft flag, so the post publishes at
  `blog.fsck.com/private/{uuid}/` in production while staying out of collections and
  feeds. UI: "Copy secret link" whenever an opaqueId exists.
- **Publish a draft** → set date (front matter *and* filename) to publish date, move to
  `content/blog/YYYY/`, remove `draft`. Remove `opaqueId` by default (killing the
  secret URL), with a "keep secret link alive" option.
- **`draft: true` posts outside `content/drafts/`** (the other half of current
  practice) are recognized and listed as drafts too; publishing them fixes date and
  flag in place without moving directories unless asked.

### Editing published posts

Filename and date stay stable — path is permalink. Renaming (slug or date change) is a
deliberate, separate action with a "this changes the URL" warning, executed as
delete+add in one commit.

## Sync engine

**GitHub Git Data API, not embedded git.** The repo's `.git` is ~936MB; a clone on
phones is a non-starter and libgit2 on three platforms is a project in itself. All the
markdown is ~624KB. So: sync the full markdown corpus, fetch assets lazily, build
commits client-side (blobs → tree → commit → ref).

Per-entry sync state in SQLite: `path`, `base_sha` (blob SHA at last sync),
`base_content` (text at that SHA), `working_content`, `dirty` flag.

- **Initial sync:** resolve `refs/heads/main` → commit → recursive tree, filtered to the
  four content paths plus a path index of `content/assets/`. Fetch all `.md` blobs,
  batched. (~600KB total.)
- **Pull:** compare remote root tree SHA to last seen; if moved, diff trees and fetch
  changed markdown. Clean entries update in place. Dirty entries whose remote copy also
  changed proceed to merge.
- **Merge (same file changed both sides):** three-way text merge (diff3, node-diff3)
  of `base_content` / `working_content` / remote content, front matter included.
  Non-overlapping hunks merge automatically with a visible "merged with remote changes"
  notice; the pre-merge working copy is snapshotted locally first (never lossy).
  Overlapping hunks → conflict UI: keep mine / take remote / side-by-side diff.
  No YAML-aware structural merge — over-engineering for a single author.
- **Push** (deliberate only — manual ⌘S/sync button, publish, share secret link,
  rename, delete, and creating a public post/link; never on typing pauses, app
  foreground, or launch, since every push to main triggers a Pages deploy — burning
  Actions minutes and shipping half-finished edits of published posts. Foreground
  and launch do a pull-only refresh instead):
  1. Pull first (cheap tree-SHA check).
  2. Create blobs for dirty files + outbox images they reference.
  3. Build one tree off the current remote commit, one commit. Messages from templates:
     `Post: <title>`, `Edit: <title>`, `Draft: <title>`, `Link: <title>`,
     `Delete: <path>` (configurable in Settings).
  4. Update ref *without* force. If the remote moved between steps 1 and 4, the update
     fails cleanly; loop to 1.
- **Deletes/renames:** explicit mutations in the queue; a rename is delete+add in one
  commit so the site never 404s mid-sync.
- **Offline:** edits accumulate as dirty state; the mutation queue persists across
  restarts. The app never blocks writing on connectivity.
- **Publishing feedback (stretch):** after a push, watch the Pages Actions run and flip
  the entry's status to "live" when the deploy finishes.

Single branch (`main`), single remote, single author. Rate limits are a non-issue at
this scale.

## Images

- Input: paste, drag-drop, photo picker, camera.
- Naming and location follow existing convention:
  `content/assets/YYYY/MM/pasted-image-YYYYMMDD-HHMMSS.png`, referenced as
  `![alt](/assets/YYYY/MM/…)` inserted at the cursor. Alt-text prompt, skippable.
  (Co-located per-post images remain readable but the client writes to `assets/`.)
- New images land in a local outbox and upload *in the same commit* as the entry that
  references them — no broken-image window on the live site.
- HEIC → JPEG on import. Oversized images get a warn-and-downscale offer.
- Rendering: editor and preview resolve image refs via a resolver — local cache hit →
  disk; miss + online → fetch blob via API (works on the private repo), cache; miss +
  offline → placeholder. Old posts backfill lazily as opened. The resolver handles both
  absolute `/assets/…` refs and relative refs (resolved against the entry's repo
  directory — old posts co-locate images beside the markdown file).

## Link blog capture

- **Android:** share-target intent filter (manifest + minimal Kotlin glue, or the
  community share-target plugin if it's healthy when we build) → "New link post" sheet,
  URL and page title prefilled.
- **iOS:** native Share Extension (a platform requirement for every framework) that
  writes a JSON payload to an App Group inbox; the app ingests on next launch or
  foreground. The old client's ShareBridge implements exactly this pattern — crib it.
- **macOS:** "＋ Link" button/shortcut that prefills from a URL on the clipboard.
- Prefill: title from share metadata, else fetched `og:title`/`<title>` when online,
  else blank. Always editable.
- Captured links persist immediately as local drafts — a share arriving offline is
  never dropped. Inbox items are deleted only after durable persistence in SQLite.

## UI structure

- **Desktop:** three-pane. Sidebar (Drafts / Posts / Links / Releases + sync status),
  entry list (grouped by year/month, FTS search, unsynced badges), editor.
  Cmd-N new post, Cmd-Shift-L new link, Cmd-S save.
- **Mobile:** same screens as a stack (list → editor), floating "＋" for new post/link,
  share sheet as the primary capture entry, formatting toolbar above the keyboard in
  both editor modes.
- **Editor chrome:** title, tag chips, date (auto, editable), body in Crepe WYSIWYG ⌄
  raw markdown (per-entry sticky toggle), preview toggle, draft state, "Copy secret
  link" when applicable.
- **Language:** "Save" and "Publish" — no git jargon anywhere in the UI. One sync
  status pill (synced / N pending / offline / conflict), tap for detail.

## Auth & security

- Fine-grained GitHub PAT scoped to `obra/blog`, contents read/write. Entered once in
  Settings, stored only in the OS keychain (Tauri keyring plugin) — never in SQLite,
  never logged. The repo is private, so reads require it too.
- 401 → re-auth prompt. All GitHub traffic over the platform HTTP stack
  (webview `fetch`; api.github.com sends CORS headers; tauri-plugin-http as fallback).

## Error handling & data safety

- Every keystroke debounce-persists to SQLite; crash/force-quit loses nothing.
- The client validates before committing: filename pattern, front-matter parse, and
  surgical-edit integrity. A file that fails validation never gets pushed.
- Queue and inbox deletions happen only after the next stage is durably persisted.
- Network errors: retry with backoff, visible "N changes pending" badge.
- All user-visible errors in plain language with a retry affordance.

## Quality engineering (day 0)

Set up before the first feature lands, enforced in CI on every push:

- **Lint/format:** Biome as linter + formatter, configured aggressively (all rule
  groups on, with a small documented deny-list of rules that fight the codebase);
  `tsc --noEmit` with `strict` + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`; `cargo clippy` with pedantic warnings denied +
  `rustfmt --check` for the shell. Pre-commit hook auto-formats staged files and runs
  lint + typecheck + fast tests; nothing lands unformatted.
- **Unit tests:** vitest across `core/*`. Sync engine tested as a state machine against
  recorded GitHub API fixtures (pull/push/merge/conflict/interrupted-push scenarios).
- **Fuzzing / property tests:** fast-check from day 0 —
  - front-matter surgical editor: `parse(edit(text))` reflects the edit and nothing
    else; unedited fields byte-stable under arbitrary valid/invalid YAML inputs;
  - slug/path/date functions: total, reversible where claimed;
  - diff3 merge: `merge(base, mine, base) == mine`, `merge(base, base, theirs) ==
    theirs`, idempotence, conflict-detection soundness on generated edit scripts;
  - model-based testing of the sync state machine (fast-check commands) with a
    simulated remote.
  - `npm run fuzz` runs the same properties at high iteration counts; scheduled nightly
    in CI.
- **Corpus round-trip test:** parse + reserialize every markdown file in a real blog
  checkout; any byte difference fails. Runs locally against `inspo/blog` (or any
  checkout via env var); CI uses a synthetic corpus exercising every front-matter shape
  found in the real one (block scalars, quoted titles, tags arrays, opaqueId, draft).
- **Integration suite:** real GitHub API against a throwaway test repo (token via CI
  secret), covering initial sync, push, non-FF retry, and merge.
- **E2E:** Playwright against the web build for editor and capture flows. Manual smoke
  per platform per release; Maestro later only if it earns its keep.

## Delivery order

1. **v0 — Mac:** full core (sync, dual-mode editor, images, linkblog, drafts lifecycle)
   in the Tauri desktop shell. Fastest iteration loop; Jesse's primary writing surface.
2. **v0.5 — iOS:** mobile layout, Share Extension, photo/camera import, HEIC.
3. **v1 — Android:** share target, same mobile layout.

Each phase ends with the corpus test green against the live blog checkout and a real
post published through the client.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Tauri mobile immaturity (plugins, docs) | Core is shell-portable by construction; Capacitor is the tested fallback. Mobile risk is deferred to v0.5 — desktop proves the product first. |
| WYSIWYG mangles idiosyncratic markdown | Markdown string is the document of record; shortcodes render as literal blocks; corpus + property tests gate every release; raw mode always available. |
| Client corrupts the repo | Surgical front-matter edits, pre-commit validation, corpus round-trip test, no force-push, ref update with compare-and-swap. |
| Concurrent edits from Claude Code / vim | Pull-before-push, diff3 auto-merge for non-overlapping edits, snapshot before merge, conflict UI for the rest. |
| iOS Share Extension friction | Known pattern; the old client's ShareBridge is a working reference implementation. |
