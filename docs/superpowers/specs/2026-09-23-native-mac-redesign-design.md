# Native Mac redesign — design

Date: 2026-09-23. Status: revised after adversarial review (two reviewers, 33
findings, verified against code/HIG before incorporating).

## Goal

Blogosphere should feel like a Mac app. The bar: someone who uses it every day
on macOS would not guess it is built on web technology. Today it reads as a
well-made web app in a window (audit below).

Success criteria:

1. Every item in the audit's "reads as web" list is gone or has a native answer.
2. Mac chrome (sidebar, toolbar, lists, controls, menus, popovers, sheets,
   settings) uses system materials, system colors, and system type, and follows
   the HIG pages cited below. Deliberate deviations are listed as such.
3. Light and dark appearance, the user's accent color, Increase Contrast,
   Reduce Transparency, and Reduce Motion are honored on macOS.
4. Everything works from the keyboard, and every command in the toolbar or a
   context menu is also in the menu bar.
5. iOS, Android, web dev, and the phone (compact) layout keep today's look and
   behavior. Nothing here may regress them.
6. The test suite stays green and no existing feature loses its home (see the
   feature inventory in §8).

Non-goals: redesigning the phone layout or iOS (next phase), Windows, changing
sync semantics or the data model, rewriting the editors, adding in-document
Find (neither editor has it today; tracked separately).

## Decisions already made

- **Stay on Tauri.** Expo/React Native doesn't target macOS, and the editors
  (Milkdown + CodeMirror) are DOM-only either way. A SwiftUI shell would exceed
  the bar at the cost of rewriting the UI layer.
- **Scope:** Mac first, then iOS, both following Apple's HIG. Android later.
- **Approach:** native structure *and* native skin, not a restyle alone.
- **Materials:** real Liquid Glass behind the sidebar via
  `tauri-plugin-liquid-glass` (proved in the `spike/native-materials` spike).
  `NSGlassEffectView` is public API in macOS 26; the plugin's material
  *variants* use a private setter, so we use the default variant only. The
  transparent window requires Tauri's `macOSPrivateApi`, which rules out the
  Mac App Store. Migrate to Tauri's own glass window effects
  (tauri-apps/tauri#14454, merged 2026-09-22, unreleased) when it ships.
- **Icons:** SF Symbols on Apple platforms only; Lucide elsewhere.

## Audit summary (2026-09-23, apple-design skill, live app via tauri-mcp)

Already right: 13px system UI text, 28px controls, a native menu bar with
shortcuts, dark mode tokens, reduced-motion handling, a WebKit-native date
field (`<input type="date">`), token-style tag editing.

Reads as web:

- Hard-coded Tailwind palette (`#2563eb`, gray-500); ignores the accent color
  (`color.md` › System colors).
- Flat `#f6f6f7` sidebar instead of a material (`cross-platform.md`: "Prefer the
  platform's real materials and window chrome over a web imitation").
- Pale-blue selection with dark text (`focus-and-selection.md`: focused list
  items use "white text and a background highlight" in the accent color).
- Title bar is an empty strip; a "Blogosphere" header and a second toolbar row
  sit below it.
- New Post / New Link as big bordered buttons in the sidebar.
- Delete as a toolbar peer of Publish; a "Published" pill.
- Settings is an in-window modal (`settings.md`: a settings window from the App
  menu, ⌘,); Activity is a modal that stacks over it.
- Sync pill at the bottom of the sidebar (`sidebars.md`: "Avoid putting critical
  information or actions at the bottom of a sidebar").
- No context menus (`context-menus.md`: "Support context menus consistently
  throughout your app").
- Web search box, bordered icon buttons (`toolbars.md`: "Prefer
  system-provided symbols without borders"), GitHub-red inline code.
- Custom `::-webkit-scrollbar` styling (`app.css:155-172`) overrides native
  overlay scrollbars and the "Show scroll bars" setting.
- Chrome text is selectable (drag or ⌘A); controls use `cursor: pointer`.
- Web-style toasts for errors and confirmations.

## Verified platform facts (spike, 2026-09-23, macOS 26.5)

- WKWebView on macOS resolves `AccentColor` and these `-apple-system-*` colors:
  `label`, `secondary-label`, `tertiary-label`, `quaternary-label`,
  `placeholder-text`, `separator`, `container-border`, `text-background`,
  `control-background`, `selected-content-background`,
  `unemphasized-selected-content-background`, `selected-text-background`,
  `unemphasized-selected-text-background`, `header-text`, `grid`,
  `control-accent`, `selected-text`, `red`, `green`, `orange`, `yellow`,
  `blue`, `gray`. Not supported: `control`, `control-text`, `selected-control`,
  `focus-ring`, `link`, `text`, `find-highlight`, `window-background`,
  `under-page-background`. `text-background` and `control-background` are the
  same color (white / #1E1E1E), so they can't express "raised."
  Unverified: live tracking of an accent-color change (phase 1 checks it).
  These are AppKit names; iOS is unverified and keeps hex values this phase.
- `ui-serif` (New York), `ui-rounded`, `ui-monospace`, `-apple-system` resolve.
- Liquid Glass renders behind transparent regions of a transparent webview;
  opaque panes cover it.
- `@tauri-apps/api` 2.11.1: `Menu.popup()` gives native NSMenu context menus;
  windows support `trafficLightPosition`.
- `objc2-app-kit` is already in the Rust dependency tree.
- SF Symbols license: for UIs of software running on Apple operating systems.
  Fine in Mac/iOS builds, never on Android, never committed to this public repo.
- `shell.platform()` currently returns `"macos"` unconditionally
  (`src/shell/tauri.ts:25-28`). Real detection is phase-1 work.

## Design

### 1. Platform gate (prerequisite)

- A Rust command `current_platform` returns `"macos" | "ios" | "android"` from
  `cfg!(target_os)`. `createTauriShell().platform()` calls it once at boot; the
  fake/web shell keeps returning `"web"`.
- Boot writes `data-platform` on `<html>`.
- **The native Mac design applies only when `data-platform="macos"`.** Every
  other platform keeps today's CSS, components, modals, and hex palette. On
  macOS the compact (phone) layout is never used: the compact media query is
  gated to non-macOS platforms, and the Mac window's minimum size is set so
  the desktop layout always fits (§2).

### 2. Window structure (macOS)

Three columns, as in Mail and Notes: **glass sidebar | entry list | editor.**

```
┌──────────────┬─────────────────────┬──────────────────────────────────────────┐
│ ● ● ●        │ [🔍 Search      ] ✎ │ [Write|Markdown|Live] Saved to GitHub  ⟳ Publish … │
│              ├─────────────────────┼──────────────────────────────────────────┤
│ 📝 Drafts  3 │ 2026                │  B  I  </>  H2  🔗  🖼                    │
│ 📄 Posts 541 │ September           │                                          │
│ 🔗 Links   4 │  SF: A Birds of … • │   Superpowers 6.4                        │
│ 📦 Releases  │  Superpowers 6.4 ◀──│   [Sep 21, 2026] superpowers ×           │
│  28          │ August              │                                          │
│  (glass)     │  …                  │   I'm pleased to announce …              │
└──────────────┴─────────────────────┴──────────────────────────────────────────┘
```

**Toolbar row.** One row across the list and editor columns, acting as the
title bar. Its height is measured from a native unified-toolbar app (Notes) on
the running macOS, and the traffic lights are moved with
`trafficLightPosition` so they sit vertically centered on that row
(`windows.md`: controls must not overlap toolbar items). The row is a drag
region (`data-tauri-drag-region`) except its controls. The row is
**window-level**: it renders even with no entry selected and on the first-run
connect screen, so the sync button always exists (editor-side items are hidden
when nothing is selected).

- *List side:* search field (§4) and a compose button (`square.and.pencil`,
  New Post). Its menu (click-and-hold or the chevron) offers New Link.
- *Editor side, leading to trailing:*
  1. Mode control. Markdown entries: Write / Markdown / Live. Legacy `.html`
     entries: Preview / HTML / Live. The Live segment is absent when the entry
     has no live URL (today's rule, `EditorFieldControls.tsx:86-125`).
  2. Document status, secondary-label text: the existing save-state strings
     ("Saved on this device", "Saved to GitHub · not public", …) plus
     "Published" where today's pill shows it. Replaces `SaveStateIndicator` and
     the Published pill; the strings don't change.
  3. Flexible space.
  4. Sync status button (§3).
  5. **Publish** — the only prominent (accent-filled, white label) button.
     Shown and enabled under exactly today's conditions, same action
     (`PublishControls.tsx`). No new "Update" state: edits to published posts
     keep going live through Save & Sync (⌘S).
  6. Ellipsis menu (native, `Menu.popup()`): Open on Site, Versions…, Copy
     Secret Link, Discard Changes…, Delete….
- The visible secret-link URL moves into the Copy Secret Link flow: the menu
  item copies it and a HUD (§5) shows the copied URL.

**Formatting bar.** The Write-mode formatting buttons (bold, italic, code, H2,
link, image — `src/ui/editor/Toolbar.tsx`) stay as a borderless symbol row
pinned at the top of the editor column, below the toolbar, like Mail's
compose format bar. Their commands also go in a new Format menu (§6).

**Sidebar.** Drafts, Posts, Links, Releases, each with an SF Symbol tinted
with the accent color (`sidebars.md`: "By default, sidebar icons use your app's
accent color") and a secondary-label count. Removed: the "Blogosphere" header,
New Post / New Link buttons, the footer (sync pill, activity button, gear).
Sidebar can be hidden: View › Hide Sidebar (⌃⌘S) and a toolbar toggle
(`sidebar.left`).

**Widths.** Sidebar and list column have draggable dividers (resize cursor),
widths persisted in meta. Minimums: sidebar 160, list 240, editor 420. Window
`minWidth` on macOS = list + editor minimums (660); below sidebar + list +
editor (820) the sidebar auto-collapses (`sidebars.md`: "consider
automatically hiding and revealing a sidebar when its container window
resizes"). Default window size grows to 1100×720 so a first launch shows all
three columns comfortably.

### 3. Sync status button and Activity popover (macOS)

The button is a borderless symbol with an optional small badge. States, taken
from today's `syncLabel.ts`:

| State | Symbol | Badge | Tooltip |
|---|---|---|---|
| Not connected | `icloud.slash` | — | "Not connected to GitHub" |
| Syncing | `arrow.triangle.2.circlepath` (rotating; static with Reduce Motion) | — | "Syncing…" |
| Synced | `checkmark.icloud` | — | "Synced · {relative time of last check}" |
| Pending | `arrow.up.circle` | N | "{N} changes not yet on GitHub" |
| Conflict | `exclamationmark.triangle` (orange) | N | "{N} conflicts" |
| Offline | `wifi.slash` | — | "Offline — changes stay on this device" |
| Error | `exclamationmark.icloud` (red) | — | "Couldn't sync: {message}" |

"Synced" uses the time of the last successful check, not the last change
(fixes today's stale "32m ago" after a no-op pull).

Click opens the **Activity popover** anchored to the button: status headline
and detail, the activity log (today's `SyncLogPanel` content), a Sync Now
button, and, when not connected, "Connect…" which opens the connect flow.
Escape or clicking outside closes it. ⌥⌘L (View › Activity Log) opens it too.

### 4. Controls (macOS)

Each restyled control keeps the system's size, placement, and behavior
(`branding.md`):

- **Toolbar buttons:** borderless symbols, 28×28 hit area, hover fill,
  pressed state, tooltip = command name + shortcut. `cursor: default`.
- **Segmented control:** one rounded track, selected segment raised with a
  shadow, sized to the toolbar.
- **Search field:** rounded, leading magnifier, trailing clear button when
  non-empty. Focus via Edit › Find › Search Entries (⌥⌘F), a menu item, since
  a native accelerator can't depend on focus.
- **Entry rows:** title (13px semibold), date (11px secondary), and today's
  indicators kept: unsaved changes as a small dot, conflict as an orange
  `exclamationmark.triangle`, legacy HTML as a secondary-label "HTML", draft
  status as a secondary-label word (no pills). Selection: accent background
  with white text when the list is focused, unemphasized gray when not.
  ↑/↓ move, Return focuses the editor, right-click opens the context menu.
- **Date field:** keep `<input type="date">` (WebKit already draws the native
  segmented date field and calendar); restyle only its border and radius.
- **Tags:** keep `TagChipsEditor`; restyle tokens to the macOS token-field look.
- **Context menus** (native, `Menu.popup()`): entry rows get Open on Site, Copy
  Secret Link, Publish…, Delete…; sidebar sections get New Post (Drafts, Posts)
  or New Link (Links). Editor text keeps the WebView's own text menu. Every
  item also exists in the menu bar.
- **Scrollbars:** the custom `::-webkit-scrollbar` rules don't apply on macOS;
  native overlay scrollbars return.
- **Chrome text:** `user-select: none` on chrome (sidebar, toolbar, list
  rows, labels); content and fields stay selectable.

### 5. Surfaces (macOS)

- **Settings window.** A second window, label `settings`, loading a separate
  Vite entry (`settings.html` → `src/settings/main.tsx`). Single pane today
  (Connection + Commit messages), so per `settings.md` it has no toolbar, is
  titled "Blogosphere Settings", and sizes to its content; minimize and zoom
  disabled. ⌘, focuses the window if it already exists.
  - It is its own JS context: it builds only the pieces it needs (keychain via
    shell, the SQLite store for meta) and never constructs GitHub or sync
    services.
  - After a save it emits a Tauri event `settings-changed` with
    `{ kind: "token" | "templates" }`. The main window listens: `token` runs
    today's `onTokenSaved` (rebuild services); `templates` reloads commit
    templates from meta into its store. Errors in the Settings window show
    inline in that window.
  - Capabilities: a new `settings` capability file grants that window only
    what it uses (keychain commands, `sql:default` + execute, event emit,
    window close). The main capability stays `["main"]`.
  - Lifecycle: closing the main window closes Settings and quits (unchanged
    single-window behavior). Closing Settings affects nothing else.
  - The phone layout and non-macOS platforms keep the in-window Settings modal.
- **Sheets.** Publish, New Link, Versions, and Conflict become macOS sheets
  (`sheets.md` › Desktop: "a cardlike view with rounded corners that floats on
  top of its parent window. The parent window is dimmed while the sheet is
  onscreen"). One at a time; Escape cancels; Return triggers the default
  button. **Conflicts never interrupt:** on macOS, background sync no longer
  opens the Conflict sheet by itself. A conflict shows on the entry row and the
  sync button; the sheet opens when the person clicks either or selects the
  conflicted entry. (Today `ConflictHost` auto-opens; unchanged elsewhere.)
- **Quick Open (⌘K)** stays a centered floating palette (Spotlight idiom).
- **Materials for popovers and sheets:** a deliberate deviation. HIG puts them
  in the Liquid Glass layer, but real glass can only sit behind the whole
  window, not float over opaque content. They use an opaque raised surface
  (`--bg-raised`) with the system popover/sheet shadow.
- **Toasts → state, alerts, HUD.** Sync errors (including Retry) move to the
  sync button's Error state and the Activity popover. Errors that need a
  decision use native alerts (the dialog plugin, already used for
  confirmations). Brief confirmations ("Copied") use a small non-interactive
  HUD, bottom-center, 1.5s, fading (no fade with Reduce Motion). The toast
  component remains for other platforms.

### 6. Menu bar (macOS)

`menu.ts` builds App, File, Edit, View, Window. Changes:

- **File** keeps New Draft (⌘N), New Link… (⇧⌘L), Save & Sync (⌘S), Sync Now
  (⌘R). Entry commands move out of File into a new **Entry** menu.
- **Entry:** Publish… (⇧⌘P), Open on Site, Versions…, Copy Secret Link,
  Discard Changes…, Delete… (no shortcut: ⌘⌫ must stay "delete to line start"
  in the editors). Items disable when not applicable (no selection, no live
  URL, nothing to discard).
- **Edit** gains Find › Search Entries (⌥⌘F).
- **Format** (new): Bold (⌘B), Italic (⌘I), Code, Heading, Link…, Image…,
  mirroring the formatting bar; enabled only in Write mode. Link gets no ⌘K
  (Quick Open owns it).
- **View:** existing ⌘1–4 sections, Quick Open (⌘K), Activity Log (⌥⌘L), plus
  Hide/Show Sidebar (⌃⌘S) and the three editor modes as ⌥⌘1–3 (titles follow
  the entry: Write/Markdown/Live or Preview/HTML/Live), disabled when a mode
  isn't available.
- **Help** (new): Blogosphere Help → opens the README on GitHub.

### 7. Visual system (macOS)

CSS custom properties keep their current names so component CSS mostly
doesn't change; a `html[data-platform="macos"]` block overrides their values.
Every existing token is mapped:

| Token | macOS value | Notes |
|---|---|---|
| `--text` | `-apple-system-label` | |
| `--text-muted` | `-apple-system-secondary-label` | |
| `--text-faint` | `-apple-system-tertiary-label` | |
| `--border` | `-apple-system-separator` | |
| `--border-strong` | `-apple-system-container-border` | |
| `--bg` | `-apple-system-text-background` | editor + list |
| `--bg-raised` | `light-dark(#ececec, #2d2d2d)` | sheets, popovers; `window-background` isn't exposed and `control-background` equals `--bg` |
| `--bg-sunken` | `light-dark(#f5f5f5, #1a1a1a)` | opaque sidebar fallback only |
| `--bg-hover` | `color-mix(in srgb, -apple-system-label 6%, transparent)` | |
| `--bg-selected` | `-apple-system-selected-content-background` | focused selection, white text |
| `--bg-selected-inactive` (new) | `-apple-system-unemphasized-selected-content-background` | unfocused selection |
| `--accent` | `AccentColor` | |
| `--accent-text` | `#ffffff` | white on accent fills, both appearances |
| `--danger` / `--success` / `--warning` | `-apple-system-red` / `-green` / `-orange` | status only |
| `--shadow`, `--shadow-sheet` | macOS popover/sheet shadows, per appearance | |

- Sidebar background is transparent over glass. Fallback (glass unavailable,
  Reduce Transparency, Increase Contrast): opaque `--bg-sunken`.
- Focus: `:focus-visible` draws a 3px ring of `color-mix(AccentColor 50%,
  transparent)` hugging the control radius.
- **Increase Contrast** (`prefers-contrast: more`): separators use
  `--border-strong`; sidebar goes opaque.
- **Reduce Transparency:** WebKit's `prefers-reduced-transparency` if it
  matches; otherwise a Rust command reads
  `NSWorkspace.accessibilityDisplayShouldReduceTransparency` at boot and on
  its change notification and sets `data-reduce-transparency`. Either way the
  glass is disabled and the sidebar painted opaque.
- **Typography, chrome:** `-apple-system` 13px body, 11px captions/counts,
  13px semibold list titles. No other faces in chrome.
- **Typography, content (the signature):** Write mode renders the post in
  blog.fsck.com's own faces — Crimson Pro (body), DM Serif Display (headings),
  JetBrains Mono (code) — at `site.css`'s sizes and line heights, bundled as
  local font files (SIL OFL) so it works offline. What you write looks like
  what readers see; the chrome stays system around it. Markdown mode uses
  `ui-monospace`. Inline code: `--text` on a `color-mix(label 8%)` chip, no
  red.
- **Icons:** components ask for a semantic name (`compose`, `drafts`, `sync`
  …), never a platform name. macOS: a Rust command renders
  `NSImage(systemSymbolName:)` to a template PNG at the requested point size,
  weight, and scale; CSS uses it as a `mask-image` filled with `currentColor`;
  cached per (name, size, weight, scale). Nothing from SF Symbols is committed.
  All other platforms and web dev: Lucide (ISC) via the same semantic map.

### 8. Feature inventory (nothing loses its home)

| Today | macOS after redesign |
|---|---|
| Sidebar New Post / New Link | Compose button + its menu; File menu; sidebar context menu |
| Sync pill (label, time, error tooltip, not-connected → Settings) | Sync status button + tooltip + Activity popover (§3) |
| Activity button / modal | Activity popover; ⌥⌘L |
| Settings gear / modal | Settings window; ⌘, |
| Mode switch incl. legacy Preview/HTML, conditional Live | Toolbar segmented control; View ⌥⌘1–3 |
| Save-state indicator, Published pill | Toolbar document-status text |
| Publish button | Toolbar Publish (same conditions/action); Entry › Publish… |
| Open on site ↗, Versions ⏱, Delete, Discard, Copy Secret Link, secret-link URL | Ellipsis menu; Entry menu; row context menu; HUD shows copied URL |
| Formatting toolbar | Formatting bar; Format menu |
| Row badges (unsaved, conflict, HTML, draft) | Row indicators (§4) |
| Conflict dialog (auto-opens) | Conflict sheet (on demand) |
| Toasts (incl. Retry) | Sync error state + popover; native alerts; HUD |
| Quick Open ⌘K | Unchanged |
| Connect screen (first run) | Unchanged content, restyled with tokens |
| Phone layout + everything on iOS/Android/web | Unchanged |

### 9. Error handling

- Glass setup fails or is unavailable: log once, set `data-glass="off"`, paint
  the sidebar opaque. The window is never transparent with nothing behind it.
- Symbol render fails (unknown name, older macOS): use the Lucide icon for
  that semantic name; log once per name.
- `current_platform` fails: treat as `"web"` (today's non-Mac look) and log.
- Settings window: already open → focus it; a failed save → inline error.

### 10. Testing

- **Unit (vitest):** platform gate (Mac-only features off elsewhere; compact
  layout never on macOS); semantic icon map (every name resolves on every
  platform); menu model (every toolbar, ellipsis, and context-menu command has
  a menu-bar twin; disabled states); sync status mapping (every `syncLabel`
  state → symbol, badge, tooltip); "Synced" time uses last check; conflict
  sheets never auto-open on macOS; `settings-changed` handling in the main
  window. Existing tests keep passing.
- **Rust:** `current_platform`; symbol renderer returns a PNG of the expected
  pixel size for a known symbol and an error for an unknown one (macOS-only).
- **End-to-end scenario cards** (e2e-scenario-testing skill) against
  `scripts/dev-app.sh`, driven by `scripts/tauri-mcp.sh`: keyboard-only
  new-post → write → Publish sheet → cancel; context menus present; Settings
  window singleton and token/template changes reaching the main window;
  sidebar auto-collapse at narrow widths; light and dark.
- **Visual review:** apple-design pass on the finished screens, recorded in
  the PR; plus one manual check by Jesse of accent-color tracking.

### 11. Phasing (each phase shippable on its own)

1. **Foundation:** platform gate, compact-layout gate, macOS token block,
   typography, focus rings, scrollbars/`user-select`/cursor, icon system.
2. **Chrome:** glass sidebar with fallbacks, toolbar row + traffic lights,
   sidebar cleanup and collapse, column dividers and minimums, sync status
   button and Activity popover.
3. **Surfaces:** Settings window, sheets (with conflict-on-demand), context
   menus, HUD/alerts replacing toasts, menu bar changes (Entry, Format, Edit ›
   Find, Help).
4. **Content:** entry rows, segmented control, search field, date/tag
   restyle, formatting bar, blog typography in Write mode.
5. **Audit pass:** apple-design review of the result; fix findings.

## Open risks

- The plugin or macOS changes break glass → the opaque fallback keeps the app
  usable; migrate to Tauri's glass when released.
- Hand-built toolbar metrics drift across macOS releases → keep all toolbar
  metrics in one token block so a future macOS is one edit.
- Accent-color live tracking unverified → phase 1 checks; if WebKit only reads
  it at load, forward `NSSystemColorsDidChangeNotification` from Rust and
  re-apply.
- The Settings window adds a second JS context → keep its surface tiny (no
  sync) and cover the event contract with tests.
