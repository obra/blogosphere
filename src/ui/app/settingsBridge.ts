// ABOUTME: The main window's side of the Settings window protocol: answers its
// ABOUTME: requests from this window's store and tells it whenever that state changes.
import type { CommitMessageTemplates } from "../../core/sync/types";
import {
  SETTINGS_EVENTS,
  SETTINGS_WINDOW,
  type SettingsReply,
  type SettingsState,
  type SettingsTransport,
} from "../../settings/protocol";
import { describeConnectError } from "./connectErrors";
import type { BoundAppStore } from "./state";
import type { AppState } from "./state.types";

interface BridgeDeps {
  transport: SettingsTransport;
  store: BoundAppStore;
  /** App's connect(token): checks, saves, and installs a GitHub token. */
  connect: (token: string) => Promise<void>;
}

function settingsState(state: AppState): SettingsState {
  const { owner, repo, branch } = state.services.repo;
  return {
    connected: state.services.sync !== null,
    repo: `${owner}/${repo}#${branch}`,
    templates: state.commitTemplates,
  };
}

async function answerSaveToken(deps: BridgeDeps, id: string, token: string) {
  try {
    await deps.connect(token);
    return { id, ok: true };
  } catch (error) {
    return { id, ok: false, error: describeConnectError(error) };
  }
}

async function answerSaveTemplates(
  deps: BridgeDeps,
  id: string,
  templates: CommitMessageTemplates,
) {
  try {
    await deps.store.getState().setCommitTemplates(templates);
    return { id, ok: true };
  } catch {
    return { id, ok: false, error: "Couldn't save the templates." };
  }
}

/** Resolves once every listener is attached; the result detaches them. */
async function installSettingsBridge(deps: BridgeDeps): Promise<() => void> {
  const { transport, store } = deps;
  const reply = (answer: SettingsReply) => {
    transport.emitTo(SETTINGS_WINDOW, SETTINGS_EVENTS.reply, answer).catch(() => undefined);
  };
  const unlisteners = await Promise.all([
    transport.listen<{ id: string }>(SETTINGS_EVENTS.getState, ({ id }) =>
      reply({ id, ok: true, state: settingsState(store.getState()) }),
    ),
    transport.listen<{ id: string; token: string }>(SETTINGS_EVENTS.saveToken, ({ id, token }) => {
      answerSaveToken(deps, id, token).then(reply);
    }),
    transport.listen<{ id: string; templates: CommitMessageTemplates }>(
      SETTINGS_EVENTS.saveTemplates,
      ({ id, templates }) => {
        answerSaveTemplates(deps, id, templates).then(reply);
      },
    ),
  ]);
  // Broadcast only what Settings shows, and only when it changes.
  let last = JSON.stringify(settingsState(store.getState()));
  const stopWatching = store.subscribe((state) => {
    const next = settingsState(state);
    const key = JSON.stringify(next);
    if (key !== last) {
      last = key;
      transport.emitTo(SETTINGS_WINDOW, SETTINGS_EVENTS.state, next).catch(() => undefined);
    }
  });
  return () => {
    stopWatching();
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}

export { installSettingsBridge };
