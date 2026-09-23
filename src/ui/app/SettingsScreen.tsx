// ABOUTME: Settings screen — GitHub token entry, repo display, and commit
// ABOUTME: message template fields, each persisted via the app store.
import type { CommitMessageTemplates } from "../../core/sync/types";
import { describeConnectError } from "./connectErrors";
import { useServices } from "./ServicesContext";
import { CommitTemplatesSection, ConnectionSection } from "./SettingsSections";
import { useAppStore, useAppStoreApi } from "./state";

interface SettingsScreenProps {
  /** Integration wires the real "rebuild github+sync" step; called after the
   *  token is durably saved to the keychain. Explicitly `| undefined` (rather
   *  than merely optional) so it can be forwarded from another optional prop
   *  of the same shape without tripping exactOptionalPropertyTypes. */
  onTokenSaved: ((token: string) => void | Promise<void>) | undefined;
}

/** Settings' two sections, bound to this window's store and connect(). */
function SettingsBody(props: SettingsScreenProps) {
  const store = useAppStoreApi();
  const services = useServices();
  const templates = useAppStore((state) => state.commitTemplates);
  const { owner, repo, branch } = services.repo;
  async function saveToken(token: string): Promise<string | null> {
    try {
      await props.onTokenSaved?.(token);
      return null;
    } catch (error) {
      return describeConnectError(error);
    }
  }
  async function saveTemplates(next: CommitMessageTemplates): Promise<string | null> {
    try {
      await store.getState().setCommitTemplates(next);
      return null;
    } catch {
      return "Couldn't save the templates.";
    }
  }
  return (
    <>
      <ConnectionSection
        connected={services.sync !== null}
        repoLabel={`${owner}/${repo}#${branch}`}
        saveToken={saveToken}
      />
      <CommitTemplatesSection templates={templates} saveTemplates={saveTemplates} />
    </>
  );
}

function SettingsScreen(props: SettingsScreenProps) {
  const store = useAppStoreApi();
  const open = useAppStore((state) => state.settingsOpen);
  if (!open) {
    return null;
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss; the dialog itself is keyboard-reachable via ⌘, and Escape.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handling lives on the dialog below.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same backdrop affordance as above.
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          store.getState().closeSettings();
        }
      }}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: dialog-level Escape shortcut */}
      <div
        className="dialog settings-screen"
        role="dialog"
        aria-label="Settings"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            store.getState().closeSettings();
          }
        }}
      >
        <header className="settings-header">
          <h2>Settings</h2>
          <button
            type="button"
            className="sidebar-icon-button"
            onClick={() => store.getState().closeSettings()}
            aria-label="Close settings"
            title="Close"
          >
            ✕
          </button>
        </header>
        <SettingsBody onTokenSaved={props.onTokenSaved} />
      </div>
    </div>
  );
}

export { SettingsScreen };
