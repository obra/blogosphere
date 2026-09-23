// ABOUTME: createSettingsClient — the Settings window's side: requests answered
// ABOUTME: by id, a timeout when the main window doesn't answer, and state broadcasts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMMIT_TEMPLATES } from "../ui/app/state.types";
import { createSettingsClient } from "./client";
import { MAIN_WINDOW, SETTINGS_EVENTS, SETTINGS_WINDOW, type SettingsState } from "./protocol";
import { createBus } from "./testing";

const STATE: SettingsState = {
  connected: true,
  repo: "obra/blog#main",
  templates: DEFAULT_COMMIT_TEMPLATES,
};

function setup() {
  const bus = createBus();
  let nextId = 0;
  const client = createSettingsClient(bus.forWindow(SETTINGS_WINDOW), {
    createId: () => {
      nextId += 1;
      return `req-${nextId}`;
    },
  });
  const main = bus.forWindow(MAIN_WINDOW);
  return { client, main };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createSettingsClient", () => {
  it("resolves a request with the reply carrying its id", async () => {
    const { client, main } = setup();
    await main.listen<{ id: string }>(SETTINGS_EVENTS.getState, (request) => {
      main.emitTo(SETTINGS_WINDOW, SETTINGS_EVENTS.reply, { id: "someone-else", ok: false });
      main.emitTo(SETTINGS_WINDOW, SETTINGS_EVENTS.reply, {
        id: request.id,
        ok: true,
        state: STATE,
      });
    });
    await expect(client.getState()).resolves.toEqual({ id: "req-1", ok: true, state: STATE });
  });

  it("sends the token and the templates to the main window", async () => {
    const { client, main } = setup();
    const seen: unknown[] = [];
    await Promise.all(
      [SETTINGS_EVENTS.saveToken, SETTINGS_EVENTS.saveTemplates].map((event) =>
        main.listen<{ id: string }>(event, (request) => {
          seen.push(request);
          main.emitTo(SETTINGS_WINDOW, SETTINGS_EVENTS.reply, { id: request.id, ok: true });
        }),
      ),
    );
    await client.saveToken("github_pat_x");
    await client.saveTemplates(DEFAULT_COMMIT_TEMPLATES);
    expect(seen).toEqual([
      { id: "req-1", token: "github_pat_x" },
      { id: "req-2", templates: DEFAULT_COMMIT_TEMPLATES },
    ]);
  });

  it("gives up after 10s with an error to show", async () => {
    vi.useFakeTimers();
    const { client } = setup();
    const answer = client.getState();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(answer).resolves.toEqual({
      id: "req-1",
      ok: false,
      error: "Blogosphere didn't answer. Try again.",
    });
  });

  it("gives a token check 30s", async () => {
    vi.useFakeTimers();
    const { client } = setup();
    let settled = false;
    client.saveToken("t").then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(settled).toBe(true);
  });

  it("passes on the main window's state broadcasts", async () => {
    const { client, main } = setup();
    const received: SettingsState[] = [];
    await client.onState((state) => received.push(state));
    await main.emitTo(SETTINGS_WINDOW, SETTINGS_EVENTS.state, STATE);
    expect(received).toEqual([STATE]);
  });
});
