// ABOUTME: The activity log's entries, newest first — shared by the modal
// ABOUTME: SyncLogPanel (phones, non-Mac) and the macOS Activity popover.
import type { SyncLogEntry } from "../../core/sync/types";
import { clockTime } from "./format";
import { useServices } from "./ServicesContext";
import { useAppStore } from "./state";

/** To the second on the phone panel (entries a few seconds apart stay
 *  distinct); the macOS popover says the time as the rest of the Mac does. */
function timeLabel(at: number, mac: boolean): string {
  if (mac) {
    return clockTime(at);
  }
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function LogRow(props: { entry: SyncLogEntry; mac: boolean }) {
  const { entry } = props;
  return (
    <li className="sync-log-row" data-level={entry.level}>
      <span className="sync-log-dot" aria-hidden="true" />
      <div className="sync-log-body">
        <div className="sync-log-line">
          <span className="sync-log-message">{entry.message}</span>
          <time className="sync-log-time">{timeLabel(entry.at, props.mac)}</time>
        </div>
        {entry.detail ? <pre className="sync-log-detail">{entry.detail}</pre> : null}
      </div>
    </li>
  );
}

function SyncLogList() {
  const log = useAppStore((state) => state.syncLog);
  const mac = useServices().shell.platform() === "macos";
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
        <LogRow key={`${entry.at}-${i}`} entry={entry} mac={mac} />
      ))}
    </ul>
  );
}

export { SyncLogList };
