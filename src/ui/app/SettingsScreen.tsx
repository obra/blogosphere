// ABOUTME: Settings screen — GitHub token entry, repo display, and commit
// ABOUTME: message template fields, each persisted via the app store.
import { type FormEvent, useId, useState } from "react";
import type { CommitMessageTemplates } from "../../core/sync/types";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";

interface SettingsScreenProps {
  /** Integration wires the real "rebuild github+sync" step; called after the
   *  token is durably saved to the keychain. Explicitly `| undefined` (rather
   *  than merely optional) so it can be forwarded from another optional prop
   *  of the same shape without tripping exactOptionalPropertyTypes. */
  onTokenSaved: ((token: string) => void | Promise<void>) | undefined;
}

type TokenFieldProps = SettingsScreenProps;

function TokenField(props: TokenFieldProps) {
  const store = useAppStoreApi();
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const fieldId = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setSaving(true);
    try {
      await store.getState().saveToken(token);
      await props.onTokenSaved?.(token);
      setToken("");
    } catch {
      // Already surfaced as a toast by the store; nothing more to do here.
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-token-form" onSubmit={handleSubmit}>
      <div className="dialog-field">
        <label htmlFor={fieldId}>GitHub token</label>
        <input
          id={fieldId}
          type="password"
          value={token}
          onChange={(event) => setToken(event.currentTarget.value)}
          placeholder="github_pat_…"
          autoComplete="off"
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={!token || saving}>
        {saving ? "Saving…" : "Save token"}
      </button>
    </form>
  );
}

/** Connection section: connected state with a replace-token disclosure when
 *  sync is configured; the bare token form when it isn't. */
function ConnectionSection(props: TokenFieldProps) {
  const services = useServices();
  const [replacing, setReplacing] = useState(false);
  const connected = services.sync !== null;
  const repoLabel = `${services.repo.owner}/${services.repo.repo}#${services.repo.branch}`;
  return (
    <section className="settings-section">
      <h3>Connection</h3>
      {connected ? (
        <div className="settings-connection">
          <span className="settings-connected-dot" aria-hidden="true" />
          <span>
            Connected to <strong>{repoLabel}</strong>
          </span>
          <button type="button" className="link-button" onClick={() => setReplacing(!replacing)}>
            {replacing ? "Keep current token" : "Replace token…"}
          </button>
        </div>
      ) : (
        <p className="settings-hint">
          Not connected. Save a fine-grained GitHub token with contents read &amp; write on{" "}
          {repoLabel.split("#")[0]} to start syncing.
        </p>
      )}
      {connected && !replacing ? null : <TokenField onTokenSaved={props.onTokenSaved} />}
    </section>
  );
}

const TEMPLATE_FIELDS: Array<{ key: keyof CommitMessageTemplates; label: string }> = [
  { key: "newPost", label: "New post" },
  { key: "edit", label: "Edit" },
  { key: "newDraft", label: "New draft" },
  { key: "newLink", label: "New link" },
  { key: "delete", label: "Delete" },
];

function CommitTemplatesForm() {
  const store = useAppStoreApi();
  const templates = useAppStore((state) => state.commitTemplates);
  const [draft, setDraft] = useState(templates);
  const baseId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    store.getState().setCommitTemplates(draft);
  }

  return (
    <form className="settings-section" onSubmit={handleSubmit}>
      <h3>Commit messages</h3>
      <p className="settings-hint">
        Used for the commits Blogosphere makes. {"{title}"} and {"{path}"} fill in.
      </p>
      {TEMPLATE_FIELDS.map((field) => (
        <div className="dialog-field" key={field.key}>
          <label htmlFor={`${baseId}-${field.key}`}>{field.label}</label>
          <input
            id={`${baseId}-${field.key}`}
            type="text"
            value={draft[field.key]}
            onChange={(event) => setDraft({ ...draft, [field.key]: event.currentTarget.value })}
          />
        </div>
      ))}
      <button type="submit" className="btn">
        Save templates
      </button>
    </form>
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
        <ConnectionSection onTokenSaved={props.onTokenSaved} />
        <CommitTemplatesForm />
      </div>
    </div>
  );
}

export { SettingsScreen };
