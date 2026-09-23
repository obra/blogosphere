// ABOUTME: Entry list — grouped by year/month (newest first), or search results,
// ABOUTME: with its search box and empty states. Each row is an EntryRow.
import { useRef } from "react";
import type { EntryRecord } from "../../core/store/types";
import type { Section } from "../types";
import { EntryRow } from "./EntryRow";
import type { YearGroup } from "./grouping";
import { filterBySection, groupByYearMonth, monthGroupLabel } from "./grouping";
import { ComposeButton, SidebarToggleButton, ToolbarRow } from "./MacToolbar";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";
import { EMPTY_CONFLICTS } from "./state.types";

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

/** macOS: the list couldn't be read and there's nothing to show. Said here,
 *  in place, rather than in an alert at launch. */
function EntriesLoadFailed() {
  const store = useAppStoreApi();
  return (
    <div className="entry-list-empty">
      <p>Couldn't load your entries.</p>
      <button type="button" className="btn" onClick={() => store.getState().refresh()}>
        Try Again
      </button>
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
  const mac = useServices().shell.platform() === "macos";
  const loadFailed = useAppStore((state) => state.entriesLoadFailed);
  const sidebarHidden = useAppStore((state) => mac && state.sidebarHidden);

  const visible = filterBySection(searchResults ?? entries, section);
  const groups = groupByYearMonth(visible);

  return (
    <div className="entry-list-pane pane">
      {mac ? (
        <ToolbarRow leadingInset={sidebarHidden}>
          {sidebarHidden ? <SidebarToggleButton /> : null}
          <EntrySearchBox />
          <ComposeButton />
        </ToolbarRow>
      ) : (
        <EntrySearchBox />
      )}
      {mac && loadFailed && entries.length === 0 ? (
        <EntriesLoadFailed />
      ) : (
        <EntryListGroups
          groups={groups}
          selectedPath={selectedPath}
          conflicts={conflicts}
          section={section}
          searching={searchResults !== null}
        />
      )}
    </div>
  );
}

export { EntryList };
