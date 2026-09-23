// ABOUTME: One entry in the list: its button (title, date, indicators), its
// ABOUTME: context menu on macOS, and the arrow/Home/End/Enter keys between rows.
import { type KeyboardEvent, type MouseEvent, useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import { Icon } from "../icons/Icon";
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

/** Today's badges: dot for unsaved changes, pills for HTML, Draft, Conflict. */
function RowMeta(props: { entry: EntryRecord; conflicted: boolean; mac: boolean }) {
  const { entry, mac } = props;
  // macOS says these as secondary-label words (the conflict has its own
  // symbol beside the row); elsewhere they stay pills.
  const tag = (kind: string, text: string, title?: string) =>
    mac ? (
      <span className="entry-row-word" data-kind={kind} title={title}>
        {text}
      </span>
    ) : (
      <span className="pill-badge" data-kind={kind} title={title}>
        {text}
      </span>
    );
  return (
    <span className="entry-row-meta">
      {formatDisplayDate(entry.date)}
      {entry.path.endsWith(".html") ? tag("html", "HTML", "Legacy HTML post") : null}
      {entry.draft ? tag("draft", "Draft") : null}
      {props.conflicted && !mac ? tag("conflict", "Conflict") : null}
      {/* macOS shows the conflict as a symbol beside the row; the row still
          says it, for VoiceOver. */}
      {props.conflicted && mac ? <span className="visually-hidden">Conflict</span> : null}
    </span>
  );
}

type RowContextMenu = ReturnType<typeof useRowContextMenu>;

function RowButton(props: EntryRowProps & { mac: boolean; contextMenu: RowContextMenu }) {
  const store = useAppStoreApi();
  const { contextMenu } = props;
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
        <RowMeta entry={props.entry} conflicted={props.conflicted} mac={props.mac} />
      </span>
    </button>
  );
}

/** macOS: the conflict symbol beside a row (a button can't sit inside the
 *  row's button). Out of the Tab order: ↑/↓ stay on rows, and the editor's
 *  Resolve… bar is the keyboard way in. */
function ConflictSymbol(props: { entry: EntryRecord; contextMenu: RowContextMenu }) {
  const store = useAppStoreApi();
  return (
    <button
      type="button"
      className="entry-row-conflict"
      tabIndex={-1}
      onContextMenu={props.contextMenu.onContextMenu}
      aria-label={`Resolve conflict in ${props.entry.title || "Untitled"}`}
      title="Resolve conflict…"
      onClick={() => store.getState().openConflict(props.entry.path)}
    >
      <Icon name="syncConflict" size={13} />
    </button>
  );
}

function EntryRow(props: EntryRowProps) {
  const mac = useServices().shell.platform() === "macos";
  const contextMenu = useRowContextMenu(props.entry.path);
  if (!mac) {
    return <RowButton {...props} mac={false} contextMenu={contextMenu} />;
  }
  return (
    <div
      className="entry-row-item"
      data-selected={props.selected ? "true" : undefined}
      data-conflicted={props.conflicted ? "true" : undefined}
    >
      <RowButton {...props} mac={true} contextMenu={contextMenu} />
      {props.conflicted ? <ConflictSymbol entry={props.entry} contextMenu={contextMenu} /> : null}
    </div>
  );
}

export { EntryRow };
