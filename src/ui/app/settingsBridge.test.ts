// ABOUTME: installSettingsBridge — the main window answers the Settings window
// ABOUTME: (state, token, templates) and tells it whenever that state changes.
import { describe, expect, it, vi } from "vitest";
import { GitHubError } from "../../core/github/types";
import { createSettingsClient } from "../../settings/client";
import { MAIN_WINDOW, SETTINGS_WINDOW, type SettingsState } from "../../settings/protocol";
import { createBus } from "../../settings/testing";
import { installSettingsBridge } from "./settingsBridge";
import { createAppStore } from "./state";
import { DEFAULT_COMMIT_TEMPLATES } from "./state.types";
import { createFakeSync } from "./testing/fakeSync";
import { buildFakeServices } from "./testing/fakes";

async function setup(connect: (token: string) => Promise<void> = () => Promise.resolve()) {
  const fake = buildFakeServices({ withSync: false });
  const store = createAppStore(fake.services);
  const bus = createBus();
  const dispose = await installSettingsBridge({
    transport: bus.forWindow(MAIN_WINDOW),
    store,
    connect,
  });
  let id = 0;
  const client = createSettingsClient(bus.forWindow(SETTINGS_WINDOW), {
    createId: () => {
      id += 1;
      return `r${id}`;
    },
  });
  return { store, client, dispose, services: fake.services };
}

describe("installSettingsBridge", () => {
  it("answers with what Settings shows", async () => {
    const { client } = await setup();
    expect((await client.getState()).state).toEqual({
      connected: false,
      repo: "obra/blog#main",
      templates: DEFAULT_COMMIT_TEMPLATES,
    });
  });

  it("connects a token, or explains why not, with no toast", async () => {
    const connect = vi.fn((token: string) =>
      token === "good"
        ? Promise.resolve()
        : Promise.reject(new GitHubError("auth", "getRef: Bad credentials")),
    );
    const { client, store } = await setup(connect);
    expect(await client.saveToken("good")).toMatchObject({ ok: true });
    const refused = await client.saveToken("bad");
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("GitHub rejected that token");
    expect(store.getState().toasts).toEqual([]);
  });

  it("saves templates", async () => {
    const { client, store } = await setup();
    const templates = { ...DEFAULT_COMMIT_TEMPLATES, edit: "Tweak {title}" };
    expect(await client.saveTemplates(templates)).toMatchObject({ ok: true });
    expect(store.getState().commitTemplates).toEqual(templates);
  });

  it("tells Settings when the connection or templates change", async () => {
    const { client, store, services } = await setup();
    const seen: SettingsState[] = [];
    await client.onState((state) => seen.push(state));
    store.getState().setServices({ ...services, sync: createFakeSync() });
    await store.getState().setCommitTemplates({ ...DEFAULT_COMMIT_TEMPLATES, delete: "Bye" });
    expect(seen.map((state) => [state.connected, state.templates.delete])).toEqual([
      [true, DEFAULT_COMMIT_TEMPLATES.delete],
      [true, "Bye"],
    ]);
  });

  it("stops answering once disposed", async () => {
    vi.useFakeTimers();
    const { client, dispose } = await setup();
    dispose();
    const answer = client.getState();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await answer).ok).toBe(false);
    vi.useRealTimers();
  });
});
