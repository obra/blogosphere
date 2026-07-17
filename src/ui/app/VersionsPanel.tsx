// ABOUTME: Per-entry git history — timeline of commits that touched the open
// ABOUTME: entry, view any version, restore one as the working copy.
// ABOUTME: CONTRACT STUB: feature E replaces the internals (see contracts doc).
import { useAppStore, useAppStoreApi } from "./state";

// Feature E requirements: on open, services.github.listCommitsForPath(path, 30)
// -> timeline (relative date + commit message); selecting a commit fetches
// getFileAtCommit(path, sha) and shows it read-only (monospace <pre> is fine);
// "Restore this version" calls store restoreVersion(path, raw) then closes;
// loading/error/empty states; a "not connected" state when services.github is
// null. Store contract: versionsPath + closeVersions + restoreVersion.
function VersionsPanel() {
  const store = useAppStoreApi();
  const path = useAppStore((state) => state.versionsPath);
  if (path === null) {
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
          store.getState().closeVersions();
        }
      }}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: dialog-level Escape shortcut */}
      <div
        className="dialog dialog-wide versions-panel"
        role="dialog"
        aria-label="Versions"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            store.getState().closeVersions();
          }
        }}
      >
        <header className="settings-header">
          <h2>Versions</h2>
          <button
            type="button"
            className="sidebar-icon-button"
            onClick={() => store.getState().closeVersions()}
            aria-label="Close versions"
            title="Close"
          >
            ✕
          </button>
        </header>
        <p className="settings-hint">History for {path} — loading…</p>
      </div>
    </div>
  );
}

export { VersionsPanel };
