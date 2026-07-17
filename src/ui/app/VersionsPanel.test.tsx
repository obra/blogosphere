// @vitest-environment jsdom
// ABOUTME: VersionsPanel — timeline loading/error/empty states, the
// ABOUTME: not-connected message, viewing a past version, and restoring one.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GitHubApi } from "../../core/github/types";
import type { Services } from "../../core/services";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";
import { VersionsPanel } from "./VersionsPanel";

const PATH = "content/drafts/2026-01-01-a.md";

interface FakeGithubOverrides {
  listCommitsForPath?: GitHubApi["listCommitsForPath"];
  getFileAtCommit?: GitHubApi["getFileAtCommit"];
}

/** Only listCommitsForPath/getFileAtCommit are used by VersionsPanel — the
 *  contract's documented shape for testing this component. */
function fakeGithub(overrides: FakeGithubOverrides = {}): GitHubApi {
  return {
    listCommitsForPath: overrides.listCommitsForPath ?? (async () => []),
    getFileAtCommit: overrides.getFileAtCommit ?? (async () => null),
  } as GitHubApi;
}

interface RenderOptions {
  seedEntries?: ReturnType<typeof makeEntry>[];
  github?: GitHubApi | null;
}

function renderPanel(options: RenderOptions = {}) {
  const fake = buildFakeServices({ seedEntries: options.seedEntries ?? [], withSync: false });
  const services: Services = { ...fake.services, github: options.github ?? null };
  const store = createAppStore(services);
  render(
    <ServicesProvider services={services}>
      <AppStoreProvider store={store}>
        <VersionsPanel />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  return { store, services };
}

async function openFor(store: ReturnType<typeof createAppStore>) {
  await act(async () => {
    await store.getState().refresh();
    store.getState().openVersions(PATH);
  });
}

afterEach(() => {
  cleanup();
});

it("renders nothing until opened", () => {
  renderPanel();
  expect(screen.queryByRole("dialog", { name: "Versions" })).toBeNull();
});

it("shows a connect prompt when there is no GitHub connection", async () => {
  const { store } = renderPanel({ seedEntries: [makeEntry({ path: PATH, kind: "draft" })] });
  await openFor(store);

  expect(screen.getByText("Connect to GitHub to see history.")).not.toBeNull();
});

it("loads and shows the commit timeline, one line per commit", async () => {
  const listCommitsForPath = vi.fn().mockResolvedValue([
    { sha: "aaa", message: "Fix typo\n\nlonger body", authoredAt: null },
    { sha: "bbb", message: "Initial draft", authoredAt: null },
  ]);
  const { store } = renderPanel({
    seedEntries: [makeEntry({ path: PATH, kind: "draft" })],
    github: fakeGithub({ listCommitsForPath }),
  });
  await openFor(store);

  await waitFor(() => {
    expect(screen.getByText("Fix typo")).not.toBeNull();
  });
  expect(screen.getByText("Initial draft")).not.toBeNull();
  expect(listCommitsForPath).toHaveBeenCalledWith(PATH, 30);
});

it("shows an error state when history fails to load", async () => {
  const { store } = renderPanel({
    seedEntries: [makeEntry({ path: PATH, kind: "draft" })],
    github: fakeGithub({
      listCommitsForPath: () => Promise.reject(new Error("boom")),
    }),
  });
  await openFor(store);

  await waitFor(() => {
    expect(screen.getByText("Couldn't load history for this entry.")).not.toBeNull();
  });
});

it("shows an empty state when the entry has no history yet", async () => {
  const { store } = renderPanel({
    seedEntries: [makeEntry({ path: PATH, kind: "draft" })],
    github: fakeGithub(),
  });
  await openFor(store);

  await waitFor(() => {
    expect(screen.getByText("No history yet for this entry.")).not.toBeNull();
  });
});

it("labels the current working copy 'Now — unsynced changes' when dirty", async () => {
  const { store } = renderPanel({
    seedEntries: [makeEntry({ path: PATH, kind: "draft", dirty: true })],
    github: fakeGithub(),
  });
  await openFor(store);

  expect(screen.getByText("Now — unsynced changes")).not.toBeNull();
});

it("labels the current working copy plain 'Now' when clean", async () => {
  const { store } = renderPanel({
    seedEntries: [makeEntry({ path: PATH, kind: "draft", dirty: false })],
    github: fakeGithub(),
  });
  await openFor(store);

  expect(screen.getByText("Now")).not.toBeNull();
  expect(screen.queryByText("Now — unsynced changes")).toBeNull();
});

it("selecting a commit shows its content read-only, with Back returning to the timeline", async () => {
  const getFileAtCommit = vi.fn().mockResolvedValue("OLD VERSION TEXT");
  const { store } = renderPanel({
    seedEntries: [makeEntry({ path: PATH, kind: "draft" })],
    github: fakeGithub({
      listCommitsForPath: async () => [{ sha: "aaa", message: "Fix typo", authoredAt: null }],
      getFileAtCommit,
    }),
  });
  await openFor(store);
  await waitFor(() => screen.getByText("Fix typo"));

  fireEvent.click(screen.getByText("Fix typo"));

  await waitFor(() => {
    expect(screen.getByText("OLD VERSION TEXT")).not.toBeNull();
  });
  expect(getFileAtCommit).toHaveBeenCalledWith(PATH, "aaa");
  expect(screen.getByText("Restore this version")).not.toBeNull();

  fireEvent.click(screen.getByText("Back"));

  expect(screen.getByText("Now")).not.toBeNull();
  expect(screen.queryByText("Restore this version")).toBeNull();
});

it("shows 'This version predates the file' and hides Restore when the file didn't exist yet", async () => {
  const { store } = renderPanel({
    seedEntries: [makeEntry({ path: PATH, kind: "draft" })],
    github: fakeGithub({
      listCommitsForPath: async () => [{ sha: "aaa", message: "Fix typo", authoredAt: null }],
      getFileAtCommit: async () => null,
    }),
  });
  await openFor(store);
  await waitFor(() => screen.getByText("Fix typo"));

  fireEvent.click(screen.getByText("Fix typo"));

  await waitFor(() => {
    expect(screen.getByText("This version predates the file.")).not.toBeNull();
  });
  expect(screen.queryByText("Restore this version")).toBeNull();
});

it("Restore this version writes the entry and closes the panel", async () => {
  const raw = "RESTORED VERSION TEXT";
  const entry = makeEntry({ path: PATH, kind: "draft" });
  const { store, services } = renderPanel({
    seedEntries: [entry],
    github: fakeGithub({
      listCommitsForPath: async () => [{ sha: "aaa", message: "Fix typo", authoredAt: null }],
      getFileAtCommit: async () => raw,
    }),
  });
  await openFor(store);
  await waitFor(() => screen.getByText("Fix typo"));
  fireEvent.click(screen.getByText("Fix typo"));
  await waitFor(() => screen.getByText("Restore this version"));

  fireEvent.click(screen.getByText("Restore this version"));

  await waitFor(() => {
    expect(store.getState().versionsPath).toBeNull();
  });
  const restored = await services.store.getEntry(PATH);
  expect(restored?.workingContent).toBe(raw);
  expect(restored?.dirty).toBe(true);
});

it("closing via the close button clears versionsPath", async () => {
  const { store } = renderPanel({
    seedEntries: [makeEntry({ path: PATH, kind: "draft" })],
    github: fakeGithub(),
  });
  await openFor(store);

  fireEvent.click(screen.getByLabelText("Close versions"));

  expect(store.getState().versionsPath).toBeNull();
});
