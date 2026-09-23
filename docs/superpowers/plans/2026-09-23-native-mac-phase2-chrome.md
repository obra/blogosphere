# Native Mac Redesign — Phase 2 (Chrome) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On macOS, give the window native chrome: a glass sidebar, one toolbar row aligned with the traffic lights, a collapsible sidebar with resizable columns, and a sync status button that opens an Activity popover.

**Architecture:** Everything is gated on `shell.platform() === "macos"` (phase 1). Other platforms and the phone layout render exactly what they render today. Pure decisions (sync button state, column layout) are functions with unit tests; components are thin. Glass is `tauri-plugin-liquid-glass` behind a transparent window, with an opaque fallback whenever glass is off.

**Tech Stack:** as phase 1, plus `tauri-plugin-liquid-glass` 0.1.6.

**Spec:** `docs/superpowers/specs/2026-09-23-native-mac-redesign-design.md` §2, §3, §5 (Activity), §7 (sidebar/Increase Contrast/Reduce Transparency), §9, §11 phase 2.

## Global Constraints

- Mac-only changes are gated on `shell.platform() === "macos"` in components, or `html[data-platform="macos"]` in CSS. No change on iOS, Android, web, or the compact (phone) layout; `SidebarFooterWidgets` keeps working for `MobileShell`.
- No `light-dark()`; WKWebView needs `-webkit-` prefixed `user-select`; Biome zero errors/warnings/infos; tests must be seen failing first; never bypass the pre-commit hook.
- Small commits: one per task (split where a reviewer could reject one half).
- New UI state persists to store meta under `ui:` keys, fire-and-forget, like `state.lastPositionActions.ts`.
- Semantic icons only (`<Icon name>`); add names to `iconNames.ts` with their first use.
- The phase merges to `main` only after an adversarial code review; phase 3 starts from there.

## Review Focus

1. A push fails while changes are pending → the sync button must show the error (Error outranks Pending), with the message in its tooltip. (Task 2.)
2. The window is dragged narrow with a wide persisted list column → the editor keeps its 420px minimum; the sidebar auto-collapses; widening restores it unless the person hid it. (Task 6.)
3. Glass fails or Reduce Transparency is on → the sidebar is opaque; the window is never see-through with nothing behind it. (Task 7.)
4. No entry selected, or first run with no token → the toolbar row and the sync button still exist. (Task 5.)
5. The phone layout still shows its header widgets (sync pill, activity, settings) and New buttons. (Tasks 3, 4 keep existing MobileShell tests green.)

---

### Task 1: "Synced" reflects the last successful check

**Files:** `src/core/sync/pull.ts`, `src/core/sync/engine.pull.test.ts`, `src/core/sync/engine.staleHead.test.ts`

- [ ] Test (engine.pull.test.ts): after a pull where the remote tree is unchanged, `META_LAST_SYNC_AT` equals the fake clock's `now()` (advance the clock between bootstrap and the second pull, so the old value can't pass).
- [ ] Test (engine.staleHead.test.ts): a pull that returns `staleHead` also records `now()` — the app did reach GitHub.
- [ ] See both fail; in `runPull`, write `META_LAST_SYNC_AT` before each early return (`await deps.store.setMeta(META_LAST_SYNC_AT, String(deps.now()))`).
- [ ] Full suite green; commit "Sync: 'last checked' updates on pulls that find nothing new".

### Task 2: Sync button state (pure)

**Files:** create `src/ui/app/syncButtonState.ts`, `src/ui/app/syncButtonState.test.ts`; modify `src/ui/icons/iconNames.ts`

**Produces:** `syncButtonState(status: SyncStatus | null, connected: boolean, nowMs: number): { kind: "notConnected" | "syncing" | "synced" | "pending" | "conflict" | "offline" | "error"; icon: IconName; badge: number | null; tooltip: string }`

Precedence (spec §3): not connected → conflict → offline → syncing → **error → pending** → synced. Error's badge is the pending count when > 0. Tooltip strings exactly as the spec's table; when `status.message` exists and the state isn't `synced`, append `" — " + message`. Synced tooltip uses `relativeTimeLabel(status.lastSyncAt, nowMs)` from `format.ts`; with no `lastSyncAt`, just "Synced".

Icon names added: `syncNotConnected` (icloud.slash / CloudOff), `syncing` (arrow.triangle.2.circlepath / RefreshCw), `synced` (checkmark.icloud / CloudCheck), `syncPending` (arrow.up.circle / CircleArrowUp), `syncConflict` (exclamationmark.triangle / TriangleAlert), `syncOffline` (wifi.slash / WifiOff), `syncError` (exclamationmark.icloud / CloudAlert).

- [ ] Tests: one per state, plus "error with 3 pending → kind error, badge 3", "message appended to tooltip", "synced with no lastSyncAt". See them fail (module missing); implement; green; commit.

### Task 3: Sync status button and Activity popover (macOS)

**Files:** create `src/ui/app/SyncLogList.tsx` (the log list extracted from `SyncLogPanel.tsx`, no behavior change), `src/ui/app/SyncStatusButton.tsx`, `src/ui/app/ActivityPopover.tsx`, `src/ui/app/ActivityPopover.test.tsx`, CSS in a new `src/ui/app/app-macos-chrome.css` (imported from `app-macos.css`'s end is not allowed — CSS `@import` must be first; import it from `app.css` after `app-macos.css`); modify `SyncLogPanel.tsx` (uses `SyncLogList`), `AppShell.tsx` (render `SyncLogPanel` only off macOS).

- `SyncStatusButton`: borderless button, `<Icon name={state.icon}>`, badge span when `badge !== null`, `title`/`aria-label` = tooltip. Click toggles the store's `syncLogOpen` (reusing it keeps ⌥⌘L working unchanged).
- `ActivityPopover`: renders when `syncLogOpen` and platform is macOS, positioned under the button (absolutely, anchored by the button's bounding rect), with: headline (state's tooltip), the conflicted entries (each a button that selects the entry and closes the popover), **Sync Now** (`syncNow()`), **Connect…** when not connected (`openSettings()` — the Settings window is phase 3), and `<SyncLogList>`. Escape and a click outside close it (`closeSyncLog()`).
- [ ] Tests (jsdom, `buildFakeServices({ shellOptions: { platform: "macos" } })`): the button reflects state (error shown over pending); clicking opens the popover; Escape closes; clicking outside closes; Sync Now calls `sync.sync`; a conflict row selects the entry; not connected shows Connect…; on "web" the modal `SyncLogPanel` still opens instead.
- [ ] Two commits: "Extract SyncLogList" (refactor, existing SyncLogPanel tests green), then the button + popover.

### Task 4: Sidebar cleanup, icons, and hide/show (macOS)

**Files:** `Sidebar.tsx`, `Sidebar.test.tsx`, `state.types.ts`, a new `state.layoutActions.ts` (+ test), `state.ts` (wire actions + restore at init), `menu.ts` (View › Hide/Show Sidebar ⌃⌘S), `iconNames.ts`, CSS.

- On macOS the sidebar renders no brand, no New Post/New Link buttons, no footer; each section gets an icon (`drafts` pencil / PenLine, `posts` doc.text / FileText, `links` link / Link, `releases` shippingbox / Package) tinted with `--accent` (white in a focused selection).
- Store: `sidebarHidden: boolean` (default false), `toggleSidebar()`, persisted to meta `ui:sidebarHidden`, restored in `init()` alongside `restoreLastPosition`.
- Menu: View › "Hide Sidebar"/"Show Sidebar", accelerator `Ctrl+CmdOrCtrl+S`, calls `toggleSidebar()` (title follows state through the existing enabled-flags refresh, or a fixed "Toggle Sidebar" if the menu can't retitle — check `menu.ts` before choosing).
- [ ] Tests: mac sidebar lacks brand/new buttons/footer and shows 4 icons; web sidebar unchanged; `toggleSidebar` flips and persists; restore reads meta; menu model contains the item with the accelerator. Commit.

### Task 5: One toolbar row (macOS)

**Files:** `AppShell.tsx`, `EntryList.tsx` (list header), `EditorScreen.tsx` (+ empty-state header), `app-macos-chrome.css`, `tauri.macos.conf.json`, `capabilities/default.json`, `iconNames.ts` (`compose` square.and.pencil / SquarePen, `sidebarToggle` sidebar.left / PanelLeft).

- Measure first: screenshot Notes (computer-use, Notes granted) and record its toolbar row height and traffic-light center in points; use those numbers (named CSS variables `--toolbar-height`, and `trafficLightPosition` in `tauri.macos.conf.json`). Record the measurements in the commit message.
- List header (mac): search field + compose button (`newDraft({ title: "" })`, title "New Post (⌘N)"). Sidebar top (mac): the traffic lights' space + the sidebar toggle. When the sidebar is hidden, the list header gets a leading inset for the lights and shows the toggle.
- Editor header (mac) is **window-level**: `DetailPane` renders it in every state — entry selected (today's `EditorToolbar` items), nothing selected, and first-run connect screen — with `SyncStatusButton` at its trailing edge.
- The whole row is `data-tauri-drag-region` except controls; grant `core:window:allow-start-dragging` (today's drag strip needs it too — it has silently never worked). Remove the old fixed 30px `.titlebar-drag` strip on macOS.
- [ ] Tests: on mac, the sync button renders with nothing selected and on the connect screen; the list header has compose + search; the sidebar toggle appears in the list header only when hidden; web renders today's structure. Real-app check: row height matches Notes' within 1pt, lights centered, dragging the row moves the window. Commit.

### Task 6: Resizable columns and sidebar auto-collapse (macOS)

**Files:** create `src/ui/app/columnLayout.ts` (+ test), `src/ui/app/ColumnDivider.tsx` (+ test), modify `AppShell.tsx`, `state.layoutActions.ts` (persist widths `ui:sidebarWidth`, `ui:listWidth`), `tauri.macos.conf.json` (`minWidth` 660), CSS.

**Produces:** `layoutColumns(input: { windowWidth: number; sidebarWidth: number; listWidth: number; sidebarHidden: boolean }): { sidebarVisible: boolean; sidebarWidth: number; listWidth: number }` with `MIN = { sidebar: 160, list: 240, editor: 420 }`:
1. Clamp stored widths to their minimums.
2. If `sidebarHidden`: sidebar not visible; list = min(listWidth, windowWidth − editorMin) floored at list min.
3. Else if `sidebar + list + editorMin ≤ windowWidth`: all as stored.
4. Else shrink the list toward its min; if still too wide, auto-collapse the sidebar (not visible) and re-apply step 2's list rule.
Auto-collapse never writes `sidebarHidden`, so widening restores the sidebar; a manual hide stays.

- [ ] Tests for each rule, including: wide persisted list at a narrow window keeps editor ≥ 420; manual hide survives widening; auto-collapse reverses on widening; clamping below minimums.
- `ColumnDivider`: 6px hit area, `cursor: col-resize`, pointer drag updates the width live (clamped), persists on pointer up; double-click does nothing. Tests with pointer events in jsdom.
- AppShell (mac): grid columns from `layoutColumns` + `window.innerWidth` (resize listener).
- [ ] Commit "columns" then "window min size" if split cleanly.

### Task 7: Glass sidebar with fallbacks (macOS)

**Files:** `src-tauri/Cargo.toml` (`tauri-plugin-liquid-glass = "0.1.6"`; tauri feature `macos-private-api`), `tauri.conf.json` (`app.macOSPrivateApi: true` — base config, because the Cargo feature applies to every target and tauri-build checks feature/config agreement; it only has an effect on macOS), `tauri.macos.conf.json` (`transparent: true`), `capabilities/default.json` (`liquid-glass:default` only if the frontend calls the plugin — it won't; Rust applies it), new `src-tauri/src/glass.rs` (+ unit test of the pure decision), `lib.rs`, `permissions/native-ui.toml` (`glass_active`), `src/bootstrap/platform.ts` (probe glass too), `main.tsx`, `app-macos-chrome.css`, `cssContract.test.ts`.

- Rust setup (macOS): if `NSWorkspace.accessibilityDisplayShouldReduceTransparency` is true, skip glass; else apply the default-variant glass effect (never a private variant). Store the outcome in managed state; `glass_active` command returns it. Any error → false (logged).
- Boot: probe `glass_active` with the platform (never rejects; defaults false) and set `data-glass="on"|"off"` on `<html>` before render.
- CSS: only with `data-glass="on"` are `html`, `body`, `.app-shell`, and `.sidebar` transparent; list and editor panes always opaque `--bg`. With `data-glass="off"` or `prefers-contrast: more`, the sidebar is opaque `--bg-sunken` and the root opaque. Contract tests pin: transparency rules exist only under `[data-glass="on"]`; `prefers-contrast: more` restores opacity.
- Known limit (documented in the commit): Reduce Transparency is read at launch; toggling it later takes effect on relaunch.
- [ ] Real-app check: glass visible in light and dark; setting `data-glass="off"` by hand paints opaque. Commit.

### Task 8: Phase verification, review, merge

- [ ] Full suite, typecheck, lint, cargo fmt/clippy/test, `npm run build` (CSS guard).
- [ ] Real app (Blogosphere Dev via bridge): screenshots light (and dark if Jesse can switch); narrow-window collapse; popover open/close; row drag.
- [ ] apple-design quick pass on the new chrome; fix Critical/High.
- [ ] Adversarial code review (par) of `main...HEAD`; fix verified findings in small commits.
- [ ] Fast-forward `main`.
