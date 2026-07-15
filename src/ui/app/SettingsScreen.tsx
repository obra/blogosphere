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
    <form className="settings-section" onSubmit={handleSubmit}>
      <div className="dialog-field">
        <label htmlFor={fieldId}>GitHub token</label>
        <input
          id={fieldId}
          type="password"
          value={token}
          onChange={(event) => setToken(event.currentTarget.value)}
          autoComplete="off"
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={!token || saving}>
        {saving ? "Saving…" : "Save token"}
      </button>
    </form>
  );
}

function RepoDisplay() {
  const services = useServices();
  return (
    <div className="settings-section">
      <div>Repository</div>
      <div className="settings-repo">
        {services.repo.owner}/{services.repo.repo}#{services.repo.branch}
      </div>
    </div>
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
      <div>Message templates</div>
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
    <div className="dialog-backdrop">
      <div className="dialog settings-screen" role="dialog" aria-label="Settings">
        <h2>Settings</h2>
        <RepoDisplay />
        <TokenField onTokenSaved={props.onTokenSaved} />
        <CommitTemplatesForm />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => store.getState().closeSettings()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export { SettingsScreen };
