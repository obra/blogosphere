// ABOUTME: createRegistry — one current value that components register while
// ABOUTME: mounted, observable by the native menu bar.
import { describe, expect, it, vi } from "vitest";
import { createRegistry } from "./registry";

describe("createRegistry", () => {
  it("holds the registered value until it unregisters", () => {
    const registry = createRegistry<{ name: string }>();
    expect(registry.get()).toBeNull();
    const value = { name: "a" };
    const unregister = registry.set(value);
    expect(registry.get()).toBe(value);
    unregister();
    expect(registry.get()).toBeNull();
  });

  it("ignores a stale unregister from a value that was replaced", () => {
    const registry = createRegistry<string>();
    const unregisterFirst = registry.set("first");
    registry.set("second");
    unregisterFirst();
    expect(registry.get()).toBe("second");
  });

  it("tells subscribers about each change until they unsubscribe", () => {
    const registry = createRegistry<string>();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const unregister = registry.set("x");
    unregister();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    registry.set("y");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
