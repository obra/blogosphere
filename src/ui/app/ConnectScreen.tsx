// ABOUTME: First-run connect card — shown in the detail pane until a GitHub
// ABOUTME: token is saved. Owns the token form, live progress, and errors.
import { type FormEvent, useId, useState } from "react";
import { useServices } from "./ServicesContext";
import { useAppStore, useAppStoreApi } from "./state";

const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";
const AUTH_ERROR_PATTERN = /401|403|auth/i;
const NETWORK_ERROR_PATTERN = /network|fetch|offline/i;

interface ConnectScreenProps {
  /** Integration's "validate token, rebuild github+sync, first sync" step.
   *  Rejects on a bad token — that rejection is this card's error state. */
  onTokenSaved: ((token: string) => void | Promise<void>) | undefined;
}

type Phase = "idle" | "connecting";

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (AUTH_ERROR_PATTERN.test(message)) {
    return "GitHub rejected that token. Check that it has read and write access to the blog repository's contents.";
  }
  if (NETWORK_ERROR_PATTERN.test(message)) {
    return "Couldn't reach GitHub. Check your connection and try again.";
  }
  return "Connecting failed. Check the token and try again.";
}

function TokenHelp() {
  const store = useAppStoreApi();
  const [copied, setCopied] = useState(false);
  function copyUrl(): void {
    // Clipboard write goes through the same injected dep the rest of the
    // app uses (Tauri clipboard in the real app, navigator in the browser).
    store
      .getState()
      .copyText(TOKEN_URL)
      .finally(() => setCopied(true));
  }
  return (
    <p className="connect-help">
      Use a fine-grained personal access token with contents read &amp; write on the blog repository
      — plus Actions read if you want deploy status after publishing.{" "}
      <button type="button" className="link-button" onClick={copyUrl}>
        {copied ? "Link copied" : "Copy the create-token link"}
      </button>
    </p>
  );
}

function ConnectScreen(props: ConnectScreenProps) {
  const store = useAppStoreApi();
  const services = useServices();
  const syncStatus = useAppStore((state) => state.syncStatus);
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  const repoLabel = `${services.repo.owner}/${services.repo.repo}`;
  const connecting = phase === "connecting";
  const progressText =
    syncStatus?.state === "syncing" ? "Downloading your posts…" : "Checking the token…";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed || connecting) {
      return;
    }
    setPhase("connecting");
    setError(null);
    try {
      await store.getState().saveToken(trimmed);
      await props.onTokenSaved?.(trimmed);
      // Success unmounts this card (services.sync flips non-null upstream).
    } catch (cause) {
      setError(describeError(cause));
      setPhase("idle");
    }
  }

  return (
    <div className="connect-screen">
      <form className="connect-card" onSubmit={handleSubmit}>
        <h1 className="connect-title">Blogosphere</h1>
        <p className="connect-lede">
          Writes, edits, and publishes <strong>{repoLabel}</strong> — every post on this device,
          online or offline. Connect GitHub to bring your blog in.
        </p>
        <div className="dialog-field">
          <label htmlFor={fieldId}>GitHub token</label>
          <input
            id={fieldId}
            type="password"
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
            placeholder="github_pat_…"
            autoComplete="off"
            disabled={connecting}
            /* First thing the user should touch on first run. */
            /* biome-ignore lint/a11y/noAutofocus: single-purpose setup card */
            autoFocus={true}
          />
        </div>
        <TokenHelp />
        {error ? (
          <p className="connect-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={!token || connecting}>
          {connecting ? (
            <>
              <span className="sync-pill-dot spinning" /> {progressText}
            </>
          ) : (
            "Connect and sync"
          )}
        </button>
        <p className="connect-footnote">
          The token is stored securely on this device and never leaves it.
        </p>
      </form>
    </div>
  );
}

export { ConnectScreen };
