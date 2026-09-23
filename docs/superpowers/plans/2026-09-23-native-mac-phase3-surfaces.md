# Native Mac Redesign — Phase 3 (Surfaces) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On macOS, move the app's secondary surfaces to their native homes: a real menu bar (Entry, Format, Find, Help) and context menus; sheets that never interrupt; toasts routed to the HUD, alerts, and state; Settings in its own window.

**Architecture:** Four parts, each shippable alone and merged to `main` (fast-forward) before the next starts: A menus, B sheets, C toast routing, D Settings window. Decisions are pure functions with unit tests (menu models, toast routing, the settings protocol); components and Tauri wiring stay thin. Everything Mac-only is gated on `shell.platform() === "macos"` or `html[data-platform="macos"]`.

**Tech Stack:** as phases 1–2. `@tauri-apps/plugin-dialog` 2.7.1 (`message` with custom `buttons`, `open`), `@tauri-apps/plugin-fs` `readFile`, Tauri `WebviewWindowBuilder`, `emitTo`/`listen`.

**Spec:** `docs/superpowers/specs/2026-09-23-native-mac-redesign-design.md` §4 (context menus), §5 (surfaces), §6 (menu bar), §8, §9, §10, §11 phase 3.

**Plan review (/par, 2026-09-23):** two reviewers, 11 and 10 findings, nearly all legitimate and folded in below. Main changes: sheets block the whole window and the command layer refuses entry-changing commands while one is up; Format commands follow editor focus; popup menus get one key per item list; the token flow validates before touching the keychain and replies before the initial sync; deploy state is per push and clears itself; Escape listens in the bubble phase; `open_settings` is desktop-only; View › editor modes (⌥⌘1–3) move to phase 4 with the segmented control.

## Global Constraints

- Mac-only behavior is gated on `shell.platform() === "macos"` (components, store actions) or `html[data-platform="macos"]` (CSS). iOS, Android, web, and the phone layout keep today's modal Settings, toasts, and auto-opening conflict dialog. Exceptions, harmless everywhere: Escape cancels every sheet, and the four sheet openers refuse while another sheet is open. (On other platforms the conflict dialog still auto-opens outside that rule; the one-at-a-time guarantee is a macOS one.)
- No `light-dark()`; `-webkit-user-select`; Biome zero errors/warnings/infos; every test seen failing first; never bypass the pre-commit hook; no `--no-verify`.
- Small commits, one per task at most. Each part ends with: real-app check through `scripts/dev-app.sh` + `scripts/tauri-mcp.sh`, a /par code review of the part's diff, fixes, then `git merge --ff-only` into `main` from `/Users/jesse/git/blogosphere`. No push.
- Semantic icons only (`<Icon name>`); new names go into `iconNames.ts` with their first use.
- Menu item titles use title case and "…" when the command asks for more input before acting (HIG `menus.md`).
- The Settings window owns no state: no SQLite, keychain, GitHub, or sync. The main window is the only writer.

## Review Focus

1. **⌘B in the editor toggles bold exactly once** once the Format menu carries ⌘B (the menu and the editor's own keymap must not both fire). Task A5 spikes this first and picks the design from the result.
2. **A right-click on an unselected row** acts on *that* row (Delete… deletes the right entry, Publish… publishes it), not on the selection. Task A7 tests `runMenuCommand` with an explicit path.
3. **Two errors at once on Mac** (e.g. a failed save while a failed delete alert is up) → alerts queue one at a time, identical messages collapse; nothing is lost and nothing stacks. Task C3.
4. **Replacing a good token with a bad one** (Settings window or modal) → the error shows inline, the keychain still holds the old good token, the app stays connected, and no second error appears in the main window. Tasks D1, D3.
6. **A sheet is open and the person presses ⌘N, ⌘1–4, ⌘K, or an Entry menu item** → nothing changes underneath the sheet (the Publish sheet must never switch to another entry). Task B1.
5. **Closing the main window while Settings is open** → the app still quits (Settings closes after the flush). Task D6.

## Execution record

**Part A (menus), 2026-09-23.** Tasks A1–A7 as planned, plus: the Edit/Format/Window/Help builders moved to `menuSubmenus.ts` (menu.ts passed Biome's 300-line limit); `focusEntrySearch` lives in `entrySearchFocus.ts` (EntryList.tsx exports components only). Verified live: menu bar order (File, Entry, Edit, Format, View, Window, Help), Format › Bold reaching the focused Markdown editor, Edit › Find › Search Entries focusing the search field, Entry › Versions… on the selection restored at launch, the Window menu listing open windows. **Not verified live:** the raw ⌘B/⌘I/⌘E keystrokes toggling once (another app held secure keyboard input, which blocks synthetic keys; editors' keymaps kept as they were, since WebKit gives the page the first look at a key equivalent) and right-click menus (background automation can't open context menus); both are on Jesse's manual list. Code review (/par, 4 + 2 findings, all fixed): enabled states built before `init()` restored the selection were never corrected (now each tracker applies once after install, and Publish rechecks "draft" when run); Help and Window roles were set before the menu was installed (now after `setAsAppMenu`); row context menus read the entry from the store instead of a stale search snapshot.

---

## Part A — Menus

### Task A1: Live URL from any entry

**Files:** Create `src/ui/app/liveUrl.ts`, `src/ui/app/liveUrl.test.ts`. Modify `src/ui/app/useEditorScreenState.ts` (move `liveUrlFor` out), `src/ui/app/menuModel.ts`, `src/ui/app/MacToolbar.tsx`.

**Produces:** `liveUrlFor(record, parsed)` (moved, unchanged), `entryLiveUrl(model: ModelApi, record: EntryRecord): string | null` (parses, then `liveUrlFor`). `runMenuCommand(id, store, path?: string)` — `path` defaults to `selectedPath`; Open on Site computes the URL with `entryLiveUrl`.

- [ ] Tests: `entryLiveUrl` returns `SITE_ORIGIN + permalink` for a published post; null for a draft without `opaqueId`; the secret URL for a draft with one; null when the model can't parse.
- [ ] Tests (menuModel): `runMenuCommand("openOnSite", store, path)` opens the entry's URL via the `openExternal` seam (use whatever the existing `menuModel.test.ts` uses to observe it; if nothing observes it yet, add an injectable opener on the store deps rather than mocking the module); `runMenuCommand("delete", store, otherPath)` deletes `otherPath` while a different entry is selected.
- [ ] Implement; drop the `liveUrl` argument from `EntryActionsButton`'s `runMenuCommand` call. Full suite green. Commit "Menu commands work out an entry's live URL themselves".

### Task A2: Menu models for the Entry menu, row and section context menus

**Files:** `src/ui/app/menuModel.ts`, `src/ui/app/menuModel.test.ts`.

**Produces:**
- `MenuCommandId` gains `"publish"`.
- `entryMenuItems(record: EntryRecord | null, liveUrl: string | null): MenuItemModel[]` — Publish… (`accelerator: "CmdOrCtrl+Shift+P"`, enabled only for drafts), then `entryActionItems` (Open on Site, Versions…, Copy Secret Link, —, Discard Changes…, Delete…). With `record === null` every command is disabled.
- `entryRowItems(record, liveUrl)` — Open on Site, Copy Secret Link, —, Publish… (always present, enabled only for drafts), Delete… (spec §4). Fixed items and order for every record: popup menus are cached per key (`menuPopup.ts`).
- `sectionMenuItems(section: Section): MenuItemModel[]` — drafts/posts: New Post; links: New Link…; releases: `[]`. Popped with key `section:${section}` so each list has its own cached menu.
- `FILE_MENU_COMMANDS: readonly MenuCommandId[]` = `["newPost", "newLink"]`, the model-driven File items (A4 builds File from it).
- `runMenuCommand("publish", store, path)` selects `path` if it isn't selected, then `openPublishDialog()`.

- [ ] Tests: each builder's ids, titles, enabled flags (null record; draft vs published; `opaqueId`; dirty with/without `baseContent`; live URL present/absent); every command id in `entryRowItems`, `entryActionItems`, and `composeMenuItems` also appears in `entryMenuItems` or the File menu model (spec §10 "every toolbar, ellipsis, and context-menu command has a menu-bar twin" — assert against `FILE_MENU_COMMANDS`); `entryRowItems` returns the same ids in the same order for a draft and a published post.
- [ ] Test: `publish` on an unselected path selects it and opens the dialog.
- [ ] Implement. Commit "Menu models: Entry menu, row and section context menus".

### Task A3: One builder for native menus from models

**Files:** Create `src/ui/app/nativeMenu.ts`. Modify `src/ui/app/menuPopup.ts`.

**Produces:** `buildNativeItems(models, run): Promise<{ items: Array<MenuItem | PredefinedMenuItem>; byId: Map<MenuCommandId, MenuItem> }>` (passes `accelerator` through), `applyEnabled(byId, models): void` (fire-and-forget `setEnabled`, errors swallowed). `popupMenu(key, models, run, anchor | { x: number; y: number }): Promise<void>` — a point pops the menu at that position (context menus); an element keeps today's under-the-button placement. Resolves when `popup()` returns.

- [ ] This is Tauri wiring with no logic beyond the models; no unit test (the models are tested). Typecheck + existing tests green.
- [ ] Commit "Native menus: one builder shared by popups and the menu bar".

### Task A4: Entry menu in the menu bar

**Files:** `src/ui/app/menu.ts`, `src/ui/app/menu.test.ts`.

- [ ] File keeps New Draft, New Link…, —, Save & Sync, Sync Now; New Draft and New Link… come from `FILE_MENU_COMMANDS` (A2) so the twin test covers what the menu really shows.
- [ ] New **Entry** submenu between File and Edit, built with `buildNativeItems(entryMenuItems(...), id => runMenuCommand(id, store))`.
- [ ] Replace `menuEnabledState`/`applyEnabledFlags` with: on store change, when the selected record object (or `services`) changed, recompute `entryMenuItems(record, entryLiveUrl(model, record))` and `applyEnabled`. Keep the diff so typing (which replaces the record) doesn't flood IPC: compare the enabled flags, not the objects, before calling `applyEnabled`.
- [ ] `menu.test.ts`: replace the `menuEnabledState` tests with an exported pure `entryMenuState(state)` returning `{ record, liveUrl }` for the selection (the flags themselves are tested in A2).
- [ ] Commit "Menu bar: an Entry menu with Publish…, Open on Site and the rest".

### Task A5: Format menu

**Files:** Create `src/ui/editor/activeEditor.ts` + test. Modify `src/ui/editor/Editor.tsx`, `src/ui/editor/Toolbar.tsx` (image picking shared), `src/ui/app/menuModel.ts`, `src/ui/app/menu.ts`, `src/shell/types.ts`, `src/shell/tauri.ts`, `src/shell/fake.ts`, `src/ui/app/testing/fakeShell.ts`, `src-tauri/capabilities/default.json` if `fs:allow-read-file` is needed for picked paths.

**Produces:**
- `activeEditor.ts`: `interface FormatTarget { handle(): EditorHandle | null; onImage: OnImage }`; `setActiveEditor(target): () => void` (returns an unregister that only clears if still current), `getActiveEditor(): FormatTarget | null`, `subscribeActiveEditor(fn): () => void`.
- `Editor.tsx` registers itself **while its editing surface has focus** (`focusin` on its root registers, `focusout` to outside the root unregisters) and only when formattable: not `sourceLanguage === "html"` and not read-only. So Format is enabled exactly when the Write or Markdown body has focus; from the title, tags, list, a sheet, or the Settings window the items are disabled and dispatch nothing (a stale cursor in a body the person isn't looking at must never get `****`). Opening the menu bar doesn't move DOM focus, so the target survives the menu click.
- `ShellApi.pickImage(): Promise<{ bytes: Uint8Array; ext: string } | null>` — Tauri: `open({ multiple: false, filters: [{ name: "Images", extensions: ["png","jpg","jpeg","gif","webp","svg"] }] })`, then `readFile(path)`; ext from the path. Fakes return a configurable value (default null).
- `MenuCommandId` gains `bold | italic | code | heading | link | image`; `formatMenuItems(enabled: boolean)`: Bold ⌘B, Italic ⌘I, Code ⌘E, Heading, —, Link…, Image…. No ⌘K on Link (Quick Open owns it). `runMenuCommand` dispatches to `getActiveEditor()?.handle()`; `image` awaits `shell.pickImage()`, then `onImage(bytes, ext)`, then `handle.insertImage(ref)`.

- [ ] **Spike first (Review Focus 1):** in the dev app, add the Format menu with ⌘B and press ⌘B in the Write editor and in the Markdown editor (computer-use `app_key`), checking the body text via the bridge. Two outcomes are plausible (WebKit may give the page the key first and stop there, or `AppShell.tsx:87-90`'s note that a DOM handler plus the menu "would double-fire" may apply). If it toggles once, keep the editors' keymaps. If twice, the menu must own the keys on macOS: remove `Mod-b`/`Mod-i`/`Mod-e` from `sourceEditorSetup.ts`'s keymap for macOS, and for Crepe find how its commonmark keymap is overridden (Milkdown's `keymap` config for the strong/emphasis/inlineCode schemas) before writing code; if Crepe can't be overridden cleanly, stop and report. Record the result in the execution record either way.
- [ ] Tests: `activeEditor` register/unregister/stale-unregister/subscribe; `Editor` registers on focus and unregisters on blur in Write and Markdown, never for HTML or read-only (render with the existing Editor test helpers); `runMenuCommand("bold")` with no focused editor does nothing; `formatMenuItems` flags; `runMenuCommand("bold")` calls the active handle's `toggleBold`; `image` with a fake picked file calls `onImage` then `insertImage(ref)`; picker cancelled → nothing.
- [ ] Wire the Format submenu between Edit and View (HIG order: App, File, Edit, Format, View, Window, Help; Entry sits after File) and re-apply its enabled state on `subscribeActiveEditor`.
- [ ] Commit (split if large): "Format menu: bold, italic, code, heading, link and image for the open editor".

### Task A6: Edit › Find, and Help

**Files:** `src/ui/app/menu.ts`, `src/ui/app/EntryList.tsx` (a `focusEntrySearch()` helper next to `focusEditorSurface`), test in `EntryList.test.tsx`.

- [ ] Test: `focusEntrySearch()` focuses the list's search field.
- [ ] Edit gains —, Find ▸ Search Entries (⌥⌘F → `focusEntrySearch()`).
- [ ] Help submenu: Blogosphere Help → `openExternal("https://github.com/obra/blogosphere#readme")`. Mark it with Tauri's help-menu role if the JS API offers one (check `Menu`/`Submenu` docs; if not, a plain submenu titled "Help" — macOS adds the search field to a menu titled Help).
- [ ] Commit "Menu bar: Find › Search Entries and a Help menu".

### Task A7: Context menus

**Files:** `src/ui/app/EntryList.tsx`, `src/ui/app/Sidebar.tsx`, `src/ui/app/app-macos-chrome.css`, tests in `EntryList.test.tsx`, `Sidebar.test.tsx`.

- [ ] On macOS only: `onContextMenu` on an entry row → `preventDefault()`, mark the row `data-context="true"` (a 2px accent inset outline, the Finder "context ring"), `popupMenu("entryRow", entryRowItems(record, entryLiveUrl(model, record)), id => runMenuCommand(id, store, record.path), { x: event.clientX, y: event.clientY })`, then clear the mark when the promise settles. Selection doesn't change.
- [ ] Sidebar section buttons: `sectionMenuItems(section)` popped with key `section:${section}`; skip the menu when it's empty. Entry rows use key `entryRow`.
- [ ] Tests (jsdom, fake shell `platform: "macos"`): right-click calls the popup seam with the row's items and a runner bound to that row's path; non-Mac right-click does nothing custom. Inject the popup function through a module seam the tests can replace (e.g. a `popupMenu` prop default or `vi.mock("./menuPopup")` — the menu itself is Tauri wiring; the test checks the items and the bound path, not native behavior).
- [ ] Commit "Context menus on entry rows and sidebar sections".

### Part A close

- [ ] Real app: Entry and Format menus enable/disable with selection and mode (read through computer-use `app_menu` or AX); ⌘B single toggle; ⌥⌘F focuses search; right-click a row shows the menu (screenshot while frontmost; if Jesse is typing, record it for his manual check).
- [ ] /par on `git diff main...HEAD`; fix; ff-merge to main.

## Part B — Sheets

### Task B1: One sheet at a time; conflict sheet state

**Files:** `src/ui/app/state.miscActions.ts`, `src/ui/app/state.types.ts`, `src/ui/app/state.ts`, test `src/ui/app/state.sheets.test.ts`.

**Produces:** `anySheetOpen(state): boolean` (Publish, New Link, Versions, Conflict). `openPublishDialog`, `openNewLinkDialog`, `openVersions`, `openConflict(path)`, `openQuickOpen` do nothing while a sheet is open. New state `conflictSheetPath: string | null`, actions `openConflict(path)`, `closeConflict()`; resolving a conflict clears it.

The window is modal while a sheet is up (HIG sheets): pointer input is blocked by the full-window backdrop (B4 keeps `inset: 0`), and the **command layer** refuses anything that would change what's underneath: `runMenuCommand` returns early while `anySheetOpen`, and every native-menu action and DOM shortcut that isn't already a model command (New Draft, New Link…, Save & Sync keeps working, Sync Now keeps working, sections ⌘1–4, Quick Open, Hide Sidebar) goes through a `unlessSheetOpen(store, fn)` wrapper. Selection itself (`select`) stays unguarded so publish/create flows that select after closing a sheet keep working.

- [ ] Tests: each opener is refused while each other sheet is open; `openConflict` sets the path; `resolveConflict` for that path clears it; with Publish open, `runMenuCommand("newPost")`, `runMenuCommand("delete", path)`, and the wrapped section switch change nothing and Publish stays on the same entry.
- [ ] Commit "Sheets: only one at a time; conflict sheet state".

### Task B2: Escape cancels every sheet

**Files:** Create `src/ui/app/useEscapeToCancel.ts`. Modify `PublishDialog.tsx`, `NewLinkDialog.tsx`, `ConflictDialog.tsx`, `VersionsPanel.tsx`; tests in their test files.

- [ ] `useEscapeToCancel(onCancel)`: a document `keydown` listener in the **bubble** phase while mounted; Escape that isn't `defaultPrevented` and isn't `isComposing` → `preventDefault()`, `onCancel()` (so an IME composition, a date picker, or any inner control that handles Escape keeps it). Replaces VersionsPanel's element-level handler (which only worked with focus inside).
- [ ] Tests: Escape with focus on `document.body` closes each sheet; an Escape an inner handler already `preventDefault`ed, or with `isComposing`, doesn't. Return already submits Publish and New Link (form submit); Conflict and Versions have no default button (the safe choice there is "Not now"/close, which Escape covers).
- [ ] Commit "Escape cancels every sheet, wherever focus is".

### Task B3: Conflicts never interrupt on macOS

**Files:** `src/ui/app/ConflictHost.tsx`, `ConflictHost.test.tsx`, `EditorScreen.tsx`, `SyncStatusButton.tsx`, tests.

- [ ] `ConflictHost` on macOS shows the dialog only for `conflictSheetPath`; Cancel → `closeConflict()`. Elsewhere, unchanged auto-open.
- [ ] Editor (macOS): the conflict note becomes a bar: "This entry has a conflict." + a "Resolve…" button → `openConflict(path)`.
- [ ] Activity popover (macOS): clicking a conflict selects it, closes the popover, and opens the sheet.
- [ ] Tests: on macOS a new conflict in `syncStatus` renders no dialog; selecting the conflicted entry renders no dialog; Resolve… opens it; the popover conflict opens it; on web the old auto-open test still passes.
- [ ] Row conflict symbol → deferred to phase 4 (rows are rebuilt there; today's conflict pill sits inside the row `<button>`, and a nested button is invalid). Record in the execution record.
- [ ] Commit "macOS: conflicts wait for Resolve… instead of popping a dialog".

### Task B4: Sheet look

**Files:** `src/ui/app/app-macos-chrome.css`, `cssContract.test.ts` if it enumerates selectors.

- [ ] Under `html[data-platform="macos"]`: the backdrop still covers the whole window (`inset: 0`, blocking clicks on the toolbar too) and dims it with `rgba(0,0,0,0.18)`; the sheet sits at the top center just below the 52pt toolbar row, `--bg-raised`, radius 10px, the popover shadow token, no border, and slides down 8px (no motion under `prefers-reduced-motion`). Sheet headings use the macOS title style (13px semibold).
- [ ] Real-app screenshot of Publish and New Link in light and dark.
- [ ] Commit "macOS sheets: dim the window, drop from the toolbar".

### Part B close

- [ ] Real app: Publish via ⇧⌘P then Escape; New Link then Return; ⌘N while Publish is open does nothing to the sheet; a conflict (fake one by editing the same entry on GitHub if practical, otherwise the component tests stand) waits for Resolve….
- [ ] /par; fix; ff-merge.

## Part C — Toast routing

### Task C1: Toast sources and the routing rule

**Files:** `src/ui/app/state.types.ts` (`Toast.source?: "sync" | "load" | "deploy"`), `state.entryActions.ts` (sync at `saveNow`, load at `refresh`), `state.deployActions.ts`, create `src/ui/app/toastRoute.ts` + test.

**Produces:** `routeToast(toast, context: { windowFocused: boolean }): "hud" | "alert" | "none"` (macOS only):
- `source: "sync"` → `none` (the sync button already shows Error; popover Sync Now retries)
- `source: "load"` → `none` (refresh runs after every sync round, so this is rarely something the person just did; with no entries the list's empty state (C4) shows it, otherwise the list keeps what it has)
- `source: "deploy"` → `hud` if `windowFocused`, else `none`
- `tone: "error"` → `alert`
- `info`/`success` → `hud`

- [ ] Tests for every branch. Commit "Toast routing rule for macOS".

### Task C2: HUD

**Files:** state (`hud: { id: string; message: string } | null`, `dismissHud(id)`), `addToast` (macOS branch), create `src/ui/app/Hud.tsx` + test, `app-macos-chrome.css`, `AppShell.tsx`.

- [ ] `addToast` on macOS: route; `hud` sets `hud` (replacing any current one) and returns the id; `none` returns the id and stores nothing; `alert` → C3. Other platforms unchanged (toast list).
- [ ] `Hud`: bottom-center, non-interactive (`pointer-events: none`), `role="status"`, fades out after 2s, 4s for messages over 60 characters (`hudDuration(message)` pure + tested); no fade under reduced motion.
- [ ] AppShell renders `<Hud />` instead of `<Toasts />` on macOS.
- [ ] Tests (fake timers): "Saved." shows then clears after 2s; a long message stays 4s; a second HUD replaces the first; on web, `addToast` still appends to `toasts`.
- [ ] Commit "macOS: info and success show in a HUD".

### Task C3: Alerts for failed actions

**Files:** `state.types.ts` (`AppStoreDeps.alert(message: string, options: { retry: boolean }): Promise<boolean>` — true means Try Again), `state.deps.ts` (browser default: `window.alert`, returns false), `App.tsx` (Tauri: plugin-dialog `message(text, { title: "Blogosphere", kind: "warning", buttons: retry ? { ok: "Try Again", cancel: "OK" } : "Ok" })`; check what 2.7.1 returns for custom labels by reading the plugin source in `~/.cargo/registry` and map it to a boolean), store alert queue.

- [ ] Alert queue in the store closure: one alert at a time; a message identical to one queued or showing is dropped; Try Again runs `toast.retry`.
- [ ] Tests with a fake `alert` dep: an error toast on macOS calls `alert` with `retry: true` when `retry` exists; Try Again runs retry; two errors → second waits for the first; a duplicate is dropped.
- [ ] Commit "macOS: failed actions show a native alert with Try Again".

### Task C4: "Couldn't load your entries" as an empty state

**Files:** state (`entriesLoadFailed: boolean`, set by `refresh` on failure, cleared on success), `EntryList.tsx`, test.

- [ ] macOS: when `entriesLoadFailed` and there are no entries, the list shows "Couldn't load your entries." and a Try Again button (`refresh()`), in place of the section's empty copy.
- [ ] Tests: failure → empty state; Try Again succeeds → entries render.
- [ ] Commit "macOS: a failed first load shows in the list, not an alert".

### Task C5: Deploy line and deploy failure

**Files:** `state.deployActions.ts` (+test), state (`deploy: { sha: string; state: "deploying" | "live" | "failed"; at: number } | null`), `syncButtonState.ts` (+test), `SyncStatusButton.tsx`.

- [ ] Only the latest push is shown: `watchDeploy(sha)` sets `{ sha, deploying }` when it starts polling, and every later update applies only if `deploy.sha` is still that sha (an older watch never overwrites a newer one). `live` on success (plus the `source: "deploy"` toast), `failed` on failure. Any other exit (timeout, auth error that disables watching, a thrown error) clears it in a `finally` if it's still this sha's `deploying`.
- [ ] Popover line under the header: "Deploying…", "Live at 10:42" (`formatClockTime(at)`, reuse `format.ts` if it has one), "Deploy failed".
- [ ] `syncButtonState(status, connected, nowMs, deploy)`: `failed` → Error kind with tooltip "Deploy failed — the site still shows the previous version", ranked with error (below conflict/offline/syncing, above pending), but only while `deploy.at > (status.lastSyncAt ?? 0)`: the next successful sync (Sync Now, the Error state's remedy) clears it even when there's nothing to push.
- [ ] Tests for each transition (including auth-disable and an older sha finishing after a newer one started) and the button mapping (failed before vs after a later sync).
- [ ] Commit "macOS: deploy progress in the Activity popover".

### Part C close

- [ ] Real app: ⌘S → "Saved." HUD; force an action error (e.g. delete while offline if reachable; otherwise via the bridge calling `addToast`) → alert with Try Again; deploy line after a real sync that pushes (only if Jesse's content has a pending change — never create content just to test).
- [ ] /par; fix; ff-merge.

## Part D — Settings window

### Task D1: Settings sections become presentational; token errors inline

**Files:** Create `src/ui/app/SettingsSections.tsx`. Modify `App.tsx` (`buildTokenSavedHandler` → `buildConnectHandler`), `SettingsScreen.tsx`, `ConnectScreen.tsx`, `state.miscActions.ts`/`state.types.ts`/`state.ts` (remove `saveToken` and `busy.savingToken` if nothing else uses them), tests.

Today a token is written to the keychain first and deleted if validation fails, so replacing a good token with a bad one leaves no token at all, and the handler awaits the whole first bootstrap. One entry point replaces `saveToken` + `onTokenSaved`:

**Produces:** `connect(token): Promise<void>` (the prop keeps the name `onTokenSaved` to limit churn): build github+sync from the token → `github.getRef()` (reject → throw `TokenRejected`, keychain untouched) → `keychainSet` (reject → throw "Couldn't save the token.") → `setServices(next)` → start `runInitialSync(next)` **without awaiting it** (its progress and failures show through sync status, as they already do after the connect card unmounts). A second call while one is in flight rejects with "Already connecting." `ConnectionSection({ connected, repoLabel, saveToken(token): Promise<string | null> })` (null = success; a string is the inline error), `CommitTemplatesSection({ templates, saveTemplates(t): Promise<string | null> })`; `SettingsScreen` binds them to the store and `connect`.

- [ ] Tests (with `buildFakeServices` and an injectable github factory for the handler): a rejected token leaves the previous keychain value in place and services unchanged; a good token is written then installed; the handler resolves before the initial sync finishes; a concurrent second call is refused. Component tests: a bad token shows the error inline in the modal (today it showed nothing); ConnectScreen shows one inline error, no toast.
- [ ] Commit (split in two if large): "Connecting checks the token before it replaces the saved one" and "Settings: token errors show inline; sections reusable outside the modal".

### Task D2: Settings protocol and client

**Files:** Create `src/settings/protocol.ts`, `src/settings/client.ts`, `src/settings/client.test.ts`.

**Produces:**
- `protocol.ts`: `SETTINGS_EVENTS = { getState: "settings:get-state", saveToken: "settings:save-token", saveTemplates: "settings:save-templates", reply: "settings:reply", state: "settings:state" }`; `SettingsState { connected: boolean; repo: string; templates: CommitMessageTemplates }`; request payloads carry `id: string`; `SettingsReply { id; ok: boolean; error?: string; state?: SettingsState }`; `SettingsTransport { emitTo(label: string, event: string, payload: unknown): Promise<void>; listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> }`.
- `client.ts`: `createSettingsClient(transport, { timeoutMs = 10_000, createId })` → `{ getState(), saveToken(token), saveTemplates(t), onState(fn) }`; each request emits to `"main"` and resolves with the reply whose `id` matches; after `timeoutMs` it resolves `{ ok: false, error: "Blogosphere didn't answer. Try again." }` (spec §9). Saving a token now replies after one GitHub round trip (D1), so 10s holds; save-token uses 30s for slow networks.
- [ ] Tests with an in-memory transport: matching reply resolves; a reply for another id is ignored; timeout (fake timers) yields the error; `onState` receives broadcasts.
- [ ] Commit "Settings window protocol: request/reply with a timeout".

### Task D3: Main-window bridge

**Files:** Create `src/ui/app/settingsBridge.ts` + test.

**Produces:** `installSettingsBridge({ transport, store, onTokenSaved }): Promise<() => void>`:
- get-state → reply `{ ok: true, state }` where `state = { connected: services.sync !== null, repo: "owner/repo#branch", templates }`.
- save-token → `connect(token)` (D1); success → `{ ok: true }` (the new state follows as a `settings:state` broadcast once the store has the new services, so it's never stale); failure → `{ ok: false, error }` from the error D1 throws (`TokenRejected` → "GitHub didn't accept that token: <message>"; keychain → "Couldn't save the token."; in flight → "Already connecting."). No toast.
- save-templates → `setCommitTemplates`, reply ok; failure → error.
- Emits `settings:state` to `"settings"` whenever `services.sync` or `commitTemplates` change (store subscription).
- [ ] Tests with the in-memory transport and `buildFakeServices`: each request; a rejected token → error reply and no toast added; a services change broadcasts `connected: true`; a template change broadcasts state.
- [ ] Commit "Main window answers the Settings window".

### Task D4: `open_settings` in Rust

**Files:** Create `src-tauri/src/settings_window.rs`. Modify `lib.rs`, `permissions/native-ui.toml` (`allow-open-settings`, added to the `native-ui` set), create `src-tauri/capabilities/settings.json` (`windows: ["settings"]`, permissions `core:event:default`, `core:window:allow-close`, `core:window:allow-set-size`, `mcp-bridge:default`), `Cargo.toml` (`[dev-dependencies] tauri = { features = ["test"] }` if the mock runtime is used).

**Produces:** (the module and command are `#[cfg(desktop)]`: `center`, `minimizable`, and `maximizable` exist only on desktop builders, and `warnings = "deny"` would fail iOS/Android on anything unused; register the command in `generate_handler!` behind the same cfg) `#[tauri::command] open_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String>` → `open_or_focus_settings(&app)`: if a `settings` window exists, `show()` + `set_focus()`; else build `WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))` titled "Blogosphere Settings", 500×420, not resizable, not minimizable or maximizable, centered.

- [ ] Rust test with `tauri::test::mock_builder()`: first call creates exactly one `settings` window; second call leaves one. If the mock runtime can't build webview windows, test only the existence branch and record it.
- [ ] `cargo clippy --all-targets -- -D warnings` clean (pedantic); `cargo check --target aarch64-apple-ios` still passes (install the target only if it's already set up; otherwise say it wasn't checked).
- [ ] Commit "open_settings: create or focus the Settings window".

### Task D5: The Settings window's page

**Files:** Create `settings.html`, `src/settings/main.tsx`, `src/settings/SettingsWindow.tsx` + test, `src/settings/tauriTransport.ts`. Modify `vite.config.ts` (multi-page input: `index.html`, `settings.html`), `scripts/check-release-css.mjs` only if the split CSS breaks it.

- [ ] `main.tsx`: sets `data-platform="macos"` and `data-glass="off"` on `<html>` (the window only exists on macOS), imports `app.css`, renders `<SettingsWindow client={createSettingsClient(tauriTransport)} />`.
- [ ] `SettingsWindow`: loads state via `getState()` (spinner-free: render sections once state arrives; show the timeout error with a Try Again if it doesn't), uses `SettingsSections` bound to the client, subscribes `onState`. Sizes the window to its content: a `ResizeObserver` on the root calls `getCurrentWindow().setSize(new LogicalSize(500, height))`.
- [ ] Tests (fake client): renders connected state; saving a bad token shows the inline error; a broadcast updates the view.
- [ ] `npm run build` then `node scripts/check-release-css.mjs` pass; `dist/settings.html` exists.
- [ ] Commit "Settings window page".

### Task D6: Wire it up on macOS

**Files:** `src/shell/types.ts` + both fakes + `tauri.ts` (`openSettingsWindow(): Promise<void>` → `invoke("open_settings")`), `state.miscActions.ts` (`openSettings` on macOS calls it instead of setting `settingsOpen`), `AppShell.tsx` (install the bridge on macOS with `onTokenSaved`; don't render `SettingsScreen` on macOS), `quitFlush.ts` (+test: after the flush, destroy the `settings` window if present, ignoring a failure there, then the main window).

- [ ] Tests: `openSettings` on macOS calls the shell and leaves `settingsOpen` false; on web sets it; `handleCloseRequested` destroys settings then main, in that order, and still destroys main when there's no settings window or its destroy rejects.
- [ ] Commit "macOS: Settings opens in its own window".

### Part D close

- [ ] Real app: ⌘, opens one window titled "Blogosphere Settings"; ⌘, again focuses it; the window sizes to its content; changing a template in Settings reaches the main window (read via the bridge) and vice versa; closing main quits.
- [ ] Scenario cards (spec §10) in `docs/superpowers/e2e/phase3-surfaces.md`, each a short script of `scripts/tauri-mcp.sh` / computer-use steps with the expected result: keyboard-only new post → Publish sheet → Escape; context menus present on a row and a section; Settings singleton; a template change in Settings reaching the main window and back. Run them against `scripts/dev-app.sh` and record pass/fail in the execution record.
- [ ] /par; fix; ff-merge. Update the spec's deviations list (Settings capability adds `set-size` and `mcp-bridge:default`; row conflict symbol and View › editor modes ⌥⌘1–3 move to phase 4 with the row rebuild and the segmented control; toast `load` failures route to state, never an alert).
