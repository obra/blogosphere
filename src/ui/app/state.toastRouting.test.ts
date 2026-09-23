// ABOUTME: addToast on macOS: info and success go to the HUD, toasts the app's
// ABOUTME: state already shows go nowhere; every other platform keeps its toasts.
import { describe, expect, it } from "vitest";
import { createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

function macStore(windowFocused = true) {
  const { services } = buildFakeServices({ shellOptions: { platform: "macos" } });
  return createAppStore(services, { windowFocused: () => windowFocused });
}

describe("addToast on macOS", () => {
  it("shows info in the HUD, not the toast stack", () => {
    const store = macStore();
    store.getState().addToast({ tone: "info", message: "Saved." });
    expect(store.getState().hud?.message).toBe("Saved.");
    expect(store.getState().toasts).toEqual([]);
  });

  it("a second HUD replaces the first", () => {
    const store = macStore();
    store.getState().addToast({ tone: "success", message: "Published." });
    store.getState().addToast({ tone: "info", message: "Changes discarded." });
    expect(store.getState().hud?.message).toBe("Changes discarded.");
  });

  it("dismissHud clears only the HUD it names", () => {
    const store = macStore();
    const first = store.getState().addToast({ tone: "info", message: "Saved." });
    store.getState().addToast({ tone: "info", message: "Saved again." });
    store.getState().dismissHud(first);
    expect(store.getState().hud?.message).toBe("Saved again.");
    const current = store.getState().hud?.id ?? "";
    store.getState().dismissHud(current);
    expect(store.getState().hud).toBeNull();
  });

  it("drops what the app's state already shows", () => {
    const store = macStore();
    store.getState().addToast({ tone: "error", message: "Couldn't sync.", source: "sync" });
    store.getState().addToast({ tone: "success", message: "Live", source: "deploy" });
    expect(store.getState().hud?.message).toBe("Live");
    const background = macStore(false);
    background.getState().addToast({ tone: "success", message: "Live", source: "deploy" });
    expect(background.getState().hud).toBeNull();
    expect(background.getState().toasts).toEqual([]);
  });
});

describe("addToast elsewhere", () => {
  it("keeps today's toast stack", () => {
    const store = createAppStore(buildFakeServices().services);
    store.getState().addToast({ tone: "info", message: "Saved." });
    store.getState().addToast({ tone: "error", message: "Couldn't sync.", source: "sync" });
    expect(store.getState().toasts.map((toast) => toast.message)).toEqual([
      "Saved.",
      "Couldn't sync.",
    ]);
    expect(store.getState().hud).toBeNull();
  });
});

describe("a failed reload", () => {
  it("goes in the Activity log, which keeps it whatever the list shows", async () => {
    const { services } = buildFakeServices({ shellOptions: { platform: "macos" } });
    const store = createAppStore(services, { windowFocused: () => true, now: () => 42 });
    services.store.listEntries = () => Promise.reject(new Error("disk full"));
    await store.getState().refresh();
    expect(store.getState().syncLog).toEqual([
      { at: 42, level: "error", message: "Couldn't reload your entries.", detail: "disk full" },
    ]);
  });
});
