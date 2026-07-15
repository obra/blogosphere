// ABOUTME: Entry list — grouped by year/month (newest first), or search
// ABOUTME: results; dirty/draft/conflict badges. Search input debounces via state.ts.
import type { EntryRecord } from "../../core/store/types";
import { formatDisplayDate } from "./format";
import { filterBySection, groupByYearMonth, monthGroupLabel } from "./grouping";
import { useAppStore, useAppStoreApi } from "./state";
import { EMPTY_CONFLICTS } from "./state.types";

interface EntryRowProps {
  entry: EntryRecord;
  selected: boolean;
  conflicted: boolean;
}

function EntryRow(props: EntryRowProps) {
  const store = useAppStoreApi();
  return (
    <button
      type="button"
      className="entry-row"
      aria-current={props.selected ? "true" : undefined}
      onClick={() => store.getState().select(props.entry.path)}
    >
      <span className="entry-row-badges">
        {props.entry.dirty ? (
          <span className="dot-badge" data-kind="dirty" title="Unsaved changes" />
        ) : null}
      </span>
      <span className="entry-row-body">
        <span className="entry-row-title">{props.entry.title ?? "Untitled"}</span>
        <span className="entry-row-meta">
          {formatDisplayDate(props.entry.date)}
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

interface EntryListGroupsProps {
  entries: EntryRecord[];
  selectedPath: string | null;
  conflicts: string[];
}

function EntryListGroups(props: EntryListGroupsProps) {
  const groups = groupByYearMonth(props.entries);
  if (groups.length === 0) {
    return <div className="entry-list-empty">Nothing here yet.</div>;
  }
  return (
    <div className="entry-list-scroll">
      {groups.map((year) => (
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

  return (
    <div className="entry-list-pane pane">
      <EntrySearchBox />
      <EntryListGroups entries={visible} selectedPath={selectedPath} conflicts={conflicts} />
    </div>
  );
}

export { EntryList };
