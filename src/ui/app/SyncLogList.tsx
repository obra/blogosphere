// ABOUTME: The activity log's entries, newest first — shared by the modal
// ABOUTME: SyncLogPanel (phones, non-Mac) and the macOS Activity popover.
import type { SyncLogEntry } from "../../core/sync/types";
import { useAppStore } from "./state";

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

function SyncLogList() {
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

export { SyncLogList };
