// ABOUTME: macOS alerts for failed actions: one at a time, duplicates dropped,
// ABOUTME: Try Again runs the action's retry.
import { describe, expect, it, vi } from "vitest";
import { createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

interface PendingAlert {
  message: string;
  retry: boolean;
  answer: (tryAgain: boolean) => void;
}

function macStoreWithAlerts() {
  const shown: PendingAlert[] = [];
  const alert = (message: string, options: { retry: boolean }) =>
    new Promise<boolean>((resolve) => {
      shown.push({ message, retry: options.retry, answer: resolve });
    });
  const { services } = buildFakeServices({ shellOptions: { platform: "macos" } });
  const store = createAppStore(services, { alert, windowFocused: () => true });
  return { store, shown };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("alerts on macOS", () => {
  it("shows a failed action as an alert offering Try Again, which retries", async () => {
    const { store, shown } = macStoreWithAlerts();
    const retry = vi.fn();
    store.getState().addToast({ tone: "error", message: "Couldn't delete this entry.", retry });
    await settle();
    expect(shown.map((a) => [a.message, a.retry])).toEqual([["Couldn't delete this entry.", true]]);
    expect(store.getState().toasts).toEqual([]);
    shown[0]?.answer(true);
    await settle();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("OK does nothing more; no retry means no Try Again", async () => {
    const { store, shown } = macStoreWithAlerts();
    const retry = vi.fn();
    store.getState().addToast({ tone: "error", message: "Couldn't delete.", retry });
    store.getState().addToast({ tone: "error", message: "That entry isn't around anymore." });
    await settle();
    shown[0]?.answer(false);
    await settle();
    expect(retry).not.toHaveBeenCalled();
    expect(shown[1]?.retry).toBe(false);
    shown[1]?.answer(false);
  });

  it("shows one alert at a time, the next after the first is answered", async () => {
    const { store, shown } = macStoreWithAlerts();
    store.getState().addToast({ tone: "error", message: "First." });
    store.getState().addToast({ tone: "error", message: "Second." });
    await settle();
    expect(shown.map((a) => a.message)).toEqual(["First."]);
    shown[0]?.answer(false);
    await settle();
    expect(shown.map((a) => a.message)).toEqual(["First.", "Second."]);
  });

  it("one alert per message, but Try Again runs every retry that asked", async () => {
    const { store, shown } = macStoreWithAlerts();
    const saveA = vi.fn();
    const saveB = vi.fn();
    store
      .getState()
      .addToast({ tone: "error", message: "Couldn't save your changes.", retry: saveA });
    store
      .getState()
      .addToast({ tone: "error", message: "Couldn't save your changes.", retry: saveB });
    await settle();
    expect(shown).toHaveLength(1);
    shown[0]?.answer(true);
    await settle();
    expect(saveA).toHaveBeenCalledTimes(1);
    expect(saveB).toHaveBeenCalledTimes(1);
  });

  it("an alert that can't be shown falls back to a toast", async () => {
    const { services } = buildFakeServices({ shellOptions: { platform: "macos" } });
    const store = createAppStore(services, {
      alert: () => Promise.reject(new Error("IPC down")),
      windowFocused: () => true,
    });
    store.getState().addToast({ tone: "error", message: "Couldn't publish." });
    await settle();
    expect(store.getState().toasts.map((toast) => toast.message)).toEqual(["Couldn't publish."]);
  });

  it("drops a message already showing or waiting", async () => {
    const { store, shown } = macStoreWithAlerts();
    store.getState().addToast({ tone: "error", message: "Couldn't save your changes." });
    store.getState().addToast({ tone: "error", message: "Couldn't save your changes." });
    await settle();
    shown[0]?.answer(false);
    await settle();
    expect(shown).toHaveLength(1);
  });

  it("the same message can alert again once the first is answered", async () => {
    const { store, shown } = macStoreWithAlerts();
    store.getState().addToast({ tone: "error", message: "Search failed." });
    await settle();
    shown[0]?.answer(false);
    await settle();
    store.getState().addToast({ tone: "error", message: "Search failed." });
    await settle();
    expect(shown).toHaveLength(2);
  });
});
