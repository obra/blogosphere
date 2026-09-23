# Native Mac Redesign — Phase 4 (Content) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On macOS, make the content column feel like a Mac app writing a real blog: native entry rows, segmented control, search field, date and tag fields, a formatting bar, and Write mode set in blog.fsck.com's own typefaces; plus the two items moved here from phase 3 (row conflict symbol, View › editor modes).

**Architecture:** Mostly `html[data-platform="macos"]` CSS in a new `app-macos-content.css`, with small markup changes where the native control needs structure (row indicators, the search magnifier, formatting-bar symbols). Fonts are bundled from `@fontsource` packages (OFL-1.1) so Write mode works offline. View › editor modes use a registry like phase 3's `activeEditor`: the mounted editor screen publishes its mode segments; the menu shows and switches them.

**Tech Stack:** as phases 1–3, plus `@fontsource-variable/crimson-pro`, `@fontsource/dm-serif-display`, `@fontsource/jetbrains-mono` (5.3.0, OFL-1.1).

**Spec:** `docs/superpowers/specs/2026-09-23-native-mac-redesign-design.md` §4 (controls), §6 (View editor modes), §7 (visual system, typography), §11 phase 4, and "Changes made while building phase 3".

**Plan review (/par, 2026-09-23):** 13 + 12 findings, nearly all legitimate, folded in below. Biggest: Crepe's own `p`/`h3` rules and CodeMirror's code-block font would have defeated the typography as written; the title field renders in every mode; ⌥⌘1–3 is Milkdown's H1–H3 shortcut (the modes move to ⌃⌘1–3, a spec change recorded there); WebKit already draws a search clear button and clears on Escape; `<Icon>` can't be used inside the editor package.

## Global Constraints

- Mac-only look is gated on `html[data-platform="macos"]`; markup changes must render the same on other platforms or be gated on `shell.platform() === "macos"`. iOS, Android, web, and the phone layout look unchanged.
- No `light-dark()`; `-webkit-user-select`; Biome zero errors/warnings/infos; tests seen failing first; never bypass the pre-commit hook.
- Fonts: only the weights and styles the blog uses (Crimson Pro variable roman + italic, DM Serif Display 400 roman + italic, JetBrains Mono 400 + 500). Latin only for DM Serif Display and JetBrains Mono; the Crimson Pro variable package has no Latin-only file, so its three subsets ship and `unicode-range` loads only what a post uses. Chrome stays `-apple-system`.
- Semantic icons only; new names go in `iconNames.ts` with their SF Symbol and Lucide twin.
- Small commits; real-app check through `scripts/dev-app.sh`; /par on the diff; ff-merge to main. Never Save & Sync or Publish from the dev app (it shares the real token).

## Review Focus

1. **Write mode typography must not leak into Markdown mode, legacy HTML, or other platforms** (Markdown stays `ui-monospace`; iOS/web keep today's faces). Task 2 tests the scoping.
2. **A row's conflict symbol opens the Conflict sheet for that row without also selecting-and-dismissing things** (it's a sibling of the row button, not nested). Task 3.
3. **View › editor modes titles follow the entry** (Write/Markdown/Live vs Preview/HTML/Live) and disable Live when there's no live URL; choosing one while the editor isn't mounted does nothing. Task 7.
4. **The search field's (WebKit-drawn) clear button and Escape empty the query in the store**, not just the field's text. Task 5.
5. **Fonts load offline** (bundled, no network): the release build contains the woff2 files and the CSS check still passes. Task 1.

## Execution record (2026-09-23)

Tasks 1–7 as revised, plus, at Jesse's prompting ("not just Biome's limits but good taste"), splits before adding to crowded files: `EntryRow.tsx` out of EntryList, `EditorBar.tsx` out of EditorScreen, `formatCommands.ts` out of menuModel, `menuState.ts` and `menuTracking.ts` out of menu.ts, `app-macos-writing.css` and `app-macos-controls.css`, and one `createRegistry` shared by the focused editor and the view modes. Found live: the unsaved-changes dot pushed its row's title out of line (now a fixed gutter). Verified live: computed Write-mode faces and sizes; Markdown mode stays system/monospace; View lists Write/Markdown/Live and switches modes; the formatting bar's symbols (webview capture); one clear button in the search field. Not verified live: clicking the search clear button (background clicks don't reach the webview), a real conflict row, dark mode. Scenario cards: `docs/superpowers/e2e/phase4-content.md`. Code review (/par, 6 + 7 findings, all fixed): overriding `--crepe-font-default` put the serif on Crepe's own controls (now only the post's text is set); h1 and h4–h6 kept faux bold and out-of-order sizes (now all at 400, in size order); macOS rows stopped telling VoiceOver about a conflict (now visually hidden text); the release check's @font-face test could never fail (now it matches real rules and every weight and style); the fonts shipped without their OFL licenses (now `public/licenses/fonts`); an entry switch rewrote View's items twice (now one microtask-coalesced update of only what changed); an unreadable entry still offered modes; the spec still said ⌥⌘1–3 in three places.

---

### Task 1: Bundle the blog's faces

**Files:** `package.json`, `src/ui/app/fonts.css` (new, imported by `app.css` before the macOS files), `scripts/check-release-css.mjs` (add a check that the three families are declared).

- [ ] `npm install @fontsource-variable/crimson-pro@5.3.0 @fontsource/dm-serif-display@5.3.0 @fontsource/jetbrains-mono@5.3.0`.
- [ ] `fonts.css` imports only the Latin CSS files for the needed weights/styles (check the packages' file names in `node_modules`, e.g. `@fontsource/jetbrains-mono/latin-400.css`).
- [ ] Release check: `npm run build` → `check-release-css` also asserts `@font-face` for "Crimson Pro Variable", "DM Serif Display", "JetBrains Mono" (the families fontsource declares — read them from the package CSS) and that `dist/assets` has their woff2 files.
- [ ] Commit "Bundle the blog's typefaces (Crimson Pro, DM Serif Display, JetBrains Mono)".

### Task 2: Write mode in the blog's typography

**Files:** Create `src/ui/app/app-macos-content.css` (imported last in `app.css`), `EditorScreen.tsx` (`data-editor-mode="write|markdown|html"` on `.editor-doc`), extend `cssContract.test.ts`, a DOM test for the attribute.

- [ ] Under `html[data-platform="macos"] .editor-doc[data-editor-mode="write"]`: Crepe's `--crepe-font-*` set to the three families; **paragraphs** (`.ProseMirror p`, and `li p`) Crimson Pro 19px / 1.7 with Crepe's 4px `p` padding zeroed and 1.4em spacing (Crepe's `reset.css` sets `p` 16px/24px, so rules on `.ProseMirror` alone never reach them); blockquotes and lists the same face; h2 DM Serif Display 32px **weight 400** (only 400 ships; `app-crepe.css` says 650), line-height 1.2, margin 2em 0 0.6em; h3 JetBrains Mono 12px **weight 500**, line-height 1.4 (Crepe says 40px), same margins; code blocks through CodeMirror's own scroller (`.milkdown-code-block .cm-scroller`) JetBrains Mono 14px / 1.5; inline code 0.92em, `--text` on an 8% label chip (Crepe's inline-code color var set to `--text`). Title (`.editor-title-input` inside a Write-mode doc only) DM Serif Display 40px, 400, letter-spacing -0.025em. No `.cm-content` rule: Markdown mode already uses `ui-monospace` (`sourceEditorSetup.ts`).
- [ ] Tests: cssContract: Mac-scoped; values present on `p`, `h2` (weight 400), `h3` (weight 500), `.cm-scroller`; no rule without `[data-editor-mode="write"]` names a serif. DOM: `.editor-doc` carries the mode (write, markdown, and html for a legacy entry).
- [ ] Real app: `getComputedStyle` on a paragraph, an h2, and the title in Write mode report the spec values and families; in Markdown mode the title and body aren't serif. Screenshot (light).
- [ ] Commit "Write mode sets the post in the blog's own typography".

### Task 3: Native entry rows

**Files:** `src/ui/app/EntryList.tsx`, `EntryList.test.tsx`, `app-macos-content.css`, `iconNames.ts` (`conflict: exclamationmark.triangle / TriangleAlert` if `syncConflict` isn't reused).

- [ ] macOS rows: title 13px semibold; date 11px secondary; unsaved changes a small dot; legacy HTML "HTML" and draft "Draft" as secondary-label words (no pills); conflict an orange `exclamationmark.triangle`.
- [ ] macOS only: each row sits in a `div.entry-row-item` (not `li`: rows live in month `div`s) holding the row button and, when conflicted, `button.entry-row-conflict` at the trailing edge (`tabIndex={-1}`: the editor's Resolve… bar is the keyboard path; ↑/↓ stay on rows), labeled "Resolve conflict in <title>"; click → `openConflict(path)`; right-click on it opens the row's context menu. Conflicted rows get trailing padding so titles don't run under it. On a focused selection the symbol turns white (`.entry-row-item[data-selected="true"]` inside a focused list), like the dot. Other platforms keep today's markup and pill.
- [ ] Tests (with `platform: "macos"`): words not pills; the conflict symbol opens the sheet for that row and leaves the selection alone; ↑/↓/Home/End/Enter still move between rows on macOS (the existing nav tests run on web only); cssContract for the white-on-selection rule.
- [ ] Commit "macOS entry rows: native indicators; the conflict symbol opens Resolve".

### Task 4: Segmented control

**Files:** `app-macos-content.css`.

- [ ] `.mode-toggle` on macOS: one rounded track (`--bg-hover` fill, 6px radius, 22px tall to fit the toolbar), selected segment raised with a 0 1px 2px shadow: `--bg` in light, a lighter-than-track fill in dark (`color-mix(in srgb, -apple-system-label 22%, transparent)` under the `prefers-color-scheme: dark` pattern) so it never looks sunken; 12px labels, `cursor: default`, no borders between segments.
- [ ] Screenshot light/dark (dark via `resize_window colorScheme` only if available for the dev app; otherwise Jesse's manual list).
- [ ] Commit "macOS segmented control for the editor modes".

### Task 5: Search field

**Files:** `EntryList.tsx` (`EntrySearchBox`), `iconNames.ts` (`search: magnifyingglass / Search`), `app-macos-content.css`, test.

- [ ] macOS: rounded field with a leading magnifier symbol. WebKit's `type="search"` already draws the clear button and clears on Escape, so no custom button: style `::-webkit-search-cancel-button` to sit inside the rounded field, and make sure the React state follows (WebKit fires `input` on clear; the field uses `onChange`, which React maps to `input`). Other platforms unchanged.
- [ ] Tests: the magnifier renders on macOS only; firing `input` with an empty value clears the query in the store. Real app: exactly one clear button; clicking it clears the list's search; Escape clears.
- [ ] Commit "macOS search field: rounded, with a magnifier".

### Task 6: Date, tags, and the formatting bar

**Files:** `app-macos-content.css`, `src/ui/editor/Toolbar.tsx` (+test), `iconNames.ts` (`bold: bold/Bold`, `italic: italic/Italic`, `code: chevron.left.forwardslash.chevron.right/Code`, `heading: textformat.size/Heading2`, `link: link` (reuse), `image: photo/Image`).

- [ ] Date field: keep `<input type="date">`; macOS border/radius only. Tags: token-field look (rounded tokens, `--bg-hover` fill, 11px).
- [ ] Formatting bar (Markdown mode): on macOS, symbol buttons, borderless 28×28 like toolbar buttons; elsewhere today's text labels. The editor package stays free of app imports (`<Icon>` needs the app's services): `Editor` and `Toolbar` take an optional `renderIcon?: (name: FormatIconName) => ReactNode` prop, and EditorScreen passes one that renders `<Icon>` on macOS. Accessible names stay plain ("Bold"); the shortcut goes in `title` ("Bold ⌘B") and `aria-keyshortcuts` for the three that have one (⌘B, ⌘I, ⌘E).
- [ ] Tests: with `renderIcon` the buttons show its output and keep their names; without it, today's labels.
- [ ] Commit "macOS date, tags and formatting bar".

### Task 7: View › editor modes (⌃⌘1–3)

**Files:** Create `src/ui/app/viewModes.ts` (+test). Modify `EditorScreen.tsx` (register), `menuModel.ts` (`viewModeItems(segments)`, command ids `mode1|mode2|mode3`), `menu.ts` / `menuSubmenus.ts` (View items, retitled and re-enabled on change).

Shortcut: **⌃⌘1–3**, not the spec's ⌥⌘1–3, which Milkdown binds to H1–H3 in Write mode (record in the spec's phase 4 changes). macOS only, like Hide/Show Sidebar (Ctrl+Alt+digit is AltGr+digit on Windows).

**Produces:** `interface ModeSegment { title: string; enabled: boolean }`; `setViewModes(target: { segments: ModeSegment[]; choose(index: number): void }): () => void`, `getViewModes()`, `subscribeViewModes(fn)`. EditorScreenBody registers its three segments (Write/Markdown/Live or Preview/HTML/Live; Live disabled without a live URL) and updates on change.

- [ ] Tests: registry semantics (like activeEditor); `viewModeItems` titles/enabled for a Markdown entry, a legacy HTML entry, no live URL, nothing registered (all disabled, default titles Write/Markdown/Live); `runMenuCommand("mode3")` chooses segment 3 of the registered target; a sheet open refuses it (existing modal guard).
- [ ] Menu (macOS only): View gets the three items after Hide/Show Sidebar with `Ctrl+Cmd+1..3`; text and enabled follow `subscribeViewModes`, diffed (text and enabled compared before any `setText`/`setEnabled`) so typing, which re-renders the editor screen, causes no menu IPC. EditorScreen registers once per entry and updates the target only when a segment's title or enabled flag changes.
- [ ] Tests also: re-registering identical segments triggers no update (the diff), and ⌥⌘1–3 stay unbound in the menu.
- [ ] Commit "View menu: the editor modes with ⌃⌘1–3".

### Phase close

- [ ] Real app: rows, segmented control, search field, formatting bar, Write-mode typography screenshots (light; dark if the environment allows); View ⌥⌘ items listed and switching modes via `app_menu`.
- [ ] Update scenario cards (`docs/superpowers/e2e/phase4-content.md`).
- [ ] /par; fix; execution record; ff-merge to main.
