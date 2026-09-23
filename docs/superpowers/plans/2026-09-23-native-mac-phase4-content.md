# Native Mac Redesign — Phase 4 (Content) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On macOS, make the content column feel like a Mac app writing a real blog: native entry rows, segmented control, search field, date and tag fields, a formatting bar, and Write mode set in blog.fsck.com's own typefaces; plus the two items moved here from phase 3 (row conflict symbol, View › editor modes).

**Architecture:** Mostly `html[data-platform="macos"]` CSS in a new `app-macos-content.css`, with small markup changes where the native control needs structure (row indicators, search clear button, formatting-bar symbols). Fonts are bundled from `@fontsource` packages (OFL-1.1) so Write mode works offline. View › editor modes use a registry like phase 3's `activeEditor`: the mounted editor screen publishes its mode segments; the menu shows and switches them.

**Tech Stack:** as phases 1–3, plus `@fontsource-variable/crimson-pro`, `@fontsource/dm-serif-display`, `@fontsource/jetbrains-mono` (5.3.0, OFL-1.1).

**Spec:** `docs/superpowers/specs/2026-09-23-native-mac-redesign-design.md` §4 (controls), §6 (View editor modes), §7 (visual system, typography), §11 phase 4, and "Changes made while building phase 3".

## Global Constraints

- Mac-only look is gated on `html[data-platform="macos"]`; markup changes must render the same on other platforms or be gated on `shell.platform() === "macos"`. iOS, Android, web, and the phone layout look unchanged.
- No `light-dark()`; `-webkit-user-select`; Biome zero errors/warnings/infos; tests seen failing first; never bypass the pre-commit hook.
- Fonts: only the weights and styles the blog uses (Crimson Pro variable roman + italic, DM Serif Display 400 roman + italic, JetBrains Mono 400 + 500), Latin subset only. Chrome stays `-apple-system`.
- Semantic icons only; new names go in `iconNames.ts` with their SF Symbol and Lucide twin.
- Small commits; real-app check through `scripts/dev-app.sh`; /par on the diff; ff-merge to main. Never Save & Sync or Publish from the dev app (it shares the real token).

## Review Focus

1. **Write mode typography must not leak into Markdown mode, legacy HTML, or other platforms** (Markdown stays `ui-monospace`; iOS/web keep today's faces). Task 2 tests the scoping.
2. **A row's conflict symbol opens the Conflict sheet for that row without also selecting-and-dismissing things** (it's a sibling of the row button, not nested). Task 3.
3. **View › editor modes titles follow the entry** (Write/Markdown/Live vs Preview/HTML/Live) and disable Live when there's no live URL; choosing one while the editor isn't mounted does nothing. Task 7.
4. **The search field's clear button empties the query and returns focus to the field**; Escape in the field clears it too (the Mac search field convention). Task 5.
5. **Fonts load offline** (bundled, no network): the release build contains the woff2 files and the CSS check still passes. Task 1.

---

### Task 1: Bundle the blog's faces

**Files:** `package.json`, `src/ui/app/fonts.css` (new, imported by `app.css` before the macOS files), `scripts/check-release-css.mjs` (add a check that the three families are declared).

- [ ] `npm install @fontsource-variable/crimson-pro@5.3.0 @fontsource/dm-serif-display@5.3.0 @fontsource/jetbrains-mono@5.3.0`.
- [ ] `fonts.css` imports only the Latin CSS files for the needed weights/styles (check the packages' file names in `node_modules`, e.g. `@fontsource/jetbrains-mono/latin-400.css`).
- [ ] Release check: `npm run build` → `check-release-css` also asserts `@font-face` for "Crimson Pro Variable", "DM Serif Display", "JetBrains Mono" (the families fontsource declares — read them from the package CSS) and that `dist/assets` has their woff2 files.
- [ ] Commit "Bundle the blog's typefaces (Crimson Pro, DM Serif Display, JetBrains Mono)".

### Task 2: Write mode in the blog's typography

**Files:** Create `src/ui/app/app-macos-content.css` (imported last in `app.css`), extend `cssContract.test.ts`.

- [ ] Under `html[data-platform="macos"]`, scoped to the Write editor (`.milkdown .ProseMirror`) and the title field: body Crimson Pro 19px / 1.7, paragraph spacing 1.4em; h2 DM Serif Display 32px, margin 2em 0 0.6em; h3 JetBrains Mono 12px, same margins; code blocks JetBrains Mono 14px / 1.5; inline code 0.92em, `--text` on an 8% label chip; title DM Serif Display 40px, weight 400, letter-spacing -0.025em. Markdown mode (`.cm-content`) uses `ui-monospace`.
- [ ] Tests (cssContract): every rule in the new file is Mac-scoped; the body/title/h2/h3/code declarations carry the spec values; nothing in the new file targets `.cm-content` with a serif.
- [ ] Real-app screenshot of a post in Write mode (light).
- [ ] Commit "Write mode sets the post in the blog's own typography".

### Task 3: Native entry rows

**Files:** `src/ui/app/EntryList.tsx`, `EntryList.test.tsx`, `app-macos-content.css`, `iconNames.ts` (`conflict: exclamationmark.triangle / TriangleAlert` if `syncConflict` isn't reused).

- [ ] macOS rows: title 13px semibold; date 11px secondary; unsaved changes a small dot; legacy HTML "HTML" and draft "Draft" as secondary-label words (no pills); conflict an orange `exclamationmark.triangle`.
- [ ] The conflict symbol is a `button` **beside** the row button (wrap each row in `li.entry-row-item` with the row button and, when conflicted, `button.entry-row-conflict` absolutely positioned at the trailing edge), labeled "Resolve conflict in <title>"; click → `openConflict(path)`. Other platforms keep the pill inside the row.
- [ ] Tests: macOS row shows words not pills; clicking the conflict symbol opens the sheet for that row and leaves the selection alone; ↑/↓ keyboard nav unchanged (existing tests).
- [ ] Commit "macOS entry rows: native indicators; the conflict symbol opens Resolve".

### Task 4: Segmented control

**Files:** `app-macos-content.css`.

- [ ] `.mode-toggle` on macOS: one rounded track (`--bg-hover` fill, 6px radius, 22px tall to fit the toolbar), selected segment raised (`--bg` with a 0 1px 2px shadow), 12px labels, `cursor: default`, no borders between segments.
- [ ] Screenshot light/dark (dark via `resize_window colorScheme` only if available for the dev app; otherwise Jesse's manual list).
- [ ] Commit "macOS segmented control for the editor modes".

### Task 5: Search field

**Files:** `EntryList.tsx` (`EntrySearchBox`), `iconNames.ts` (`search: magnifyingglass / Search`, `clear: xmark.circle.fill / CircleX`), `app-macos-content.css`, test.

- [ ] macOS: rounded field with a leading magnifier symbol; a trailing clear button when non-empty (clears the query, keeps focus in the field); Escape in a non-empty field clears it. Other platforms unchanged.
- [ ] Tests: clear button appears only with text; click clears and focuses; Escape clears; non-Mac has no clear button.
- [ ] Commit "macOS search field: magnifier, clear button, Escape clears".

### Task 6: Date, tags, and the formatting bar

**Files:** `app-macos-content.css`, `src/ui/editor/Toolbar.tsx` (+test), `iconNames.ts` (`bold: bold/Bold`, `italic: italic/Italic`, `code: chevron.left.forwardslash.chevron.right/Code`, `heading: textformat.size/Heading2`, `link: link` (reuse), `image: photo/Image`).

- [ ] Date field: keep `<input type="date">`; macOS border/radius only. Tags: token-field look (rounded tokens, `--bg-hover` fill, 11px).
- [ ] Formatting bar (Markdown mode): on macOS, symbol buttons (`<Icon>` + `aria-label`/`title` with the shortcut, e.g. "Bold (⌘B)"), borderless 28×28 like toolbar buttons; elsewhere today's text labels. The Toolbar gets the platform through a prop (`symbols: boolean`) from `Editor`, which takes it from EditorScreen, so the editor package stays platform-agnostic.
- [ ] Tests: `symbols` renders icons with accessible names; default renders today's labels.
- [ ] Commit "macOS date, tags and formatting bar".

### Task 7: View › editor modes (⌥⌘1–3)

**Files:** Create `src/ui/app/viewModes.ts` (+test). Modify `EditorScreen.tsx` (register), `menuModel.ts` (`viewModeItems(segments)`, command ids `mode1|mode2|mode3`), `menu.ts` / `menuSubmenus.ts` (View items, retitled and re-enabled on change).

**Produces:** `interface ModeSegment { title: string; enabled: boolean; selected: boolean }`; `setViewModes(target: { segments: ModeSegment[]; choose(index: number): void }): () => void`, `getViewModes()`, `subscribeViewModes(fn)`. EditorScreenBody registers its three segments (Write/Markdown/Live or Preview/HTML/Live; Live disabled without a live URL) and updates on change.

- [ ] Tests: registry semantics (like activeEditor); `viewModeItems` titles/enabled for a Markdown entry, a legacy HTML entry, no live URL, nothing registered (all disabled, default titles Write/Markdown/Live); `runMenuCommand("mode3")` chooses segment 3 of the registered target; a sheet open refuses it (existing modal guard).
- [ ] Menu: View gets the three items after Hide/Show Sidebar with `Alt+CmdOrCtrl+1..3`; text and enabled follow `subscribeViewModes`.
- [ ] Commit "View menu: the editor modes with ⌥⌘1–3".

### Phase close

- [ ] Real app: rows, segmented control, search field, formatting bar, Write-mode typography screenshots (light; dark if the environment allows); View ⌥⌘ items listed and switching modes via `app_menu`.
- [ ] Update scenario cards (`docs/superpowers/e2e/phase4-content.md`).
- [ ] /par; fix; execution record; ff-merge to main.
