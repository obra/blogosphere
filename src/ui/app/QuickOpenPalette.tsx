// ABOUTME: ⌘K quick-open — fuzzy jump to any entry by title, plus a fixed
// ABOUTME: group of always-available commands (new draft/link, sync, log).
import type { KeyboardEvent } from "react";
import { useState } from "react";
import type { EntryRecord } from "../../core/store/types";
import { formatDisplayDate } from "./format";
import type { FuzzyCandidate } from "./fuzzyMatch";
import { rankByFuzzyMatch } from "./fuzzyMatch";
import { sectionForEntry } from "./grouping";
import type { BoundAppStore } from "./state";
import { useAppStore, useAppStoreApi } from "./state";

const MAX_RESULTS = 10;

/** A row the palette can render and activate — an entry jump or a command —
 *  normalized to one shape so keyboard nav and rendering don't care which. */
interface QuickOpenRow {
  key: string;
  title: string;
  meta: string | null;
  activate: () => void;
}

interface Command {
  key: string;
  label: string;
  run: (store: BoundAppStore) => void;
}

/** Fixed, always-available shortcuts shown below the fuzzy-matched entries —
 *  the same store actions the native File/View menus invoke (see menu.ts). */
const COMMANDS: Command[] = [
  {
    key: "new-draft",
    label: "New Draft",
    run: (store) => store.getState().newDraft({ title: "" }),
  },
  { key: "new-link", label: "New Link…", run: (store) => store.getState().openNewLinkDialog() },
  { key: "sync-now", label: "Sync Now", run: (store) => store.getState().syncNow() },
  { key: "activity-log", label: "Activity Log", run: (store) => store.getState().openSyncLog() },
];

function matchEntries(entries: EntryRecord[], query: string): EntryRecord[] {
  const candidates: FuzzyCandidate<EntryRecord>[] = entries
    .filter((entry) => !entry.deleted)
    .map((entry) => ({ item: entry, text: entry.title || "Untitled", updatedAt: entry.updatedAt }));
  return rankByFuzzyMatch(query, candidates).slice(0, MAX_RESULTS);
}

function entryToRow(entry: EntryRecord, store: BoundAppStore): QuickOpenRow {
  return {
    key: entry.path,
    title: entry.title || "Untitled",
    meta: formatDisplayDate(entry.date),
    activate: () => {
      store.getState().setSection(sectionForEntry(entry));
      store.getState().select(entry.path);
    },
  };
}

function commandToRow(command: Command, store: BoundAppStore): QuickOpenRow {
  return { key: command.key, title: command.label, meta: null, activate: () => command.run(store) };
}

function clampIndex(index: number, length: number): number {
  if (length === 0) {
    return -1;
  }
  return Math.min(Math.max(index, 0), length - 1);
}

/** Bundles the bits `handleKeyDown` needs so the factory stays a single,
 *  narrow parameter instead of five positional ones. */
interface KeyNavState {
  rows: QuickOpenRow[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  pick: (row: QuickOpenRow) => void;
  close: () => void;
}

function makeKeyDownHandler(nav: KeyNavState): (event: KeyboardEvent<HTMLDivElement>) => void {
  return (event) => {
    if (event.key === "Escape") {
      nav.close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nav.setActiveIndex(clampIndex(nav.activeIndex + 1, nav.rows.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nav.setActiveIndex(clampIndex(nav.activeIndex - 1, nav.rows.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const active = nav.rows[clampIndex(nav.activeIndex, nav.rows.length)];
      if (active) {
        nav.pick(active);
      }
    }
  };
}

interface RowListProps {
  rows: QuickOpenRow[];
  activeKey: string | null;
  onHover: (key: string) => void;
  onPick: (row: QuickOpenRow) => void;
}

function RowList(props: RowListProps) {
  return (
    <ul className="quick-open-results">
      {props.rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            className="quick-open-row"
            data-active={row.key === props.activeKey ? "true" : undefined}
            onMouseEnter={() => props.onHover(row.key)}
            onClick={() => props.onPick(row)}
          >
            {row.title}
            {row.meta === null ? null : <span className="quick-open-meta">{row.meta}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

interface QuickOpenDialogProps {
  query: string;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onClose: () => void;
  entryRows: QuickOpenRow[];
  commandRows: QuickOpenRow[];
  activeKey: string | null;
  onHover: (key: string) => void;
  onPick: (row: QuickOpenRow) => void;
}

/** Presentational shell: the backdrop, the dialog frame, and its three
 *  sections (search input, entry results, commands). All behavior lives in
 *  QuickOpenPalette — this just lays the pieces out. */
function QuickOpenDialog(props: QuickOpenDialogProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss, same affordance as SettingsScreen.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handling lives on the dialog below.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same backdrop affordance as above.
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: dialog-level keyboard nav (arrows/Enter/Escape) */}
      <div
        className="dialog quick-open"
        role="dialog"
        aria-label="Quick open"
        onKeyDown={props.onKeyDown}
      >
        <input
          type="text"
          className="quick-open-input"
          placeholder="Jump to a post…"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          aria-label="Jump to a post"
          // biome-ignore lint/a11y/noAutofocus: a command palette exists to be typed into the instant it opens.
          autoFocus={true}
        />
        {props.entryRows.length === 0 ? (
          <p className="quick-open-empty">No matching entries.</p>
        ) : (
          <RowList
            rows={props.entryRows}
            activeKey={props.activeKey}
            onHover={props.onHover}
            onPick={props.onPick}
          />
        )}
        <div className="quick-open-group-label">Commands</div>
        <RowList
          rows={props.commandRows}
          activeKey={props.activeKey}
          onHover={props.onHover}
          onPick={props.onPick}
        />
      </div>
    </div>
  );
}

function QuickOpenPalette() {
  const store = useAppStoreApi();
  const open = useAppStore((state) => state.quickOpenOpen);
  const entries = useAppStore((state) => state.entries);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  if (!open) {
    return null;
  }

  const entryRows = matchEntries(entries, query).map((entry) => entryToRow(entry, store));
  const commandRows = COMMANDS.map((command) => commandToRow(command, store));
  const rows = [...entryRows, ...commandRows];
  const activeKey = rows[clampIndex(activeIndex, rows.length)]?.key ?? null;

  function close() {
    store.getState().closeQuickOpen();
    setQuery("");
    setActiveIndex(0);
  }

  function pick(row: QuickOpenRow) {
    row.activate();
    close();
  }

  function handleHover(key: string) {
    const index = rows.findIndex((row) => row.key === key);
    if (index !== -1) {
      setActiveIndex(index);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
  }

  const handleKeyDown = makeKeyDownHandler({ rows, activeIndex, setActiveIndex, pick, close });

  return (
    <QuickOpenDialog
      query={query}
      onQueryChange={handleQueryChange}
      onKeyDown={handleKeyDown}
      onClose={close}
      entryRows={entryRows}
      commandRows={commandRows}
      activeKey={activeKey}
      onHover={handleHover}
      onPick={pick}
    />
  );
}

export { QuickOpenPalette };
