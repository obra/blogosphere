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
    store.getState().addToast({ tone: "error", message: "That entry isn't around anymore." });
    await settle();
    expect(shown[0]?.retry).toBe(false);
    shown[0]?.answer(false);
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
