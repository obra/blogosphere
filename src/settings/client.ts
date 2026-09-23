// ABOUTME: The Settings window's side of the protocol: each request goes to the
// ABOUTME: main window and resolves with the reply carrying its id, or a timeout.
import type { CommitMessageTemplates } from "../core/sync/types";
import {
  MAIN_WINDOW,
  SETTINGS_EVENTS,
  type SettingsReply,
  type SettingsState,
  type SettingsTransport,
} from "./protocol";

const NO_ANSWER = "Blogosphere didn't answer. Try again.";
/** How long to wait for the main window (spec §9). */
const REPLY_TIMEOUT_MS = 10_000;
/** A token is checked with GitHub before the reply: allow a slow network. */
const TOKEN_TIMEOUT_MS = 30_000;

interface SettingsClient {
  getState(): Promise<SettingsReply>;
  saveToken(token: string): Promise<SettingsReply>;
  saveTemplates(templates: CommitMessageTemplates): Promise<SettingsReply>;
  /** Calls `handler` with every state the main window broadcasts. */
  onState(handler: (state: SettingsState) => void): Promise<() => void>;
}

function createSettingsClient(
  transport: SettingsTransport,
  options: { createId: () => string },
): SettingsClient {
  const waiting = new Map<string, (reply: SettingsReply) => void>();
  // Listening starts once, before the first request can be answered.
  const listening = transport.listen<SettingsReply>(SETTINGS_EVENTS.reply, (reply) => {
    waiting.get(reply.id)?.(reply);
  });

  async function request(
    event: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<SettingsReply> {
    await listening;
    const id = options.createId();
    return new Promise((resolve) => {
      const finish = (reply: SettingsReply) => {
        clearTimeout(timer);
        waiting.delete(id);
        resolve(reply);
      };
      const timer = setTimeout(() => finish({ id, ok: false, error: NO_ANSWER }), timeoutMs);
      waiting.set(id, finish);
      transport
        .emitTo(MAIN_WINDOW, event, { id, ...payload })
        .catch(() => finish({ id, ok: false, error: NO_ANSWER }));
    });
  }

  return {
    getState: () => request(SETTINGS_EVENTS.getState, {}, REPLY_TIMEOUT_MS),
    saveToken: (token) => request(SETTINGS_EVENTS.saveToken, { token }, TOKEN_TIMEOUT_MS),
    saveTemplates: (templates) =>
      request(SETTINGS_EVENTS.saveTemplates, { templates }, REPLY_TIMEOUT_MS),
    onState: (handler) => transport.listen<SettingsState>(SETTINGS_EVENTS.state, handler),
  };
}

export { createSettingsClient, type SettingsClient };
