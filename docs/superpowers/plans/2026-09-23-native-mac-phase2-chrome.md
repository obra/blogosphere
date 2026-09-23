# Native Mac Redesign — Phase 2 (Chrome) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On macOS, give the window native chrome: a glass sidebar, one toolbar row aligned with the traffic lights, a collapsible sidebar with resizable columns, and a sync status button that opens an Activity popover.

**Architecture:** Everything is gated on `shell.platform() === "macos"` (phase 1). Other platforms and the phone layout render exactly what they render today. Pure decisions (sync button state, column layout) are functions with unit tests; components are thin. Glass is `tauri-plugin-liquid-glass` behind a transparent window, with an opaque fallback whenever glass is off.

**Tech Stack:** as phase 1, plus `tauri-plugin-liquid-glass` 0.1.6.

**Spec:** `docs/superpowers/specs/2026-09-23-native-mac-redesign-design.md` §2, §3, §5 (Activity), §7 (sidebar/Increase Contrast/Reduce Transparency), §9, §11 phase 2.

## Execution record (2026-09-23)

Executed in commits `598be02`..`1a25c71` (small commits; see `git log`).
Beyond the revision below, execution found and fixed: a zustand selector
returning a fresh `[]` (infinite re-render); the popover clipped by the
sidebar's scroller (now `position: fixed` via `popoverPlacement`); Tauri's
`trafficLightPosition.y` isn't the button's top edge (set to 28 by
measuring the real window); ⌃⌘S needed the layout change in the same
commit to be shippable. The phase code review (7 + 5 findings) led to:
the Activity popover rendered into `<body>` (it sat inside the drag
region) with document-level Escape and focus handling; `glass_wanted`
gated to macOS/tests (dead code broke iOS/Android under `warnings =
"deny"`); popup menus built once and opened under their button; menus'
Copy Secret Link announces the copied URL; a cancelled divider drag
restores the width. **Unverified by automation (needs Jesse's eyes):**
the frosted glass look, dragging the window by the toolbar row (the ACL
grant is proven), and the "…"/compose menus appearing (can't be shown
while the app is in the background).

## Global Constraints

- Mac-only changes are gated on `shell.platform() === "macos"` in components, or `html[data-platform="macos"]` in CSS. No change on iOS, Android, web, or the compact (phone) layout; `SidebarFooterWidgets` keeps working for `MobileShell`.
- No `light-dark()`; WKWebView needs `-webkit-` prefixed `user-select`; Biome zero errors/warnings/infos; tests must be seen failing first; never bypass the pre-commit hook.
- Small commits: one per task (split where a reviewer could reject one half).
- New UI state persists to store meta under `ui:` keys, fire-and-forget, like `state.lastPositionActions.ts`.
- Semantic icons only (`<Icon name>`); add names to `iconNames.ts` with their first use.
- The phase merges to `main` only after an adversarial code review; phase 3 starts from there.

## Review Focus

1. A push fails while changes are pending → the sync button must show the error (Error outranks Pending), with the message in its tooltip. (Task 2.)
2. The window is dragged narrow with a wide persisted list column → the editor keeps its 420px minimum by shrinking the list, then the sidebar; the window can't go below 820. (Task 6.)
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

## Revision after plan review (2026-09-23)

Two adversarial reviews (14 + 15 findings, verified) changed Tasks 3–7:

- **No sidebar auto-collapse.** It hid the toggle, left the traffic lights
  over the search field, made "Show Sidebar" a no-op in narrow windows, and
  collapsed the sidebar mid-drag. Instead the macOS window's minimum width is
  820 (160 sidebar + 240 list + 420 editor); dividers clamp so the editor
  keeps 420; hiding the sidebar is manual only. Recorded as a spec deviation.
- **The toolbar row can't hold today's ten editor items** at 420px, so the
  secondary actions (Open on Site, Versions…, Copy Secret Link, Discard
  Changes…, Delete…) move into a native "…" menu now, not in phase 3.
- **Measured geometry** (offscreen AppKit window, native unified toolbar,
  macOS 26.5): traffic lights at x 19pt, vertical center 26pt → toolbar row
  52pt with the lights centered.
- Drag region: `data-tauri-drag-region="deep"` (a bare attribute only drags
  when that exact element is clicked). The old 30px padding bands go.
- Popover: dismissal listens for `pointerdown` (capture) and ignores its own
  button; a real `toggleSyncLog()` action.
- Layout prefs (`ui:sidebarHidden`, `ui:sidebarWidth`, `ui:listWidth`) are
  read before first render (boot), not after `refresh()`.
- Menus: new items come from pure descriptor functions (tested); `menu.ts`
  only maps descriptors to Tauri objects.
- Spec items the first plan missed: compose menu with New Link; syncing
  symbol rotates (static under Reduce Motion); conflict orange, error red;
  Reduce Transparency reacts to its change notification; an opaque window
  background whenever glass is off.
- The glass plugin always calls a private `set_variant:` selector, even for
  the default variant — the spec's claim is corrected.
- Order: the sync button is placed before the sidebar footer is removed, so
  macOS never loses sync status mid-phase.

### Task 3: Sync status button + Activity popover (macOS)

- `SyncStatusButton` (borderless, `<Icon>`, badge, tooltip; syncing icon
  rotates unless `prefers-reduced-motion`; conflict orange, error red) and
  `ActivityPopover` (headline, conflicts → select entry, Sync Now,
  Connect… when not connected, `SyncLogList`), `toggleSyncLog()` action, a
  shared `useNowMs` tick hook (moved out of `Sidebar.tsx`).
- Mounted on macOS in the sidebar footer, replacing the pill and the
  activity button (the gear stays until Task 5b). `SyncLogPanel` renders off
  macOS only. New CSS in `app-macos-chrome.css`, imported after
  `app-macos.css`; the CSS contract tests learn about it.
- Tests: states render; click toggles; a second click closes; Escape and
  pointerdown outside close; Sync Now; conflict row selects; Connect… when
  not connected; web still uses the modal.

### Task 4: Menu descriptors — sidebar toggle, compose, entry actions

- Pure `viewSidebarItem(hidden)`, `composeMenuItems()`, and
  `entryActionItems(record, liveUrl)` returning `{ id, text, accelerator?,
  enabled }` lists; `menu.ts` adds View › Hide/Show Sidebar (⌃⌘S) from the
  first. Enable rules: Copy Secret Link needs an opaque id or a draft; Open
  on Site needs a live URL; Discard needs local changes with a base.
- Store: `sidebarHidden`, `toggleSidebar()` persisted to `ui:sidebarHidden`.
- Tests: descriptors (every rule); toggle flips and persists.

### Task 5a: One toolbar row (macOS)

- `ToolbarRow` (52pt, `data-tauri-drag-region="deep"`) used by the list
  header (search + compose with its New Post/New Link menu) and by every
  detail state: entry (mode control, document status text, spacer, sync
  button, Publish for drafts only, "…" menu), nothing selected, connect
  screen, and the parse-error screen — each with the sync button.
- `trafficLightPosition` {x: 19, y: 19} (close button top-left for a 26pt
  center) in `tauri.macos.conf.json`; `core:window:allow-start-dragging`;
  macOS drops the `.titlebar-drag` strip and the 30/40px pane padding.
- The sidebar's top 52pt holds the lights and the sidebar toggle; when the
  sidebar is hidden the list header gets a leading inset (lights + toggle).
- Tests: every detail state has the sync button; compose and "…" menus pop
  their descriptors; Publish only for drafts; web unchanged. Real app: row
  height 52, lights centered, row drags the window.

### Task 5b: Sidebar cleanup and icons (macOS)

- Remove brand, New buttons, footer on macOS; section icons (drafts
  `pencil`/PenLine, posts `doc.text`/FileText, links `link`/Link, releases
  `shippingbox`/Package) tinted accent, white in a focused selection.
- Tests: mac sidebar has none of the removed parts and four icons; web and
  the phone layout unchanged.

### Task 6: Resizable columns (macOS)

- Pure `layoutColumns({ windowWidth, sidebarWidth, listWidth,
  sidebarHidden })` → `{ sidebarWidth, listWidth }`: clamp each to its
  minimum; the editor keeps ≥ 420 by shrinking the list, then the sidebar,
  toward their minimums (never collapsing). Divider drags clamp to the
  maximum that keeps the editor at 420. `setPointerCapture` is
  feature-checked (jsdom lacks it).
- Widths persist on pointer up; read before first render with the hidden
  flag. macOS `minWidth` 820, default size 1100×720.
- Tests: every rule; drag clamps at both ends; persisted.

### Task 7: Glass sidebar with fallbacks (macOS)

- Plugin + `macos-private-api` feature + `app.macOSPrivateApi` (base config)
  + `transparent: true` (mac config). Rust `glass.rs`: apply the default
  glass unless Reduce Transparency; otherwise set an opaque window
  background. Observe the accessibility display-options change notification
  and re-apply (glass on/off + background) and emit `glass-changed`.
  `glass_active` command (permission in `native-ui`). objc2-app-kit gains
  `NSWorkspace`/`NSAccessibility` features.
- Boot sets `data-glass` before render; the frontend listens for
  `glass-changed`. CSS: transparency only under `[data-glass="on"]`;
  `prefers-contrast: more` → opaque.
- Tests: CSS contract (transparency scoped to glass-on; contrast opaque);
  Rust unit test of the pure decision. Real app: glass on; `data-glass=off`
  opaque.

### Task 8: Phase verification, review, merge

- [ ] Full suite, typecheck, lint, cargo fmt/clippy/test, `npm run build` (CSS guard).
- [ ] Real app (Blogosphere Dev via bridge): screenshots light (and dark if Jesse can switch); narrow-window collapse; popover open/close; row drag.
- [ ] apple-design quick pass on the new chrome; fix Critical/High.
- [ ] Adversarial code review (par) of `main...HEAD`; fix verified findings in small commits.
- [ ] Fast-forward `main`.
