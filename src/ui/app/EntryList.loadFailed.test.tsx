// @vitest-environment jsdom
// ABOUTME: macOS: when the entry list can't be read and there's nothing to show,
// ABOUTME: the list says so with Try Again (never an alert at launch).
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EntryList } from "./EntryList";
import { makeEntry } from "./testing/builders";
import { renderWithStore } from "./testing/renderWithStore";

afterEach(cleanup);

const draft = makeEntry({
  path: "content/drafts/2026-03-04-one.md",
  kind: "draft",
  title: "Only draft",
});

it("shows the failure with Try Again, and the entries once that works", async () => {
  const { store, services } = renderWithStore(<EntryList />, {
    seedEntries: [draft],
    shellOptions: { platform: "macos" },
  });
  const { listEntries } = services.store;
  services.store.listEntries = () => Promise.reject(new Error("disk full"));
  await act(async () => {
    await store.getState().refresh();
  });
  expect(screen.getByText("Couldn't load your entries.")).not.toBeNull();

  services.store.listEntries = listEntries;
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(screen.queryByText("Couldn't load your entries.")).toBeNull();
  expect(screen.getByText("Only draft")).not.toBeNull();
});

it("keeps showing entries it already has when a later load fails", async () => {
  const { store, services } = renderWithStore(<EntryList />, {
    seedEntries: [draft],
    shellOptions: { platform: "macos" },
  });
  await act(async () => {
    await store.getState().refresh();
  });
  services.store.listEntries = () => Promise.reject(new Error("disk full"));
  await act(async () => {
    await store.getState().refresh();
  });
  expect(screen.getByText("Only draft")).not.toBeNull();
  expect(screen.queryByText("Couldn't load your entries.")).toBeNull();
});
