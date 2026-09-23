// ABOUTME: activeEditor — the one editor the Format menu acts on: registered
// ABOUTME: while it has focus, cleared on blur, observable by the menu bar.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type FormatTarget,
  getActiveEditor,
  setActiveEditor,
  subscribeActiveEditor,
} from "./activeEditor";

function target(): FormatTarget {
  return { handle: () => null, onImage: () => Promise.resolve(null) };
}

describe("activeEditor", () => {
  let unregister: (() => void) | null = null;
  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("starts empty", () => {
    expect(getActiveEditor()).toBeNull();
  });

  it("holds the registered editor until it unregisters", () => {
    const editor = target();
    unregister = setActiveEditor(editor);
    expect(getActiveEditor()).toBe(editor);
    unregister();
    expect(getActiveEditor()).toBeNull();
  });

  it("ignores a stale unregister from an editor that was replaced", () => {
    const first = target();
    const second = target();
    const unregisterFirst = setActiveEditor(first);
    unregister = setActiveEditor(second);
    unregisterFirst();
    expect(getActiveEditor()).toBe(second);
  });

  it("tells subscribers about every change, until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveEditor(listener);
    unregister = setActiveEditor(target());
    unregister();
    unregister = null;
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    unregister = setActiveEditor(target());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
