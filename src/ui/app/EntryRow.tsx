// ABOUTME: One entry in the list: its button (title, date, indicators), its
// ABOUTME: context menu on macOS, and the arrow/Home/End/Enter keys between rows.
import { type KeyboardEvent, type MouseEvent, useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import { formatDisplayDate } from "./format";
import { entryLiveUrl } from "./liveUrl";
import { entryRowItems, runMenuCommand } from "./menuModel";
import { popupMenu } from "./menuPopup";
import { useServices } from "./ServicesContext";
import type { BoundAppStore } from "./state";
import { useAppStoreApi } from "./state";

/** Enter's target: whichever editor surface is actually mounted (WYSIWYG's
 *  Milkdown ProseMirror root, or source mode's CodeMirror content). */
function focusEditorSurface(): void {
  document.querySelector<HTMLElement>(".milkdown .ProseMirror, .cm-content")?.focus();
}

function nextIndexForKey(key: string, currentIndex: number, lastIndex: number): number | null {
  switch (key) {
    case "ArrowDown":
      return Math.min(currentIndex + 1, lastIndex);
    case "ArrowUp":
      return Math.max(currentIndex - 1, 0);
    case "Home":
      return 0;
    case "End":
      return lastIndex;
    default:
      return null;
  }
}

/** Bound directly to each row button — never the search input, so it never
 *  needs to fight that input's own Home/End/arrow-key text-cursor behavior. */
function handleRowKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  orderedPaths: string[],
  rowRefs: Map<string, HTMLButtonElement>,
  store: BoundAppStore,
): void {
  if (event.key === "Enter") {
    event.preventDefault();
    focusEditorSurface();
    return;
  }
  const currentIndex = orderedPaths.indexOf(event.currentTarget.dataset.path ?? "");
  const nextIndex = nextIndexForKey(event.key, currentIndex, orderedPaths.length - 1);
  const nextPath = nextIndex === null ? undefined : orderedPaths[nextIndex];
  if (nextPath === undefined) {
    return;
  }
  event.preventDefault();
  store.getState().select(nextPath);
  rowRefs.get(nextPath)?.focus();
}

interface EntryRowProps {
  entry: EntryRecord;
  selected: boolean;
  conflicted: boolean;
  registerRow: (path: string, el: HTMLButtonElement | null) => void;
  orderedPaths: string[];
  rowRefs: Map<string, HTMLButtonElement>;
}

/** macOS: right-click opens the row's own menu, acting on this row whatever
 *  is selected. The row keeps an outline (Finder's context ring) while the
 *  menu is up. Elsewhere, right-click is left to the platform. */
function useRowContextMenu(path: string) {
  const store = useAppStoreApi();
  const services = useServices();
  const [menuOpen, setMenuOpen] = useState(false);
  if (services.shell.platform() !== "macos") {
    return { menuOpen: false, onContextMenu: undefined };
  }
  return {
    menuOpen,
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      // Search results are a snapshot; the menu's enable rules must see the
      // entry as it is now, like the Entry menu does.
      const current = store.getState().entries.find((e) => e.path === path);
      if (!current) {
        return;
      }
      setMenuOpen(true);
      popupMenu(
        "entryRow",
        entryRowItems(current, entryLiveUrl(services.model, current)),
        (id) => runMenuCommand(id, store, path),
        { x: event.clientX, y: event.clientY },
      ).finally(() => setMenuOpen(false));
    },
  };
}

function EntryRow(props: EntryRowProps) {
  const store = useAppStoreApi();
  const contextMenu = useRowContextMenu(props.entry.path);
  return (
    <button
      type="button"
      className="entry-row"
      data-path={props.entry.path}
      data-context={contextMenu.menuOpen ? "true" : undefined}
      onContextMenu={contextMenu.onContextMenu}
      aria-current={props.selected ? "true" : undefined}
      onClick={(event) => {
        // WebKit doesn't focus a button on click; the list's focused-selection
        // look (accent + white text on macOS) keys off focus being inside it.
        event.currentTarget.focus();
        store.getState().select(props.entry.path);
      }}
      onKeyDown={(event) => handleRowKeyDown(event, props.orderedPaths, props.rowRefs, store)}
      ref={(el) => props.registerRow(props.entry.path, el)}
    >
      <span className="entry-row-badges">
        {props.entry.dirty ? (
          <span className="dot-badge" data-kind="dirty" title="Unsaved changes" />
        ) : null}
      </span>
      <span className="entry-row-body">
        <span className="entry-row-title">{props.entry.title || "Untitled"}</span>
        <span className="entry-row-meta">
          {formatDisplayDate(props.entry.date)}
          {props.entry.path.endsWith(".html") ? (
            <span className="pill-badge" data-kind="html" title="Legacy HTML post">
              HTML
            </span>
          ) : null}
          {props.entry.draft ? (
            <span className="pill-badge" data-kind="draft">
              Draft
            </span>
          ) : null}
          {props.conflicted ? (
            <span className="pill-badge" data-kind="conflict">
              Conflict
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

export { EntryRow };
