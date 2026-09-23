// ABOUTME: An in-memory SettingsTransport for tests: one bus both windows' sides
// ABOUTME: attach to, delivering an emitTo only to listeners on the target window.
import type { SettingsTransport } from "./protocol";

interface Bus {
  /** The transport as seen from one window. */
  forWindow(label: string): SettingsTransport;
}

function createBus(): Bus {
  const listeners = new Set<{ window: string; event: string; handler: (p: unknown) => void }>();
  return {
    forWindow: (window) => ({
      emitTo: (target, event, payload) => {
        for (const listener of [...listeners]) {
          if (listener.window === target && listener.event === event) {
            listener.handler(payload);
          }
        }
        return Promise.resolve();
      },
      listen: <T>(event: string, handler: (payload: T) => void) => {
        const entry = { window, event, handler: handler as (p: unknown) => void };
        listeners.add(entry);
        return Promise.resolve(() => {
          listeners.delete(entry);
        });
      },
    }),
  };
}

export { type Bus, createBus };
