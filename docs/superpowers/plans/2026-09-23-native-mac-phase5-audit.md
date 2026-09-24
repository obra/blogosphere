# Native Mac Redesign — Phase 5 (Audit Pass) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix what the apple-design review of the finished app found, so a Mac user using it daily would never guess it's web tech.

**Architecture:** Small, independent fixes: CSS under `html[data-platform="macos"]`, a CodeMirror highlight style built from the app's tokens, and a few component changes. Each fix is its own commit with a test where behavior or a contract changes.

**Spec:** `docs/superpowers/specs/2026-09-23-native-mac-redesign-design.md` §11 phase 5 ("apple-design review of the result; fix findings").

**Audit (2026-09-23, apple-design skill, live screenshots + CSS):** rating "Critical issues" because of one Critical (below); otherwise Good. Already fixed on this branch: SF Symbols drawn as solid squares on first mount (WebKit didn't repaint a `var()`-driven mask).

## Global Constraints

- Mac-only look stays gated on `html[data-platform="macos"]`. Exceptions, because they're bugs everywhere: the source-editor highlight colors (dark-mode contrast) and the title that truncates.
- Biome clean; tests seen failing first; never bypass the hook; small commits; split files by responsibility before they sprawl.

## Review Focus

1. Dark mode contrast in Markdown and HTML source modes (links, strings, comments) ≥ 4.5:1: highlight colors come from tokens, never hex.
2. A long title wraps and stays editable; Return moves to the body instead of adding a newline; pasted newlines become spaces.
3. Reduce Motion stops the sheet's slide on macOS.

## Execution record (2026-09-23)

Tasks 1–8 as planned, with these changes. The title field moved into `TitleField.tsx`, `EditorDocument.tsx` split out of EditorScreen, and `focusEditorSurface` into `editorFocus.ts`. The highlight style lives in `sourceEditorHighlight.ts`. The Activity popover's styles all moved into `app-macos-surfaces.css`. Task 7's status line reads "Draft · Saved to GitHub" beside Publish, mirroring "Published · ".

Found live: SF Symbols drawn as solid squares on first mount, because WebKit doesn't repaint a `var()`-driven mask. The webview snapshot hid this; a real window capture showed it.

Verified live:
- Symbol rendering and toolbar glyphs.
- Inset rows.
- Title wrapping and Return moving to the body.
- The popover arrow's center matches the sync button's center (1042px, measured).
- A draft's status and tooltip.
- Log times to the minute.

Not verified live, left for Jesse:
- Real IME entry in the title (secure input blocked keystrokes).
- Dark mode and Increase Contrast.
- Reduce Motion.
- A real conflict badge.
- Window captures after the screen locked.

Code review (/par) findings, all fixed:
- Return after confirming an IME candidate left the title, because WebKit fires `compositionend` before the Enter keydown. Now a keyCode 229 check plus a 100ms window.
- A multi-line paste didn't land at the caret. Now it does.
- The title didn't re-measure when a web font loaded, or keep the scroll position while measuring.
- Syntax text used the person's accent color, which isn't guaranteed to be readable. Now a fixed readable blue: `LinkText` on macOS.
- The highlight test checked a copy of the extension list. Now it goes through the real editor's `buildExtensions`.
- The Markdown line padding clipped the caret and reached Write-mode code blocks.
- The error badge's digits were unreadable.
- The idle sync glyph wasn't primary label.
- The popover arrow was clamped 4px off the button's center. Now the popover shifts clear of its corner.
- The save tooltip named "Sync Now", a menu item that phones don't have. Now it names the sync button.
- The macOS log-time test didn't prove the seconds were gone.
- Stale stylesheet comments.

---

### Task 1 (Critical): Source-mode highlight colors from tokens

**Files:** `src/ui/editor/sourceEditorSetup.ts` (+test).
- [ ] An app `HighlightStyle` (via `@lezer/highlight` tags) passed to `syntaxHighlighting` after `minimalSetup`, colors as CSS variables: url `var(--text-muted)`, link `var(--accent)`, heading weight 600 no underline, string/comment/meta `var(--text-muted)`, processingInstruction `var(--text-faint)`, emphasis italic, strong 600. `.cm-specialChar` → `var(--text-faint)`.
- [ ] Test: the extension list contains the app style; no highlight rule carries a hex color.
- [ ] Commit.

### Task 2 (High): The title wraps

**Files:** `EditorFieldControls.tsx` (`TitleField` → auto-growing `textarea rows={1}`), `app-editor.css` (resize none, overflow hidden, no ellipsis), test.
- [ ] Return / Enter focuses the body (`focusEditorSurface`); newlines in pasted text become spaces; the height follows content (`scrollHeight`) on value change.
- [ ] Tests: typing keeps one line of value; Enter doesn't insert a newline and moves focus; pasted "a\nb" becomes "a b".
- [ ] Commit.

### Task 3 (High): Contrast and motion

**Files:** `app-macos-controls.css` / `app-macos-chrome.css` / `app-macos-surfaces.css`, cssContract tests.
- [ ] Year headers `.entry-list-year` → `var(--text-muted)` on macOS.
- [ ] Conflict badge on the sync button: black digits on orange (9.5:1).
- [ ] `@media (prefers-reduced-motion: reduce)` macOS sheet: `animation: none`.
- [ ] Commit(s).

### Task 4 (Medium): Native list rows and buttons

**Files:** `app-macos-controls.css`, `app-macos-chrome.css`.
- [ ] Entry rows inset 8px with 6px radius (like the sidebar); year/month headers aligned to the inset; no hover fill on rows, sidebar items, or `.btn` on macOS.
- [ ] Commit.

### Task 5 (Medium): Toolbar symbols

**Files:** `iconNames.ts`, `app-macos-chrome.css`.
- [ ] `more` → `ellipsis`, `syncPending` → `arrow.up`; toolbar glyphs `var(--text)`.
- [ ] Commit.

### Task 6 (Medium): Activity popover

**Files:** `SyncStatusButton.tsx`, `popoverPlacement.ts` (+test), `SyncLogList.tsx`, CSS.
- [ ] An arrow pointing at the button (placement already knows the anchor's x; expose `arrowX`); `.sync-log-list` min-height 0 inside the popover; log times `hour: numeric, minute: 2-digit` (reuse `clockTime`).
- [ ] Tests: `popoverPlacement` returns the arrow offset, clamped inside the popover; times format.
- [ ] Commit.

### Task 7 (Medium): Fields, Increase Contrast, wording, status

**Files:** `app-macos-surfaces.css`, `app-macos-controls.css`, `SettingsSections.tsx`, `saveStateLabel.ts` / `EditorBar.tsx` (+tests).
- [ ] macOS text fields in sheets and Settings: `var(--bg)` with a `--border-strong` hairline.
- [ ] `prefers-contrast: more`: search field, segmented track, date field get a `--border-strong` inset border.
- [ ] Title case: "Save Templates"; "Replace Token…" as a push button.
- [ ] macOS toolbar status drops "· not public" when the Publish button is showing (it says "draft" already).
- [ ] Commit(s).

### Task 8 (Low): Markdown alignment

- [ ] `.cm-line` padding aligned with the title on macOS.

### Close

- [ ] Real-app screenshots after (window capture via `screencapture -l`), light; dark through CSS review.
- [ ] Short re-audit of the changed surfaces; /par on the diff; fix; ff-merge; execution record.
