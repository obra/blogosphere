// ABOUTME: ⌘K quick-open — fuzzy jump to any entry by title, plus commands.
// ABOUTME: CONTRACT STUB: feature B replaces the internals (see contracts doc).
import { useState } from "react";
import { sectionForEntry } from "./grouping";
import { useAppStore, useAppStoreApi } from "./state";

const MAX_RESULTS = 8;

// Feature B requirements: fuzzy matching (own scorer module + tests, not
// substring), ↑/↓ selection, Enter opens, Escape closes, top commands (New
// Draft, New Link, Sync Now, Publish…) below entry results, recent-first
// ordering on empty query, match highlighting. Keep the store contract:
// quickOpenOpen + closeQuickOpen + select/setSection.
function QuickOpenPalette() {
  const store = useAppStoreApi();
  const open = useAppStore((state) => state.quickOpenOpen);
  const entries = useAppStore((state) => state.entries);
  const [query, setQuery] = useState("");
  if (!open) {
    return null;
  }
  const q = query.trim().toLowerCase();
  const matches = entries
    .filter((entry) => !entry.deleted && (entry.title ?? "").toLowerCase().includes(q))
    .slice(0, MAX_RESULTS);
  const pick = (path: string) => {
    const record = entries.find((entry) => entry.path === path);
    if (record) {
      store.getState().setSection(sectionForEntry(record));
      store.getState().select(path);
    }
    store.getState().closeQuickOpen();
    setQuery("");
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss, same affordance as SettingsScreen.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handling lives on the dialog below.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same backdrop affordance as above.
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          store.getState().closeQuickOpen();
        }
      }}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: dialog-level Escape shortcut */}
      <div
        className="dialog quick-open"
        role="dialog"
        aria-label="Quick open"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            store.getState().closeQuickOpen();
          }
          if (event.key === "Enter" && matches[0]) {
            pick(matches[0].path);
          }
        }}
      >
        <input
          type="text"
          className="quick-open-input"
          placeholder="Jump to a post…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          aria-label="Quick open"
          // biome-ignore lint/a11y/noAutofocus: a command palette exists to be typed into the instant it opens.
          autoFocus={true}
        />
        <ul className="quick-open-results">
          {matches.map((entry) => (
            <li key={entry.path}>
              <button type="button" className="quick-open-row" onClick={() => pick(entry.path)}>
                {entry.title || "Untitled"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { QuickOpenPalette };
