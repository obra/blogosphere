// ABOUTME: Per-entry git history — timeline of commits that touched the open
// ABOUTME: entry, view any version, restore one as the working copy.
import { useEffect, useState } from "react";
import type { CommitSummary, GitHubApi } from "../../core/github/types";
import { relativeTimeLabel } from "./format";
import { useServices } from "./ServicesContext";
import { focusSheetOnOpen } from "./sheetFocus";
import { useAppStore, useAppStoreApi } from "./state";
import { useEscapeToCancel } from "./useEscapeToCancel";

/** listCommitsForPath's cap — plenty for "recently touched this file", and
 *  keeps the timeline from growing unbounded for old, much-edited posts. */
const COMMIT_HISTORY_LIMIT = 30;

type LoadState<T> = { status: "loading" } | { status: "error" } | { status: "ready"; value: T };

function firstLine(message: string): string {
  return message.split("\n")[0] || "(no message)";
}

function currentCopyLabel(dirty: boolean): string {
  return dirty ? "Now — unsynced changes" : "Now";
}

/** Commit history for `path`, refetched whenever it (or the connection)
 *  changes; a slow request superseded by a newer one is ignored on arrival. */
function useCommitHistory(github: GitHubApi | null, path: string): LoadState<CommitSummary[]> {
  const [state, setState] = useState<LoadState<CommitSummary[]>>({ status: "loading" });

  useEffect(() => {
    if (!github) {
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    github
      .listCommitsForPath(path, COMMIT_HISTORY_LIMIT)
      .then((value) => {
        if (!cancelled) {
          setState({ status: "ready", value });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [github, path]);

  return state;
}

/** One version's text as of `sha`; a ready `value` of null means the file
 *  didn't exist at that commit yet. */
function useFileAtCommit(
  github: GitHubApi | null,
  path: string,
  sha: string,
): LoadState<string | null> {
  const [state, setState] = useState<LoadState<string | null>>({ status: "loading" });

  useEffect(() => {
    if (!github) {
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    github
      .getFileAtCommit(path, sha)
      .then((value) => {
        if (!cancelled) {
          setState({ status: "ready", value });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [github, path, sha]);

  return state;
}

function CommitRow(props: { commit: CommitSummary; onSelect: () => void }) {
  const { commit } = props;
  const timeLabel =
    commit.authoredAt === null
      ? "Unknown time"
      : relativeTimeLabel(Date.parse(commit.authoredAt), Date.now());
  return (
    <button type="button" className="entry-row" onClick={props.onSelect}>
      <span className="entry-row-body">
        <span className="entry-row-title">{firstLine(commit.message)}</span>
        <span className="entry-row-meta">{timeLabel}</span>
      </span>
    </button>
  );
}

function HistoryTimeline(props: {
  path: string;
  github: GitHubApi | null;
  onSelect: (commit: CommitSummary) => void;
}) {
  const state = useCommitHistory(props.github, props.path);
  if (!props.github) {
    return <p className="settings-hint">Connect to GitHub to see history.</p>;
  }
  if (state.status === "loading") {
    return <p className="settings-hint">Loading history…</p>;
  }
  if (state.status === "error") {
    return <p className="settings-hint">Couldn't load history for this entry.</p>;
  }
  if (state.value.length === 0) {
    return <p className="settings-hint">No history yet for this entry.</p>;
  }
  return (
    <div className="entry-list-scroll">
      {state.value.map((commit) => (
        <CommitRow key={commit.sha} commit={commit} onSelect={() => props.onSelect(commit)} />
      ))}
    </div>
  );
}

function VersionContent(props: { state: LoadState<string | null> }) {
  const { state } = props;
  if (state.status === "loading") {
    return <p className="settings-hint">Loading…</p>;
  }
  if (state.status === "error") {
    return <p className="settings-hint">Couldn't load that version.</p>;
  }
  if (state.value === null) {
    return <p className="settings-hint">This version predates the file.</p>;
  }
  return (
    <div className="entry-list-scroll">
      <pre className="sync-log-detail">{state.value}</pre>
    </div>
  );
}

function VersionDetail(props: {
  path: string;
  github: GitHubApi | null;
  commit: CommitSummary;
  onBack: () => void;
  onRestored: () => void;
}) {
  const store = useAppStoreApi();
  const state = useFileAtCommit(props.github, props.path, props.commit.sha);
  const raw = state.status === "ready" ? state.value : null;

  async function handleRestore() {
    if (raw === null) {
      return;
    }
    await store.getState().restoreVersion(props.path, raw);
    props.onRestored();
  }

  return (
    <>
      <p className="settings-hint">{firstLine(props.commit.message)}</p>
      <VersionContent state={state} />
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={props.onBack}>
          Back
        </button>
        {raw === null ? null : (
          <button type="button" className="btn btn-primary" onClick={handleRestore}>
            Restore this version
          </button>
        )}
      </div>
    </>
  );
}

function VersionsBody(props: { path: string }) {
  const { path } = props;
  const store = useAppStoreApi();
  const { github } = useServices();
  const dirty = useAppStore(
    (state) => state.entries.find((entry) => entry.path === path)?.dirty ?? false,
  );
  const [selected, setSelected] = useState<CommitSummary | null>(null);

  if (selected) {
    return (
      <VersionDetail
        path={path}
        github={github}
        commit={selected}
        onBack={() => setSelected(null)}
        onRestored={() => store.getState().closeVersions()}
      />
    );
  }

  return (
    <>
      <p className="settings-hint">{currentCopyLabel(dirty)}</p>
      <HistoryTimeline path={path} github={github} onSelect={(commit) => setSelected(commit)} />
    </>
  );
}

function VersionsPanel() {
  const store = useAppStoreApi();
  const path = useAppStore((state) => state.versionsPath);
  useEscapeToCancel(() => store.getState().closeVersions(), path !== null);
  if (path === null) {
    return null;
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss, same affordance as SettingsScreen.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled document-wide by useEscapeToCancel.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same backdrop affordance as above.
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          store.getState().closeVersions();
        }
      }}
    >
      <div
        className="dialog dialog-wide versions-panel"
        role="dialog"
        aria-label="Versions"
        ref={focusSheetOnOpen}
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
        <VersionsBody key={path} path={path} />
      </div>
    </div>
  );
}

export { VersionsPanel };
