// ABOUTME: The Settings sections — Connection (GitHub token) and Commit
// ABOUTME: messages — shared by the in-window modal and the macOS Settings window.
import { type FormEvent, useId, useState } from "react";
import type { CommitMessageTemplates } from "../../core/sync/types";

/** A save that resolves null on success, or the message to show inline. */
type Save<T> = (value: T) => Promise<string | null>;

function TokenField(props: { saveToken: Save<string> }) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setSaving(true);
    setError(null);
    const problem = await props.saveToken(token);
    setSaving(false);
    if (problem === null) {
      setToken("");
    } else {
      setError(problem);
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
      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={!token || saving}>
        {saving ? "Saving…" : "Save token"}
      </button>
    </form>
  );
}

/** Connected: the repo, with a Replace Token… disclosure. Not connected: the
 *  token form and what the token needs. */
function ConnectionSection(props: {
  connected: boolean;
  /** "owner/repo#branch". */
  repoLabel: string;
  saveToken: Save<string>;
}) {
  const [replacing, setReplacing] = useState(false);
  return (
    <section className="settings-section">
      <h3>Connection</h3>
      {props.connected ? (
        <div className="settings-connection">
          <span className="settings-connected-dot" aria-hidden="true" />
          <span>
            Connected to <strong>{props.repoLabel}</strong>
          </span>
          <button type="button" className="btn" onClick={() => setReplacing(!replacing)}>
            {replacing ? "Keep Current Token" : "Replace Token…"}
          </button>
        </div>
      ) : (
        <p className="settings-hint">
          Not connected. Save a fine-grained GitHub token with contents read &amp; write on{" "}
          {props.repoLabel.split("#")[0]} to start syncing.
        </p>
      )}
      {props.connected && !replacing ? null : <TokenField saveToken={props.saveToken} />}
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

function CommitTemplatesSection(props: {
  templates: CommitMessageTemplates;
  saveTemplates: Save<CommitMessageTemplates>;
}) {
  const [draft, setDraft] = useState(props.templates);
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(await props.saveTemplates(draft));
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
      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn">
        Save Templates
      </button>
    </form>
  );
}

export { CommitTemplatesSection, ConnectionSection };
