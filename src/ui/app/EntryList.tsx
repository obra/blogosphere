// ABOUTME: Entry list — grouped by year/month (newest first), or search results;
// ABOUTME: badges, click-to-select, and arrow/Home/End/Enter keyboard nav.
import { type KeyboardEvent, useRef } from "react";
import type { EntryRecord } from "../../core/store/types";
import type { Section } from "../types";
import { formatDisplayDate } from "./format";
import type { YearGroup } from "./grouping";
import { filterBySection, groupByYearMonth, monthGroupLabel } from "./grouping";
import type { BoundAppStore } from "./state";
import { useAppStore, useAppStoreApi } from "./state";
import { EMPTY_CONFLICTS } from "./state.types";

interface EntryRowProps {
  entry: EntryRecord;
  selected: boolean;
  conflicted: boolean;
  registerRow: (path: string, el: HTMLButtonElement | null) => void;
  orderedPaths: string[];
  rowRefs: Map<string, HTMLButtonElement>;
}

function EntryRow(props: EntryRowProps) {
  const store = useAppStoreApi();
  return (
    <button
      type="button"
      className="entry-row"
      data-path={props.entry.path}
      aria-current={props.selected ? "true" : undefined}
      onClick={() => store.getState().select(props.entry.path)}
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

const EMPTY_COPY: Record<Section, string> = {
  drafts: "No drafts. ⌘N starts one.",
  posts: "No posts yet.",
  links: "No link posts. ⌘⇧L captures one.",
  releases: "No releases.",
};

/** Same order the groups render in — the sequence ↑/↓/Home/End walk. */
function flattenGroups(groups: YearGroup[]): EntryRecord[] {
  return groups.flatMap((year) => year.months.flatMap((month) => month.entries));
}

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

interface EntryListGroupsProps {
  groups: YearGroup[];
  selectedPath: string | null;
  conflicts: string[];
  section: Section;
  searching: boolean;
}

function EntryListGroups(props: EntryListGroupsProps) {
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  if (props.groups.length === 0) {
    return (
      <div className="entry-list-empty">
        {props.searching ? "No matches." : EMPTY_COPY[props.section]}
      </div>
    );
  }

  const orderedPaths = flattenGroups(props.groups).map((entry) => entry.path);
  function registerRow(path: string, el: HTMLButtonElement | null): void {
    if (el) {
      rowRefs.current.set(path, el);
    } else {
      rowRefs.current.delete(path);
    }
  }

  return (
    <div className="entry-list-scroll">
      {props.groups.map((year) => (
        <div key={year.key}>
          <div className="entry-list-year">{year.key}</div>
          {year.months.map((month) => (
            <div key={month.key}>
              <div className="entry-list-month">{monthGroupLabel(month.key)}</div>
              {month.entries.map((entry) => (
                <EntryRow
                  key={entry.path}
                  entry={entry}
                  selected={entry.path === props.selectedPath}
                  conflicted={props.conflicts.includes(entry.path)}
                  registerRow={registerRow}
                  orderedPaths={orderedPaths}
                  rowRefs={rowRefs.current}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EntrySearchBox() {
  const store = useAppStoreApi();
  const query = useAppStore((state) => state.searchQuery);
  return (
    <div className="entry-list-search">
      <input
        type="search"
        placeholder="Search"
        value={query}
        onChange={(event) => store.getState().setSearchQuery(event.currentTarget.value)}
        aria-label="Search entries"
      />
    </div>
  );
}

function EntryList() {
  const section = useAppStore((state) => state.section);
  const entries = useAppStore((state) => state.entries);
  const searchResults = useAppStore((state) => state.searchResults);
  const selectedPath = useAppStore((state) => state.selectedPath);
  const conflicts = useAppStore((state) => state.syncStatus?.conflicts ?? EMPTY_CONFLICTS);

  const visible = filterBySection(searchResults ?? entries, section);
  const groups = groupByYearMonth(visible);

  return (
    <div className="entry-list-pane pane">
      <EntrySearchBox />
      <EntryListGroups
        groups={groups}
        selectedPath={selectedPath}
        conflicts={conflicts}
        section={section}
        searching={searchResults !== null}
      />
    </div>
  );
}

export { EntryList };
