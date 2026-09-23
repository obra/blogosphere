# Scenario cards: native Mac phase 3 (surfaces)

Run against `scripts/dev-app.sh` (the signed debug bundle "Blogosphere Dev",
its own database) with `scripts/tauri-mcp.sh` for the webviews and the
computer-use `app_*` tools for native menus and windows. The dev app shares
the real GitHub token: never Save & Sync or Publish from it unless the point
of the card is to push.

Webview JS goes through `scripts/tauri-mcp.sh webview-execute-js --script
"(() => …)()"` (an expression; `--window-id settings` for the Settings
window).

## 1. Menu bar

1. `app_menu list: null` → Apple, Blogosphere Dev, File, Entry, Edit, Format,
   View, Window, Help.
2. `app_menu list: "Entry"` → Publish…, Open on Site, Versions…, Copy Secret
   Link, Discard Changes…, Delete….
3. Straight after launch, `app_menu path: ["Entry", "Versions…"]` → the
   Versions sheet opens for the restored selection (the Entry menu caught up
   with the selection restored during launch). Close it.
4. `app_menu path: ["Edit", "Find", "Search Entries"]` → `document.activeElement`
   is the "Search entries" field.
5. `app_menu list: "Window"` → includes the open window's title (the menu has
   the Window role).

## 2. Format menu

1. Select a draft, choose Markdown, focus `.cm-content`.
2. `app_menu path: ["Format", "Bold"]` → the body changes (`**` inserted or
   the selection wrapped).
3. Manual (synthetic keys are blocked while any app holds secure input):
   ⌘B / ⌘I / ⌘E in Write and in Markdown each toggle exactly once.
4. Focus the title field: the Format items are disabled.

## 3. Sheets

1. With a draft selected, `app_menu path: ["Entry", "Publish…"]` → a
   `[role=dialog][aria-label=Publish]` appears, and `document.activeElement`
   is its "Publish date" field.
2. `app_menu path: ["File", "New Draft"]` → nothing changes (draft count the
   same); the sheet is modal.
3. Dispatch Escape (`document.body.dispatchEvent(new KeyboardEvent("keydown",
   {key: "Escape", bubbles: true, cancelable: true}))`) → the sheet closes.

## 4. Context menus (manual: background automation can't open them)

1. Right-click an entry row that isn't selected → Open on Site, Copy Secret
   Link, Publish…, Delete…; the row gets an accent outline while the menu is
   up; the selection doesn't move.
2. Right-click Drafts → New Post; Links → New Link…; Releases → no menu.

## 5. Settings window

1. `app_menu path: ["Blogosphere Dev", "Settings…"]` → `app_list_windows`
   shows "Blogosphere Settings" (500 wide).
2. In the Settings window: `.settings-window` scrollHeight equals
   `innerHeight` (sized to its content).
3. Choose Settings… again → still exactly one Settings window.
4. Change the New post template, Save templates, `location.reload()` → the
   field comes back with the new value (the main window stored it). Put it
   back.
5. The Settings window can't call what it wasn't granted: `innerSize` works,
   anything else (e.g. `outerPosition`) is refused.
6. Close the main window (its close button) with Settings open → the app
   quits.

## 6. Notices (manual: needs a real push, or a failure)

1. ⌘S with a change → "Saved."-style HUD at the bottom center for about 2s.
2. A failed action (e.g. delete while the disk is full) → a native alert
   with Try Again and Cancel; Escape cancels.
3. After a push: the Activity popover says "Deploying…", then "Live at …".
