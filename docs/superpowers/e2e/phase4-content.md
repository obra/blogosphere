# Scenario cards: native Mac phase 4 (content)

Same setup as `phase3-surfaces.md`: `scripts/dev-app.sh`, `scripts/tauri-mcp.sh`
for the webview, computer-use `app_*` for menus. Webview screenshots
(`webview-screenshot`) are the reliable way to look at small symbols;
background window captures blur them.

## 1. Write mode typography

1. Select a published post, Write mode. `getComputedStyle` of
   `.ProseMirror p` → "Crimson Pro Variable" 19px, line-height ≈ 32.3px;
   the title → "DM Serif Display" 40px; an h2 (if the post has one) →
   DM Serif Display 32px, weight 400.
2. View › Markdown → `.editor-doc[data-editor-mode="markdown"]`; the title is
   `-apple-system`, the body `ui-monospace`.
3. `document.fonts` lists Crimson Pro Variable and DM Serif Display as loaded,
   with the network off (fonts are bundled).

## 2. Entry rows

1. Drafts: each row shows "Draft" as a word (no pill); a row with unsaved
   changes has an orange dot in the gutter and its title lines up with the
   others.
2. Manual (needs a real conflict): the orange triangle at a conflicted row's
   trailing edge opens the Conflict sheet for that row; on a focused
   selection it turns white.

## 3. Toolbar controls

1. The segmented control is one rounded track with the selected segment
   raised, in light and dark (dark: manual).
2. The search field has a magnifier; typing shows exactly one clear button;
   clicking it (manual) or Escape clears the list's search.

## 4. Formatting bar and fields

1. Markdown mode: the bar shows six symbols (B, I, </>, aA, link, photo);
   hovering Bold shows "Bold ⌘B".
2. The date field and tag tokens use the tinted macOS look.

## 5. View › editor modes

1. `app_menu list: "View"` → … Hide Sidebar, Write, Markdown, Live, … (⌃⌘1–3).
2. On a legacy HTML entry the items read Preview, HTML, Live.
3. On a draft without a secret link, Live is disabled.
4. `app_menu path: ["View", "Markdown"]` switches the editor.
