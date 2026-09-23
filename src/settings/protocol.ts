// ABOUTME: The Settings window ↔ main window protocol: event names, payloads,
// ABOUTME: and the transport both sides use (Tauri events; in-memory in tests).
import type { CommitMessageTemplates } from "../core/sync/types";

const SETTINGS_EVENTS = {
  getState: "settings:get-state",
  saveToken: "settings:save-token",
  saveTemplates: "settings:save-templates",
  reply: "settings:reply",
  state: "settings:state",
} as const;

/** Window labels (tauri.conf.json's main window, open_settings's window). */
const MAIN_WINDOW = "main";
const SETTINGS_WINDOW = "settings";

/** What the Settings window shows. The main window owns all of it. */
interface SettingsState {
  connected: boolean;
  /** "owner/repo#branch". */
  repo: string;
  templates: CommitMessageTemplates;
}

type SettingsRequest =
  | { id: string }
  | { id: string; token: string }
  | { id: string; templates: CommitMessageTemplates };

interface SettingsReply {
  /** The request this answers. */
  id: string;
  ok: boolean;
  /** What to show inline when ok is false. */
  error?: string;
  state?: SettingsState;
}

/** Tauri's emitTo/listen, narrowed so both sides are testable in memory. */
interface SettingsTransport {
  emitTo(target: string, event: string, payload: unknown): Promise<void>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
}

export {
  MAIN_WINDOW,
  SETTINGS_EVENTS,
  SETTINGS_WINDOW,
  type SettingsReply,
  type SettingsRequest,
  type SettingsState,
  type SettingsTransport,
};
