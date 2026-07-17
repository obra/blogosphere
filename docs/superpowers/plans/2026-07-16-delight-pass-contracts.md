# Delight pass — feature contracts (2026-07-16)

Six features, implemented by parallel agents against pre-wired contracts. The
hub files (state.types/state.ts/EditorScreen/AppShell/menu.ts/github client/
stub components) are ALREADY WIRED and compiling — do not restructure them.
Each feature owns exactly the files listed under "You own"; do not edit files
owned by another feature. New files you create are yours.

House rules (all features):
- TDD: write the failing test first. Run ONLY your own test files
  (`npx vitest run <your files>`) — the full suite/gates run in integration.
- Biome is strict (preset all). 300-line file cap, ~50-line function cap,
  no magic numbers outside tests, useExportsLast, hoisted top-level regexes.
  Match surrounding style. `// biome-ignore lint/<rule>: <reason>` only for
  genuine false positives.
- Test fakes live in src/ui/app/testing/ (buildFakeServices, makeEntry,
  fakeSync) and src/core/sync/testing/ (createHarness with a real sqlite
  store + FakeRemote). Never mock behavior under test.
- Copy tone: plain language, no git jargon in UI strings.

## A. Publish sheet 2.0 — URL preview + editable slug

You own: `src/ui/app/PublishDialog.tsx`, `src/core/model/publish.ts`,
`src/core/model/publish.test.ts`, `src/ui/app/state.creationActions.ts` (the
publishDraft passthrough only), new test files.

- `PublishOptions.slug?: string` already exists in model/types.ts.
- `planPublish` must honor `opts.slug` for the new path's slug (slugify it);
  default remains the current filename's slug. Byte-stability elsewhere.
- PublishDialog gains a Slug field, defaulting to `slugify(title)` when the
  current filename slug is "untitled"-like, else the current slug. Show a live
  URL preview line (`/YYYY/MM/DD/<slug>/`) that updates as date/slug change.
  The dialog receives what it needs via props from PublishSection
  (EditorScreen.tsx passes `today` + `hasOpaqueId` today — you may extend the
  props interface and the ONE call site in EditorScreen.tsx's PublishSection,
  nothing else there).
- Empty/invalid slug disables Publish. Preserve keepOpaqueId behavior.

## B. ⌘K quick open

You own: `src/ui/app/QuickOpenPalette.tsx` (replace the stub internals; keep
the exported name and the store contract), new `src/ui/app/fuzzyMatch.ts` +
tests, `src/ui/app/QuickOpenPalette.test.tsx`.

- Fuzzy subsequence scoring (not substring): prefer word-boundary and
  consecutive-run matches; case-insensitive; score ties break by recency
  (updatedAt desc). Empty query = most recently updated entries first.
- ↑/↓ move an active row (data-active="true"), Enter opens active, Escape
  closes. Mouse hover + click work. Cap results (~10).
- Below entry results, a "Commands" group: New Draft, New Link…, Sync Now,
  Activity Log — invoking the matching store actions.
- Store contract (already wired): quickOpenOpen, openQuickOpen/closeQuickOpen;
  open via ⌘K (DOM fallback + native menu already installed).

## C. Deploy watch — "Live on the site ✓"

You own: `src/ui/app/state.deployActions.ts` (replace stub body), its new
test file.

- Contract: `watchDeploy(ctx, commitSha)` — already invoked by attachSync when
  a log entry carries `commitSha` (every successful push, any trigger).
- Poll `ctx.get().services.github.listWorkflowRunsForSha(commitSha)` every
  ~10s for up to ~4 minutes (inject timing deps for tests — follow the
  AppStoreDeps injection pattern or module-level `setTimeout` wrapped so tests
  can fake it; keep it testable WITHOUT real timers where possible).
- Outcomes → append SyncLogEntry-shaped rows to state.syncLog (respect
  SYNC_LOG_CAP; reuse the slice pattern from attachSync):
  - run concluded success → info "Live on blog.fsck.com ✓" with the run's
    htmlUrl as detail; ALSO a success toast "Live on blog.fsck.com".
  - run concluded failure → error "Deploy failed — the site still shows the
    previous version" with htmlUrl detail.
  - timeout with no runs found → info "Couldn't find a deploy for this push".
- Auth/permission errors (GitHubError kind "auth" or any throw on the FIRST
  poll): log ONE info line "This token can't watch deploys (needs Actions
  read)" and stop — never a toast, never repeated per push (remember with a
  module-level or ctx-held flag).
- Dedupe: a second watchDeploy for the same sha while one is active is a
  no-op. services.github may be null → return silently.

## D. Pick up where you left off + list keyboard nav

You own: `src/ui/app/state.entryActions.ts` (select/setSection persistence +
init-time restore hooks), `src/ui/app/state.miscActions.ts` (ONLY the init()
function body), `src/ui/app/EntryList.tsx`, new test files.

- Persist section + selectedPath to store meta (keys `ui:lastSection`,
  `ui:lastSelectedPath`) on every select/setSection (fire-and-forget setMeta).
- init(): after refresh(), restore section, and selectedPath only if the
  entry still exists. Missing/corrupt meta = defaults, never a crash.
- EntryList keyboard nav: when focus is inside the list, ↑/↓ move selection
  through the VISIBLE (section-filtered, grouped) order; Enter moves focus to
  the editor surface (dispatch focus to `.milkdown .ProseMirror` or
  `.cm-content`, whichever is present). Home/End jump. Don't fight the search
  input: keys only act when the event target is a list row/button.

## E. Versions — per-entry git history

You own: `src/ui/app/VersionsPanel.tsx` (replace stub internals; keep export
+ store contract), its new test file.

- On open (versionsPath non-null): `services.github.listCommitsForPath(path,
  30)` → timeline list: relative time (reuse relativeTimeLabel from
  format.ts) + first line of the commit message. Loading/error/empty states;
  when services.github is null show "Connect to GitHub to see history."
- Selecting a commit: `getFileAtCommit(path, sha)` → read-only view
  (monospace pre, scrollable) with a "Restore this version" button →
  `store.restoreVersion(path, raw)` (already implemented) then closeVersions.
  A null file at that commit shows "This version predates the file."
- The current working copy should be labeled at the top ("Now — unsynced
  changes" when the record is dirty).
- Test with fakeSync-less buildFakeServices: inject a fake `github` object
  into services ({ ...fake.services, github: {...} as GitHubApi }) — only the
  two methods are used.

## F. Live view polish

You own: `src/ui/app/LiveView.tsx` (replace stub internals; keep export and
`url` prop), `src/ui/app/app-delight.css` (live-view section only), its new
test file.

- Loading state: overlay/skeleton until iframe onLoad; a Reload button
  (remount via key bump); "Open in browser" stays (openExternal).
- A quiet hint bar note when appropriate: content deploys take ~a minute
  after a push (static copy is fine).
- The iframe stays a DIRECT src to the live URL (verified frameable
  2026-07-16: no X-Frame-Options/CSP). No fetch/srcDoc — that would break
  relative assets and add CORS pain.
- Dark mode: the frame background stays white (site is light) — frame chrome
  uses app tokens.

## Integration phase (not you)

Full-suite gates, EditorScreen/AppShell test updates for new chrome, spec
amendment, live browser check, macOS build.
