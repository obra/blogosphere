// ABOUTME: The activity log — a dialog listing what sync actually did (pushes
// ABOUTME: with paths, pulls, validation skips, conflicts, errors), newest first.
import type { SyncLogEntry } from "../../core/sync/types";
import { useAppStore, useAppStoreApi } from "./state";

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function LogRow(props: { entry: SyncLogEntry }) {
  const { entry } = props;
  return (
    <li className="sync-log-row" data-level={entry.level}>
      <span className="sync-log-dot" aria-hidden="true" />
      <div className="sync-log-body">
        <div className="sync-log-line">
          <span className="sync-log-message">{entry.message}</span>
          <time className="sync-log-time">{timeLabel(entry.at)}</time>
        </div>
        {entry.detail ? <pre className="sync-log-detail">{entry.detail}</pre> : null}
      </div>
    </li>
  );
}

function LogList() {
  const log = useAppStore((state) => state.syncLog);
  if (log.length === 0) {
    return (
      <p className="settings-hint">
        Nothing yet. Every sync, push, pull, and problem will show up here.
      </p>
    );
  }
  const newestFirst = [...log].reverse();
  return (
    <ul className="sync-log-list">
      {newestFirst.map((entry, i) => (
        // Log entries are append-only and render newest-first; index against
        // the reversed snapshot is stable for a given array identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: entries carry no id; list is replaced wholesale on change.
        <LogRow key={`${entry.at}-${i}`} entry={entry} />
      ))}
    </ul>
  );
}

function SyncLogPanel() {
  const store = useAppStoreApi();
  const open = useAppStore((state) => state.syncLogOpen);
  if (!open) {
    return null;
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss, same affordance as SettingsScreen.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handling lives on the dialog below.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same backdrop affordance as above.
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          store.getState().closeSyncLog();
        }
      }}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: dialog-level Escape shortcut */}
      <div
        className="dialog sync-log-panel"
        role="dialog"
        aria-label="Activity log"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            store.getState().closeSyncLog();
          }
        }}
      >
        <header className="settings-header">
          <h2>Activity</h2>
          <div className="sync-log-header-actions">
            <button type="button" className="btn" onClick={() => store.getState().syncNow()}>
              Sync now
            </button>
            <button
              type="button"
              className="sidebar-icon-button"
              onClick={() => store.getState().closeSyncLog()}
              aria-label="Close activity log"
              title="Close"
            >
              ✕
            </button>
          </div>
        </header>
        <LogList />
      </div>
    </div>
  );
}

export { SyncLogPanel };
