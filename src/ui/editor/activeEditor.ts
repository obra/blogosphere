// ABOUTME: The editor the Format menu acts on: whichever body editor has focus
// ABOUTME: right now, or none. The menu bar subscribes to enable its items.
import { createRegistry } from "../registry";
import type { EditorHandle } from "./markdown-utils";

interface FormatTarget {
  /** The mounted editor's handle; null between mount and ref attach. */
  handle(): EditorHandle | null;
  onImage(bytes: Uint8Array, suggestedExt: string): Promise<string | null>;
}

const activeEditor = createRegistry<FormatTarget>();

/** Makes `target` the Format menu's editor. The returned unregister clears
 *  it only if it is still the current one. */
const setActiveEditor = (target: FormatTarget) => activeEditor.set(target);
const getActiveEditor = () => activeEditor.get();
const subscribeActiveEditor = (listener: () => void) => activeEditor.subscribe(listener);

export { type FormatTarget, getActiveEditor, setActiveEditor, subscribeActiveEditor };
