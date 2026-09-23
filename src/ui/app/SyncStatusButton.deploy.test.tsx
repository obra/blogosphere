// @vitest-environment jsdom
// ABOUTME: The Activity popover's deploy line — Deploying…, Live at <time>,
// ABOUTME: Deploy failed — and the sync button showing a failed deploy.
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { clockTime } from "./format";
import { SyncStatusButton } from "./SyncStatusButton";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

const MAC = { shellOptions: { platform: "macos" as const } };

function openWith(deploy: { state: "deploying" | "live" | "failed"; at: number } | null) {
  const { store } = renderWithStore(<SyncStatusButton />, MAC);
  act(() => {
    store.setState({ deploy: deploy && { sha: "abc", ...deploy } });
    store.getState().openSyncLog();
  });
  return store;
}

it("says Deploying… while the site builds", () => {
  openWith({ state: "deploying", at: 1 });
  expect(screen.getByText("Deploying…")).not.toBeNull();
});

it("says when the site went live", () => {
  const at = new Date(2026, 8, 23, 10, 42).getTime();
  openWith({ state: "live", at });
  expect(screen.getByText(`Live at ${clockTime(at)}`)).not.toBeNull();
});

it("says the deploy failed, and the button shows it", () => {
  openWith({ state: "failed", at: Date.now() + 60_000 });
  expect(screen.getByText("Deploy failed")).not.toBeNull();
  expect(
    screen.getByRole("button", {
      name: "Deploy failed — the site still shows the previous version",
    }),
  ).not.toBeNull();
});

it("shows no deploy line before any push", () => {
  openWith(null);
  expect(screen.queryByText("Deploying…")).toBeNull();
});
