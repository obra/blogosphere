// ABOUTME: The editor the Format menu acts on: whichever body editor has focus
// ABOUTME: right now, or none. The menu bar subscribes to enable its items.
import type { EditorHandle } from "./markdown-utils";

interface FormatTarget {
  /** The mounted editor's handle; null between mount and ref attach. */
  handle(): EditorHandle | null;
  onImage(bytes: Uint8Array, suggestedExt: string): Promise<string | null>;
}

let active: FormatTarget | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Makes `target` the Format menu's editor. The returned unregister clears
 *  it only if it is still the current one. */
function setActiveEditor(target: FormatTarget): () => void {
  active = target;
  notify();
  return () => {
    if (active === target) {
      active = null;
      notify();
    }
  };
}

function getActiveEditor(): FormatTarget | null {
  return active;
}

function subscribeActiveEditor(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export { type FormatTarget, getActiveEditor, setActiveEditor, subscribeActiveEditor };
