# Native Mac redesign — design

Date: 2026-09-23. Status: revised after two rounds of adversarial review
(58 findings total, each verified against code/HIG before incorporating).

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
Find (neither editor has it today; tracked separately). One small core change
is in scope: status bookkeeping for "last checked" (§3).

## Decisions already made

- **Stay on Tauri.** Expo/React Native doesn't target macOS, and the editors
  (Milkdown + CodeMirror) are DOM-only either way. A SwiftUI shell would exceed
  the bar at the cost of rewriting the UI layer.
- **Scope:** Mac first, then iOS, both following Apple's HIG. Android later.
- **Approach:** native structure *and* native skin, not a restyle alone.
- **Materials:** real Liquid Glass behind the sidebar via
  `tauri-plugin-liquid-glass` (proved in the `spike/native-materials` spike).
  `NSGlassEffectView` is public API in macOS 26, but the plugin always calls
  a private `set_variant:` selector, even for the default variant (found in
  the phase 2 plan review) — one more reason to move to Tauri's own glass
  once it ships. The
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
  `cfg!(target_os)`. Boot awaits it **before the first render** and passes the
  result into `createTauriShell(platform)`, so `ShellApi.platform()` stays
  synchronous. The fake/web shell keeps returning `"web"`.
- Boot writes `data-platform` on `<html>` before React mounts.
- Compact layout is decided in two places today, and both are gated: the
  `useCompactLayout` hook (returns false on macOS) and the
  `@media (max-width: 760px)` block in `app-mobile.css` (scoped to
  `html:not([data-platform="macos"])`).
- Mac-only window settings (size, minimum size, transparency,
  `trafficLightPosition`, `macOSPrivateApi`) go in `tauri.macos.conf.json`,
  which Tauri merges only on macOS; `tauri.conf.json` keeps the shared values.
- **The native Mac design applies only when `data-platform="macos"`.** Every
  other platform keeps today's CSS, components, modals, and hex palette. On
  macOS the compact (phone) layout is never used, and the Mac window's minimum
  size keeps the desktop layout usable (§2).

### 2. Window structure (macOS)

Three columns, as in Mail and Notes: **glass sidebar | entry list | editor.**

```
┌──────────────┬─────────────────────┬──────────────────────────────────────────────┐
│ ● ● ● ◧      │ [🔍 Search      ] ✎ │ [Write|Markdown|Live] Saved on this device ⟳ Publish … │
│              ├─────────────────────┼──────────────────────────────────────────────┤
│ 📝 Drafts  3 │ 2026                │  B  I  </>  H2  🔗  🖼   ← Markdown mode only  │
│ 📄 Posts 541 │ September           │                                              │
│ 🔗 Links   4 │  Birds of a Feat… • │   SF: A Birds of a Feather on Agentic …      │
│ 📦 Releases  │  Untitled draft ◀── │   [Sep 22, 2026] events ×                    │
│  28          │ August              │                                              │
│  (glass)     │  …                  │   Simon Willison and I have been talking …  │
└──────────────┴─────────────────────┴──────────────────────────────────────────────┘
```
(A draft is selected, in Markdown mode. `◧` is the sidebar toggle. Publish
appears for drafts only.)

**Toolbar row.** One row across the list and editor columns, acting as the
title bar. Its height is measured from a native unified-toolbar app (Notes) on
the running macOS, and the traffic lights are moved with
`trafficLightPosition` so they sit vertically centered on that row
(`windows.md`: controls must not overlap toolbar items). The sidebar toggle
(`sidebar.left`) sits just right of the traffic lights: in the sidebar's top
area when the sidebar shows, and at the leading edge of the list toolbar when
it's hidden, where the list toolbar also gains a leading inset equal to the
traffic lights' width plus the toggle so nothing sits under them. The row is a drag
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
     the Published pill. The strings stay, except two tooltips in
     `saveStateLabel.ts` that name UI being removed: "⌘S (or the sidebar sync
     button)" becomes "⌘S or Sync Now", and "Connect GitHub in Settings" stays
     but Settings is now the Settings window.
  3. Flexible space.
  4. Sync status button (§3).
  5. **Publish** — the only prominent (accent-filled, white label) button,
     shown **only for drafts**. Today it renders for every entry
     (`EditorScreen.tsx:169`), but its action is `publishDraft`, which only
     makes sense for a draft. Same action and sheet as today. Entry › Publish…
     is enabled on the same rule. Edits to published posts keep going live
     through Save & Sync (⌘S).
  6. Ellipsis menu (native, `Menu.popup()`): Open on Site, Versions…, Copy
     Secret Link, Discard Changes…, Delete….
- The visible secret-link URL moves into the Copy Secret Link flow: the menu
  item copies it and a HUD (§5) shows the copied URL.

**Formatting bar.** Today the formatting buttons (bold, italic, code, H2,
link, image — `src/ui/editor/Toolbar.tsx`) render only in **Markdown** mode
(`Editor.tsx:72-74`); Write mode (Crepe) has its own inline affordances and
binds ⌘B/⌘I/⌘E itself, as does CodeMirror. Keep that: in Markdown mode the
bar becomes a borderless symbol row pinned at the top of the editor column,
like Mail's compose format bar. Write mode gets no bar. Both modes get the
new Format menu (§6); legacy HTML entries don't.

**Sidebar.** Drafts, Posts, Links, Releases, each with an SF Symbol tinted
with the accent color (`sidebars.md`: "By default, sidebar icons use your app's
accent color") and a secondary-label count. Removed: the "Blogosphere" header,
New Post / New Link buttons, the footer (sync pill, activity button, gear).
Sidebar can be hidden: View › Hide Sidebar (⌃⌘S) and a toolbar toggle
(`sidebar.left`).

**Widths.** Sidebar and list column have draggable dividers (resize cursor),
widths persisted in meta and read before first render. Minimums: sidebar
160, list 240, editor 420. The macOS window's `minWidth` is 820, the sum, so
all three columns always fit; when the window narrows, the list and then the
sidebar shrink toward their minimums so the editor keeps 420, and divider
drags are clamped to the same limit. Hiding the sidebar is manual (⌃⌘S or
the toggle). **Deliberate deviation:** `sidebars.md` suggests *considering*
automatic hiding on resize; the phase 2 plan review showed auto-collapse
broke the toggle, the traffic-light inset, and "Show Sidebar" in narrow
windows, so it was dropped. Default window size is 1100×720.

### 3. Sync status button and Activity popover (macOS)

The button is a borderless symbol with an optional small badge. States, taken
from today's `syncLabel.ts`, with one precedence change: **Error outranks
Pending** for the button (today `syncLabel.ts:31-36` checks pending first, so
a failed push shows only "N pending" and the failure disappears once the
toast goes). The pending count still shows as the badge in the Error state.
The status message, when present, appears in every state's tooltip.

| State | Symbol | Badge | Tooltip |
|---|---|---|---|
| Not connected | `icloud.slash` | — | "Not connected to GitHub" |
| Syncing | `arrow.triangle.2.circlepath` (rotating; static with Reduce Motion) | — | "Syncing…" |
| Synced | `checkmark.icloud` | — | "Synced · {relative time of last check}" |
| Pending | `arrow.up.circle` | N | "{N} changes not yet on GitHub" |
| Conflict | `exclamationmark.triangle` (orange) | N | "{N} conflicts" |
| Offline | `wifi.slash` | — | "Offline — changes stay on this device" |
| Error | `exclamationmark.icloud` (red) | N pending, if any | "Couldn't sync: {message}" |

"Synced" shows the time of the last successful check. Today a no-op pull
returns before writing `META_LAST_SYNC_AT` (`pull.ts:231-240`, both early
returns), so the pill reads "32m ago" right after a check. The fix writes
that timestamp on those returns too: a core change limited to status
bookkeeping, with core tests.

Click **always** opens the **Activity popover** anchored to the button (today
one click syncs; syncing is now ⌘R, ⌘S, or Sync Now in the popover). The
popover shows: the status headline and detail; conflicted entries, each with
a Resolve… button; deploy status (§5); the activity log (today's
`SyncLogPanel` content); Sync Now; and, when not connected, "Connect…", which
opens the connect flow. Escape or clicking outside closes it. ⌥⌘L (View ›
Activity Log) opens it too.

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
  item also exists in the menu bar, with the same enable rules: Publish… only
  for drafts; Copy Secret Link only when the entry has an opaque id or is a
  draft (today's `SecretLinkControl.tsx:64-66` rule); Open on Site only with a
  live URL.
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
  - It is its own JS context and **owns no state**: no SQLite (the SQL plugin
    replaces the connection pool per `load`, and the store's transactions are
    only sound when all DB access is serial — `transactionRunner.ts:12-18`),
    no keychain, no GitHub or sync services. The main window stays the only
    writer.
  - It talks to the main window with request/reply Tauri events, each
    request carrying an id the reply echoes:
    - `settings:get-state` → `{ connected, repo, templates }`. Sent on open.
    - `settings:save-token { token }` → main runs today's `onTokenSaved`
      (validates with `getRef`, deletes the token on failure) → `{ ok, error? ,
      connected, repo }`. Errors show inline in the Settings window.
    - `settings:save-templates { templates }` → main runs today's
      `setCommitTemplates` → `{ ok, error? }`.
    - Main also emits `settings:state` whenever connection or templates change,
      so an open Settings window stays current.
  - The window is created and focused by a Rust command `open_settings`
    (added to the app's command permission set), so the main capability needs
    no webview-creation permission. A new `settings` capability grants that
    window only `core:event` (emit/listen) and closing itself.
  - The main capability adds `core:window:allow-start-dragging` for the
    toolbar's `data-tauri-drag-region`.
  - Lifecycle: `handleCloseRequested` (`quitFlush.ts`) today destroys only the
    main window, and Tauri keeps running while another window is open. It will
    also close the Settings window after the flush, so closing the main window
    still quits. Closing Settings affects nothing else.
  - The phone layout and non-macOS platforms keep the in-window Settings modal.
- **Sheets.** Publish, New Link, Versions, and Conflict become macOS sheets
  (`sheets.md` › Desktop: "a cardlike view with rounded corners that floats on
  top of its parent window. The parent window is dimmed while the sheet is
  onscreen"). One at a time; Escape cancels; Return triggers the default
  button. **Conflicts never interrupt:** on macOS, background sync no longer
  opens the Conflict sheet by itself, and selecting a conflicted entry doesn't
  open it either (arrowing through the list must never pop a sheet). A
  conflict shows on the entry row, in the sync button's badge, and as a
  "This entry has a conflict — Resolve…" bar at the top of the editor when
  that entry is selected. The sheet opens only from an explicit action:
  Resolve… in that bar or in the Activity popover, or clicking the row's
  conflict symbol. (Today `ConflictHost` auto-opens; unchanged elsewhere.)
- **Quick Open (⌘K)** stays a centered floating palette (Spotlight idiom).
- **Materials for popovers and sheets:** a deliberate deviation. HIG puts them
  in the Liquid Glass layer, but real glass can only sit behind the whole
  window, not float over opaque content. They use an opaque raised surface
  (`--bg-raised`) with the system popover/sheet shadow.
- **Toasts → state, alerts, HUD.** There are 37 `addToast` call sites. On
  macOS, `addToast` routes by kind, so call sites mostly don't change:
  - *Background sync errors* ("Couldn't sync." with Retry,
    `state.entryActions.ts:318`) → the sync button's Error state; Retry becomes
    the popover's Sync Now.
  - *Errors from an action the person just took* (couldn't save / create /
    publish / delete / discard / rename / restore / resolve / build or copy a
    secret link, search failed, path collision) → a native alert via the
    dialog plugin, with "Try Again" when the toast has `retry`.
  - *"Couldn't load your entries."* at startup → not an alert (HIG: never
    alert on launch); the entry list shows an empty state with the message
    and a Try Again button.
  - *Info and success* ("Saved.", "Published.", "Changes discarded.",
    "Restored — sync (⌘S) to make it live.", offline-save notice, "never been
    synced" notice, copied secret link) → the HUD: small, non-interactive,
    bottom-center, 2s (4s for messages over 60 characters), fading (no fade
    with Reduce Motion).
  - *Deploy* ("Live on blog.fsck.com", minutes after a push,
    `state.deployActions.ts`) → a deploy line in the Activity popover
    ("Deploying…", "Live at 10:42", "Deploy failed"), a HUD on success if the
    window is key, and the Error state on failure.
  The toast component and today's routing remain for other platforms.

### 6. Menu bar (macOS)

`menu.ts` builds App, File, Edit, View, Window. Changes:

- **File** keeps New Draft (⌘N), New Link… (⇧⌘L), Save & Sync (⌘S), Sync Now
  (⌘R). Entry commands move out of File into a new **Entry** menu.
- **Entry:** Publish… (⇧⌘P), Open on Site, Versions…, Copy Secret Link,
  Discard Changes…, Delete… (no shortcut: ⌘⌫ must stay "delete to line start"
  in the editors). Items disable when not applicable, using the rules in §4
  (Publish… drafts only; Copy Secret Link needs an opaque id or a draft; Open
  on Site needs a live URL; Discard needs local changes).
- **Edit** gains Find › Search Entries (⌥⌘F).
- **Format** (new): Bold (⌘B), Italic (⌘I), Code (⌘E), Heading, Link…,
  Image…, enabled in Write and Markdown modes (not legacy HTML). The menu
  items carry the same shortcuts both editors already bind, and dispatch to
  whichever editor is active. Link gets no ⌘K (Quick Open owns it).
- **View:** existing ⌘1–4 sections, Quick Open (⌘K), Activity Log (⌥⌘L), plus
  Hide/Show Sidebar (⌃⌘S) and the three editor modes as ⌃⌘1–3 (titles follow
  the entry: Write/Markdown/Live or Preview/HTML/Live), disabled when a mode
  isn't available.
- **Help** (new): Blogosphere Help → opens the README on GitHub.

### 7. Visual system (macOS)

CSS custom properties keep their current names so component CSS mostly
doesn't change; a `html[data-platform="macos"]` block overrides their values
and declares `color-scheme: light dark` (needed for native form controls and
the dark variants of system colors). Light/dark pairs use the codebase's
existing `@media (prefers-color-scheme: dark)` pattern, **not** `light-dark()`:
the production CSS target is `safari13` (`vite.config.ts`), and lightningcss
rewrites `light-dark()` into variables that only resolve under a
`color-scheme` declaration, so dev and release would differ. Every existing
token is mapped:

| Token | macOS value | Notes |
|---|---|---|
| `--text` | `-apple-system-label` | |
| `--text-muted` | `-apple-system-secondary-label` | |
| `--text-faint` | `-apple-system-tertiary-label` | |
| `--border` | `-apple-system-separator` | |
| `--border-strong` | `-apple-system-container-border` | |
| `--bg` | `-apple-system-text-background` | editor + list |
| `--bg-raised` | `#ececec` light / `#2d2d2d` dark | sheets, popovers; `window-background` isn't exposed and `control-background` equals `--bg` |
| `--bg-sunken` | `#f5f5f5` light / `#1a1a1a` dark | opaque sidebar fallback only |
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
  blog.fsck.com's own faces, bundled as local font files (SIL OFL) so it works
  offline. Values from the live site's `/css/site.css` (`.post-page
  .post-prose`, fetched 2026-09-23):
  - body: Crimson Pro 19px, line-height 1.7, paragraph spacing 1.4em;
  - h2: DM Serif Display 32px, margin 2em 0 0.6em;
  - h3: JetBrains Mono 12px, same margins;
  - code blocks: JetBrains Mono 14px, line-height 1.5; inline code 0.92em;
  - title: DM Serif Display, weight 400, letter-spacing -0.025em. The blog
    sets it at 64px for a full-width page; the editor column is narrower, so
    the editor uses 40px (a judgment call, not a site value). What you write looks like
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
| Sync pill (label, time, error tooltip, not-connected → Settings, one-click sync) | Sync status button + tooltip + Activity popover (§3); one-click sync becomes ⌘R / popover Sync Now |
| Activity button / modal | Activity popover; ⌥⌘L |
| Settings gear / modal | Settings window; ⌘, |
| Mode switch incl. legacy Preview/HTML, conditional Live | Toolbar segmented control; View ⌃⌘1–3 |
| Save-state indicator, Published pill | Toolbar document-status text |
| Publish button (shown on every entry) | Toolbar Publish (drafts only, same action); Entry › Publish… |
| Open on site ↗, Versions ⏱, Delete, Discard, Copy Secret Link, secret-link URL | Ellipsis menu; Entry menu; row context menu; HUD shows copied URL |
| Formatting toolbar (Markdown mode) | Formatting bar (Markdown mode); Format menu (Write + Markdown) |
| Row badges (unsaved, conflict, HTML, draft) | Row indicators (§4) |
| Conflict dialog (auto-opens) | Conflict sheet (on demand: editor bar, popover, row symbol) |
| Toasts (37 sites, incl. Retry) | Routed by kind (§5): sync state, alerts, empty state, HUD |
| Deploy watch toast | Deploy line in Activity popover; HUD on success; Error on failure |
| Quick Open ⌘K | Unchanged |
| Connect screen (first run) | Unchanged content, restyled with tokens |
| Phone layout + everything on iOS/Android/web | Unchanged |

### 9. Error handling

- Glass setup fails or is unavailable: log once, set `data-glass="off"`, paint
  the sidebar opaque. The window is never transparent with nothing behind it.
- Symbol render fails (unknown name, older macOS): use the Lucide icon for
  that semantic name; log once per name.
- `current_platform` fails: treat as `"web"` (today's non-Mac look) and log.
- Settings window: already open → focus it; a failed save or a missing reply
  (main didn't answer in 10s) → inline error in the Settings window.

### 10. Testing

- **Unit (vitest):** platform gate (Mac-only features off elsewhere; compact
  layout never on macOS); semantic icon map (every name resolves on every
  platform); menu model (every toolbar, ellipsis, and context-menu command has
  a menu-bar twin; disabled states); sync status mapping (every `syncLabel`
  state → symbol, badge, tooltip; Error outranks Pending); "Synced" time
  written on no-op pulls (core test); conflict sheets never auto-open or open
  on selection on macOS; the settings request/reply handlers in the main
  window (including token validation failure); toast routing by kind; width
  and width rules (pure function of window width, persisted widths, and
  the manual-hide flag); Publish/Copy Secret Link/Open on Site enable rules.
  Existing tests keep passing.
- **Rust:** `current_platform`; `open_settings` creates then focuses one
  window; symbol renderer returns a PNG of the expected pixel size for a known
  symbol and an error for an unknown one (macOS-only).
- **Build check:** a release build's CSS still contains the macOS token block
  intact (guards against minifier rewrites like the `light-dark()` one).
- **End-to-end scenario cards** (e2e-scenario-testing skill) against
  `scripts/dev-app.sh`, driven by `scripts/tauri-mcp.sh`: keyboard-only
  new-post → write → Publish sheet → cancel; context menus present; Settings
  window singleton and token/template changes reaching the main window;
  narrow-window column limits; light and dark.
- **Visual review:** apple-design pass on the finished screens, recorded in
  the PR; plus one manual check by Jesse of accent-color tracking.

### 11. Phasing (each phase shippable on its own)

1. **Foundation:** platform gate (both compact switches, platform-specific
   Tauri config), macOS token block with `color-scheme`, typography, focus
   rings, scrollbars/`user-select`/cursor, icon system.
2. **Chrome:** glass sidebar with fallbacks, toolbar row + traffic lights,
   sidebar cleanup and hide/show, column dividers and minimums, sync status
   button (with Error-over-Pending and the last-checked fix) and Activity
   popover.
3. **Surfaces:** Settings window (request/reply, `open_settings`, close
   handling), sheets (with conflict-on-demand), context menus, toast routing
   (HUD, alerts, empty state, deploy line), menu bar changes (Entry, Format,
   Edit › Find, Help).
4. **Content:** entry rows, segmented control, search field, date/tag
   restyle, formatting bar, blog typography in Write mode.
5. **Audit pass:** apple-design review of the result; fix findings.

## Changes made while building phase 3

- **Moved to phase 4:** clicking a row's conflict symbol to open the Conflict
  sheet (rows are rebuilt there; today's conflict pill sits inside the row
  button) and View › editor modes ⌃⌘1–3 (with the segmented control).
- **Settings window capability:** besides events, it may set its own size and
  read its own inner size and scale factor (to fit its content under the
  title bar), plus the dev-only `mcp-bridge:default`.
- **Connecting a token** now checks it with GitHub before it's written to the
  keychain (a bad replacement used to delete the good token), returns once
  the new services are installed, and runs first downloads one at a time.
- **Toast routing, beyond §5:** a failed entry reload is never an alert (it
  runs after every sync round); it goes to the Activity log, and to the list's
  empty state when there's nothing to show. A failed autosave shows as
  "Couldn't save · Try Again" in that entry's save status instead of an alert
  per typing burst. Alerts with the same message are shown once and Try
  Again runs every waiting retry. A failed deploy stays on the sync button
  until a new deploy starts or a Sync Now succeeds.
- **Modality:** while a sheet (or Quick Open, or the Settings modal) is up,
  menu commands are refused and the Entry menu greys out; a selection change
  dismisses the Publish sheet.

## Changes made while building phase 4

- **View › editor modes use ⌃⌘1–3**, not ⌥⌘1–3: Milkdown binds ⌥⌘1–3 to
  Heading 1–3 in Write mode. macOS only (Ctrl+Alt is AltGr on Windows).
- **Search field:** WebKit's `type="search"` already draws the clear button and
  clears on Escape, so the field only adds the magnifier.
- **Row conflict symbol** sits beside the row button (a button can't nest in
  one), out of the Tab order; the editor's Resolve… bar is the keyboard path.
- **Fonts:** the Crimson Pro variable package has no Latin-only file, so its
  three subsets ship; `unicode-range` loads only what a post uses.

## Open risks

- The plugin or macOS changes break glass → the opaque fallback keeps the app
  usable; migrate to Tauri's glass when released.
- Hand-built toolbar metrics drift across macOS releases → keep all toolbar
  metrics in one token block so a future macOS is one edit.
- Accent-color live tracking unverified → phase 1 checks; if WebKit only reads
  it at load, forward `NSSystemColorsDidChangeNotification` from Rust and
  re-apply.
- The Settings window adds a second JS context → it owns no state (no DB, no
  keychain, no sync); everything goes through main via request/reply, covered
  by tests.
