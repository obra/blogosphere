// @vitest-environment jsdom
// ABOUTME: The Settings window: shows the main window's state, saves through it
// ABOUTME: with errors inline, follows its broadcasts, and says when it can't reach it.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_COMMIT_TEMPLATES } from "../ui/app/state.types";
import type { SettingsClient } from "./client";
import type { SettingsReply, SettingsState } from "./protocol";
import { SettingsWindow } from "./SettingsWindow";

afterEach(cleanup);

const NOT_CONNECTED = /Not connected/;

const CONNECTED: SettingsState = {
  connected: true,
  repo: "obra/blog#main",
  templates: DEFAULT_COMMIT_TEMPLATES,
};

function fakeClient(overrides: Partial<SettingsClient> = {}) {
  let broadcast: (state: SettingsState) => void = () => undefined;
  const ok = (state?: SettingsState): Promise<SettingsReply> =>
    Promise.resolve({ id: "x", ok: true, ...(state ? { state } : {}) });
  const client: SettingsClient = {
    getState: () => ok(CONNECTED),
    saveToken: () => ok(),
    saveTemplates: () => ok(),
    onState: (handler) => {
      broadcast = handler;
      return Promise.resolve(() => undefined);
    },
    ...overrides,
  };
  return { client, broadcast: (state: SettingsState) => broadcast(state) };
}

it("shows the connection it gets from the main window", async () => {
  render(<SettingsWindow client={fakeClient().client} />);
  expect(await screen.findByText("obra/blog#main")).not.toBeNull();
});

it("shows a rejected token inline", async () => {
  const { client } = fakeClient({
    getState: () =>
      Promise.resolve({ id: "x", ok: true, state: { ...CONNECTED, connected: false } }),
    saveToken: () => Promise.resolve({ id: "x", ok: false, error: "GitHub rejected that token." }),
  });
  render(<SettingsWindow client={client} />);
  fireEvent.change(await screen.findByLabelText("GitHub token"), {
    target: { value: "github_pat_bad" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save token" }));
  expect((await screen.findByRole("alert")).textContent).toBe("GitHub rejected that token.");
});

it("follows the main window's changes", async () => {
  const { client, broadcast } = fakeClient();
  render(<SettingsWindow client={client} />);
  await screen.findByText("obra/blog#main");
  act(() => broadcast({ ...CONNECTED, connected: false }));
  expect(screen.getByText(NOT_CONNECTED)).not.toBeNull();
});

it("says when the main window doesn't answer, with Try Again", async () => {
  let attempts = 0;
  const { client } = fakeClient({
    getState: () => {
      attempts += 1;
      return attempts === 1
        ? Promise.resolve({ id: "x", ok: false, error: "Blogosphere didn't answer. Try again." })
        : Promise.resolve({ id: "x", ok: true, state: CONNECTED });
    },
  });
  render(<SettingsWindow client={client} />);
  expect(await screen.findByText("Blogosphere didn't answer. Try again.")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
  expect(await screen.findByText("obra/blog#main")).not.toBeNull();
});
