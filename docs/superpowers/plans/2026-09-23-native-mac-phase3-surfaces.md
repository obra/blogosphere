# Native Mac Redesign — Phase 3 (Surfaces) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On macOS, move the app's secondary surfaces to their native homes: a real menu bar (Entry, Format, Find, Help) and context menus; sheets that never interrupt; toasts routed to the HUD, alerts, and state; Settings in its own window.

**Architecture:** Four parts, each shippable alone and merged to `main` (fast-forward) before the next starts: A menus, B sheets, C toast routing, D Settings window. Decisions are pure functions with unit tests (menu models, toast routing, the settings protocol); components and Tauri wiring stay thin. Everything Mac-only is gated on `shell.platform() === "macos"` or `html[data-platform="macos"]`.

**Tech Stack:** as phases 1–2. `@tauri-apps/plugin-dialog` 2.7.1 (`message` with custom `buttons`, `open`), `@tauri-apps/plugin-fs` `readFile`, Tauri `WebviewWindowBuilder`, `emitTo`/`listen`.

**Spec:** `docs/superpowers/specs/2026-09-23-native-mac-redesign-design.md` §4 (context menus), §5 (surfaces), §6 (menu bar), §8, §9, §10, §11 phase 3.

## Global Constraints

- Mac-only behavior is gated on `shell.platform() === "macos"` (components, store actions) or `html[data-platform="macos"]` (CSS). iOS, Android, web, and the phone layout keep today's modal Settings, toasts, and auto-opening conflict dialog. Exceptions, both harmless everywhere: Escape cancels every sheet, and only one sheet opens at a time.
- No `light-dark()`; `-webkit-user-select`; Biome zero errors/warnings/infos; every test seen failing first; never bypass the pre-commit hook; no `--no-verify`.
- Small commits, one per task at most. Each part ends with: real-app check through `scripts/dev-app.sh` + `scripts/tauri-mcp.sh`, a /par code review of the part's diff, fixes, then `git merge --ff-only` into `main` from `/Users/jesse/git/blogosphere`. No push.
- Semantic icons only (`<Icon name>`); new names go into `iconNames.ts` with their first use.
- Menu item titles use title case and "…" when the command asks for more input before acting (HIG `menus.md`).
- The Settings window owns no state: no SQLite, keychain, GitHub, or sync. The main window is the only writer.

## Review Focus

1. **⌘B in the editor toggles bold exactly once** once the Format menu carries ⌘B (the menu and the editor's own keymap must not both fire). Task A5 spikes this first and picks the design from the result.
2. **A right-click on an unselected row** acts on *that* row (Delete… deletes the right entry, Publish… publishes it), not on the selection. Task A7 tests `runMenuCommand` with an explicit path.
3. **Two errors at once on Mac** (e.g. a failed save while a failed delete alert is up) → alerts queue one at a time, identical messages collapse; nothing is lost and nothing stacks. Task C3.
4. **Settings save-token with a bad token** → the Settings window shows the error inline, the keychain doesn't keep the bad token, and no second error appears in the main window. Task D3.
5. **Closing the main window while Settings is open** → the app still quits (Settings closes after the flush). Task D6.

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
- `entryRowItems(record, liveUrl)` — Open on Site, Copy Secret Link, —, Publish… (drafts only), Delete… (spec §4).
- `sectionMenuItems(section: Section): MenuItemModel[]` — drafts/posts: New Post; links: New Link…; releases: `[]`.
- `runMenuCommand("publish", store, path)` selects `path` if it isn't selected, then `openPublishDialog()`.

- [ ] Tests: each builder's ids, titles, enabled flags (null record; draft vs published; `opaqueId`; dirty with/without `baseContent`; live URL present/absent); every command id in `entryRowItems`, `entryActionItems`, and `composeMenuItems` also appears in `entryMenuItems` or the File menu model (spec §10 "every toolbar, ellipsis, and context-menu command has a menu-bar twin" — assert against the ids the File menu builds in A4, exported as `FILE_MENU_COMMANDS`).
- [ ] Test: `publish` on an unselected path selects it and opens the dialog.
- [ ] Implement. Commit "Menu models: Entry menu, row and section context menus".

### Task A3: One builder for native menus from models

**Files:** Create `src/ui/app/nativeMenu.ts`. Modify `src/ui/app/menuPopup.ts`.

**Produces:** `buildNativeItems(models, run): Promise<{ items: Array<MenuItem | PredefinedMenuItem>; byId: Map<MenuCommandId, MenuItem> }>` (passes `accelerator` through), `applyEnabled(byId, models): void` (fire-and-forget `setEnabled`, errors swallowed). `popupMenu(key, models, run, anchor | { x: number; y: number }): Promise<void>` — a point pops the menu at that position (context menus); an element keeps today's under-the-button placement. Resolves when `popup()` returns.

- [ ] This is Tauri wiring with no logic beyond the models; no unit test (the models are tested). Typecheck + existing tests green.
- [ ] Commit "Native menus: one builder shared by popups and the menu bar".

### Task A4: Entry menu in the menu bar

**Files:** `src/ui/app/menu.ts`, `src/ui/app/menu.test.ts`.

- [ ] File keeps New Draft, New Link…, —, Save & Sync, Sync Now. Export `FILE_MENU_COMMANDS` (ids of the model-driven File items, used by A2's twin test) — New Draft and New Link… map to `newPost`/`newLink`.
- [ ] New **Entry** submenu between File and Edit, built with `buildNativeItems(entryMenuItems(...), id => runMenuCommand(id, store))`.
- [ ] Replace `menuEnabledState`/`applyEnabledFlags` with: on store change, when the selected record object (or `services`) changed, recompute `entryMenuItems(record, entryLiveUrl(model, record))` and `applyEnabled`. Keep the diff so typing (which replaces the record) doesn't flood IPC: compare the enabled flags, not the objects, before calling `applyEnabled`.
- [ ] `menu.test.ts`: replace the `menuEnabledState` tests with an exported pure `entryMenuState(state)` returning `{ record, liveUrl }` for the selection (the flags themselves are tested in A2).
- [ ] Commit "Menu bar: an Entry menu with Publish…, Open on Site and the rest".

### Task A5: Format menu

**Files:** Create `src/ui/editor/activeEditor.ts` + test. Modify `src/ui/editor/Editor.tsx`, `src/ui/editor/Toolbar.tsx` (image picking shared), `src/ui/app/menuModel.ts`, `src/ui/app/menu.ts`, `src/shell/types.ts`, `src/shell/tauri.ts`, `src/shell/fake.ts`, `src/ui/app/testing/fakeShell.ts`, `src-tauri/capabilities/default.json` if `fs:allow-read-file` is needed for picked paths.

**Produces:**
- `activeEditor.ts`: `interface FormatTarget { handle(): EditorHandle | null; onImage: OnImage }`; `setActiveEditor(target): () => void` (returns an unregister that only clears if still current), `getActiveEditor(): FormatTarget | null`, `subscribeActiveEditor(fn): () => void`.
- `Editor.tsx` registers itself in an effect when it is formattable: not `sourceLanguage === "html"` and not read-only. Write (Crepe) and Markdown (source) both register; HTML, Live, and Preview never mount a formattable editor, so the menu disables itself there.
- `ShellApi.pickImage(): Promise<{ bytes: Uint8Array; ext: string } | null>` — Tauri: `open({ multiple: false, filters: [{ name: "Images", extensions: ["png","jpg","jpeg","gif","webp","svg"] }] })`, then `readFile(path)`; ext from the path. Fakes return a configurable value (default null).
- `MenuCommandId` gains `bold | italic | code | heading | link | image`; `formatMenuItems(enabled: boolean)`: Bold ⌘B, Italic ⌘I, Code ⌘E, Heading, —, Link…, Image…. No ⌘K on Link (Quick Open owns it). `runMenuCommand` dispatches to `getActiveEditor()?.handle()`; `image` awaits `shell.pickImage()`, then `onImage(bytes, ext)`, then `handle.insertImage(ref)`.

- [ ] **Spike first (Review Focus 1):** in the dev app, add the Format menu with ⌘B and press ⌘B in the Write editor and in the Markdown editor (computer-use `app_key`), checking the body text via the bridge. WebKit gives the page the first chance at a key equivalent, so the expected result is one toggle (the editor's keymap handles it and calls preventDefault; the menu never fires). If it toggles twice, drop Mod-b/Mod-i/Mod-e from both editors' keymaps on macOS so the menu owns them, and note it in the execution record.
- [ ] Tests: `activeEditor` register/unregister/stale-unregister/subscribe; `Editor` registers in Write and Markdown, not for HTML or read-only (render with the existing Editor test helpers); `formatMenuItems` flags; `runMenuCommand("bold")` calls the active handle's `toggleBold`; `image` with a fake picked file calls `onImage` then `insertImage(ref)`; picker cancelled → nothing.
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
- [ ] Sidebar section buttons: `sectionMenuItems(section)`; skip the menu when it's empty.
- [ ] Tests (jsdom, fake shell `platform: "macos"`): right-click calls the popup seam with the row's items and a runner bound to that row's path; non-Mac right-click does nothing custom. Inject the popup function through a module seam the tests can replace (e.g. a `popupMenu` prop default or `vi.mock("./menuPopup")` — the menu itself is Tauri wiring; the test checks the items and the bound path, not native behavior).
- [ ] Commit "Context menus on entry rows and sidebar sections".

### Part A close

- [ ] Real app: Entry and Format menus enable/disable with selection and mode (read through computer-use `app_menu` or AX); ⌘B single toggle; ⌥⌘F focuses search; right-click a row shows the menu (screenshot while frontmost; if Jesse is typing, record it for his manual check).
- [ ] /par on `git diff main...HEAD`; fix; ff-merge to main.

## Part B — Sheets

### Task B1: One sheet at a time; conflict sheet state

**Files:** `src/ui/app/state.miscActions.ts`, `src/ui/app/state.types.ts`, `src/ui/app/state.ts`, test `src/ui/app/state.sheets.test.ts`.

**Produces:** `anySheetOpen(state): boolean` (Publish, New Link, Versions, Conflict). `openPublishDialog`, `openNewLinkDialog`, `openVersions`, `openConflict(path)` do nothing while another sheet is open. New state `conflictSheetPath: string | null`, actions `openConflict(path)`, `closeConflict()`; resolving a conflict clears it.

- [ ] Tests: each opener is refused while each other sheet is open; `openConflict` sets the path; `resolveConflict` for that path clears it.
- [ ] Commit "Sheets: only one at a time; conflict sheet state".

### Task B2: Escape cancels every sheet

**Files:** Create `src/ui/app/useEscapeToCancel.ts`. Modify `PublishDialog.tsx`, `NewLinkDialog.tsx`, `ConflictDialog.tsx`, `VersionsPanel.tsx`; tests in their test files.

- [ ] `useEscapeToCancel(onCancel)`: a document `keydown` listener (capture) while mounted; Escape → `preventDefault()`, `onCancel()`. Replaces VersionsPanel's element-level handler (which only worked with focus inside).
- [ ] Tests: Escape with focus on `document.body` closes each sheet. Return already submits Publish and New Link (form submit); Conflict and Versions have no default button (the safe choice there is "Not now"/close, which Escape covers).
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

- [ ] Under `html[data-platform="macos"]`: backdrop dims only below the 52pt toolbar row (top: 52px) with `rgba(0,0,0,0.18)`; the sheet sits at the top center, `--bg-raised`, radius 10px, the popover shadow token, no border, and slides down 8px (no motion under `prefers-reduced-motion`). Sheet headings use the macOS title style (13px semibold).
- [ ] Real-app screenshot of Publish and New Link in light and dark.
- [ ] Commit "macOS sheets: dim the window, drop from the toolbar".

### Part B close

- [ ] Real app: Publish via ⇧⌘P then Escape; New Link then Return; ⌘N while Publish is open does nothing to the sheet; a conflict (fake one by editing the same entry on GitHub if practical, otherwise the component tests stand) waits for Resolve….
- [ ] /par; fix; ff-merge.

## Part C — Toast routing

### Task C1: Toast sources and the routing rule

**Files:** `src/ui/app/state.types.ts` (`Toast.source?: "sync" | "load" | "deploy"`), `state.entryActions.ts` (sync at `saveNow`, load at `refresh`), `state.deployActions.ts`, create `src/ui/app/toastRoute.ts` + test.

**Produces:** `routeToast(toast, context: { entriesEmpty: boolean; windowFocused: boolean }): "hud" | "alert" | "none"` (macOS only):
- `source: "sync"` → `none` (the sync button already shows Error; popover Sync Now retries)
- `source: "load"` → `none` when `entriesEmpty` (the list's empty state shows it), else `alert`
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

**Files:** `state.deployActions.ts` (+test), state (`deploy: { state: "deploying" | "live" | "failed"; at: number } | null`), `syncButtonState.ts` (+test), `SyncStatusButton.tsx`.

- [ ] `watchDeploy` sets `deploying` when it starts polling, `live` on success (and the `source: "deploy"` toast), `failed` on failure, `null` on timeout.
- [ ] Popover line under the header: "Deploying…", "Live at 10:42" (`formatClockTime(at)`, reuse `format.ts` if it has one), "Deploy failed".
- [ ] `syncButtonState(status, connected, nowMs, deploy)`: `failed` → Error kind with tooltip "Deploy failed — the site still shows the previous version", ranked with error (below conflict/offline/syncing, above pending). A new `deploying` clears it.
- [ ] Tests for each transition and the button mapping.
- [ ] Commit "macOS: deploy progress in the Activity popover".

### Part C close

- [ ] Real app: ⌘S → "Saved." HUD; force an action error (e.g. delete while offline if reachable; otherwise via the bridge calling `addToast`) → alert with Try Again; deploy line after a real sync that pushes (only if Jesse's content has a pending change — never create content just to test).
- [ ] /par; fix; ff-merge.

## Part D — Settings window

### Task D1: Settings sections become presentational; token errors inline

**Files:** Create `src/ui/app/SettingsSections.tsx`. Modify `SettingsScreen.tsx`, `state.miscActions.ts` (`saveToken` stops adding a toast; it still rethrows), `ConnectScreen.tsx` (unchanged behavior: it already shows inline errors), tests.

**Produces:** `ConnectionSection({ connected, repoLabel, saveToken(token): Promise<string | null> })` (null = success; a string is the inline error), `CommitTemplatesSection({ templates, saveTemplates(t): Promise<string | null> })`. `SettingsScreen` binds them to the store and `onTokenSaved`.

- [ ] Tests: a bad token (onTokenSaved rejects) shows the error inline in the modal (today it showed nothing); a keychain failure shows "Couldn't save the token." inline; ConnectScreen no longer gets a duplicate toast.
- [ ] Commit "Settings: token errors show inline; sections reusable outside the modal".

### Task D2: Settings protocol and client

**Files:** Create `src/settings/protocol.ts`, `src/settings/client.ts`, `src/settings/client.test.ts`.

**Produces:**
- `protocol.ts`: `SETTINGS_EVENTS = { getState: "settings:get-state", saveToken: "settings:save-token", saveTemplates: "settings:save-templates", reply: "settings:reply", state: "settings:state" }`; `SettingsState { connected: boolean; repo: string; templates: CommitMessageTemplates }`; request payloads carry `id: string`; `SettingsReply { id; ok: boolean; error?: string; state?: SettingsState }`; `SettingsTransport { emitTo(label: string, event: string, payload: unknown): Promise<void>; listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> }`.
- `client.ts`: `createSettingsClient(transport, { timeoutMs = 10_000, createId })` → `{ getState(), saveToken(token), saveTemplates(t), onState(fn) }`; each request emits to `"main"` and resolves with the reply whose `id` matches; after `timeoutMs` it resolves `{ ok: false, error: "Blogosphere didn't answer. Try again." }` (spec §9).
- [ ] Tests with an in-memory transport: matching reply resolves; a reply for another id is ignored; timeout (fake timers) yields the error; `onState` receives broadcasts.
- [ ] Commit "Settings window protocol: request/reply with a timeout".

### Task D3: Main-window bridge

**Files:** Create `src/ui/app/settingsBridge.ts` + test.

**Produces:** `installSettingsBridge({ transport, store, onTokenSaved }): Promise<() => void>`:
- get-state → reply `{ ok: true, state }` where `state = { connected: services.sync !== null, repo: "owner/repo#branch", templates }`.
- save-token → `store.saveToken(token)` then `onTokenSaved(token)`; success → reply with fresh state; failure → `{ ok: false, error }` (keychain: "Couldn't save the token."; validation: "Couldn't connect with that token: <message>"). No toast.
- save-templates → `setCommitTemplates`, reply ok; failure → error.
- Emits `settings:state` to `"settings"` whenever `services.sync` or `commitTemplates` change (store subscription).
- [ ] Tests with the in-memory transport and `buildFakeServices`: each request; bad token (`onTokenSaved` rejects) → error reply and no toast added (deleting the bad token stays `onTokenSaved`'s job, already covered); a template change broadcasts state.
- [ ] Commit "Main window answers the Settings window".

### Task D4: `open_settings` in Rust

**Files:** Create `src-tauri/src/settings_window.rs`. Modify `lib.rs`, `permissions/native-ui.toml` (`allow-open-settings`, added to the `native-ui` set), create `src-tauri/capabilities/settings.json` (`windows: ["settings"]`, permissions `core:event:default`, `core:window:allow-close`, `core:window:allow-set-size`, `mcp-bridge:default`), `Cargo.toml` (`[dev-dependencies] tauri = { features = ["test"] }` if the mock runtime is used).

**Produces:** `#[tauri::command] open_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String>` → `open_or_focus_settings(&app)`: if a `settings` window exists, `show()` + `set_focus()`; else build `WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))` titled "Blogosphere Settings", 500×420, not resizable, not minimizable or maximizable, centered.

- [ ] Rust test with `tauri::test::mock_builder()`: first call creates exactly one `settings` window; second call leaves one. If the mock runtime can't build webview windows, test only the existence branch and record it.
- [ ] `cargo clippy --all-targets -- -D warnings` clean (pedantic); iOS/Android builds unaffected (the command compiles everywhere; only macOS calls it).
- [ ] Commit "open_settings: create or focus the Settings window".

### Task D5: The Settings window's page

**Files:** Create `settings.html`, `src/settings/main.tsx`, `src/settings/SettingsWindow.tsx` + test, `src/settings/tauriTransport.ts`. Modify `vite.config.ts` (multi-page input: `index.html`, `settings.html`), `scripts/check-release-css.mjs` only if the split CSS breaks it.

- [ ] `main.tsx`: sets `data-platform="macos"` and `data-glass="off"` on `<html>` (the window only exists on macOS), imports `app.css`, renders `<SettingsWindow client={createSettingsClient(tauriTransport)} />`.
- [ ] `SettingsWindow`: loads state via `getState()` (spinner-free: render sections once state arrives; show the timeout error with a Try Again if it doesn't), uses `SettingsSections` bound to the client, subscribes `onState`. Sizes the window to its content: a `ResizeObserver` on the root calls `getCurrentWindow().setSize(new LogicalSize(500, height))`.
- [ ] Tests (fake client): renders connected state; saving a bad token shows the inline error; a broadcast updates the view.
- [ ] `npm run build` then `node scripts/check-release-css.mjs` pass; `dist/settings.html` exists.
- [ ] Commit "Settings window page".

### Task D6: Wire it up on macOS

**Files:** `src/shell/types.ts` + both fakes + `tauri.ts` (`openSettingsWindow(): Promise<void>` → `invoke("open_settings")`), `state.miscActions.ts` (`openSettings` on macOS calls it instead of setting `settingsOpen`), `AppShell.tsx` (install the bridge on macOS with `onTokenSaved`; don't render `SettingsScreen` on macOS), `quitFlush.ts` (+test: after the flush, destroy the `settings` window if present, then the main window).

- [ ] Tests: `openSettings` on macOS calls the shell and leaves `settingsOpen` false; on web sets it; `handleCloseRequested` destroys settings then main, in that order, and still destroys main when there's no settings window.
- [ ] Commit "macOS: Settings opens in its own window".

### Part D close

- [ ] Real app: ⌘, opens one window titled "Blogosphere Settings"; ⌘, again focuses it; the window sizes to its content; changing a template in Settings reaches the main window (read via the bridge) and vice versa; closing main quits.
- [ ] /par; fix; ff-merge. Update the spec's deviations list (Settings capability adds `set-size` and `mcp-bridge:default`; row conflict symbol moved to phase 4).
