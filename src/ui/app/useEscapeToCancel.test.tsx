// @vitest-environment jsdom
// ABOUTME: useEscapeToCancel — Escape cancels an open sheet wherever focus is,
// ABOUTME: unless something inside already handled it or an IME is composing.
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useEscapeToCancel } from "./useEscapeToCancel";

afterEach(cleanup);

it("cancels on Escape with focus anywhere", () => {
  const onCancel = vi.fn();
  renderHook(() => useEscapeToCancel(onCancel));
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("leaves an Escape that an inner control already handled", () => {
  const onCancel = vi.fn();
  renderHook(() => useEscapeToCancel(onCancel));
  const inner = document.createElement("input");
  inner.addEventListener("keydown", (event) => event.preventDefault());
  document.body.append(inner);
  fireEvent.keyDown(inner, { key: "Escape" });
  inner.remove();
  expect(onCancel).not.toHaveBeenCalled();
});

it("leaves an Escape that ends an IME composition", () => {
  const onCancel = vi.fn();
  renderHook(() => useEscapeToCancel(onCancel));
  fireEvent.keyDown(document.body, { key: "Escape", isComposing: true });
  expect(onCancel).not.toHaveBeenCalled();
});

it("listens to nothing while inactive, or once unmounted", () => {
  const onCancel = vi.fn();
  const { rerender, unmount } = renderHook(({ active }) => useEscapeToCancel(onCancel, active), {
    initialProps: { active: false },
  });
  fireEvent.keyDown(document.body, { key: "Escape" });
  rerender({ active: true });
  unmount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(onCancel).not.toHaveBeenCalled();
});
