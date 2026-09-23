// ABOUTME: The activity log — a dialog listing what sync actually did (pushes
// ABOUTME: with paths, pulls, validation skips, conflicts, errors), newest first.
import { SyncLogList } from "./SyncLogList";
import { useAppStore, useAppStoreApi } from "./state";

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
            event.preventDefault();
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
        <SyncLogList />
      </div>
    </div>
  );
}

export { SyncLogPanel };
