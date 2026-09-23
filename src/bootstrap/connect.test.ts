// ABOUTME: createConnect — saving a GitHub token: checked with GitHub before it
// ABOUTME: replaces the saved one, installed right away, first sync not awaited.
import { describe, expect, it, vi } from "vitest";
import type { GitHubApi } from "../core/github/types";
import { GitHubError } from "../core/github/types";
import type { Services } from "../core/services";
import { KEYCHAIN_TOKEN_KEY } from "../ui/app/state.types";
import { createFakeSync } from "../ui/app/testing/fakeSync";
import { buildFakeServices } from "../ui/app/testing/fakes";
import { ConnectError, createConnect } from "./connect";

function setup(options: { getRef?: () => Promise<unknown>; initialSync?: () => Promise<void> }) {
  const fake = buildFakeServices({ withSync: false });
  let current: Services = fake.services;
  const install = vi.fn((next: Services) => {
    current = next;
  });
  const github = {
    getRef: options.getRef ?? (() => Promise.resolve({ sha: "head" })),
  } as unknown as GitHubApi;
  const connect = createConnect({
    current: () => current,
    install,
    build: () => ({ github, sync: createFakeSync() }),
    initialSync: options.initialSync ?? (() => Promise.resolve()),
  });
  return { connect, install, shell: fake.shell, current: () => current };
}

describe("createConnect", () => {
  it("a token GitHub accepts is saved and installed", async () => {
    const { connect, install, shell } = setup({});
    await connect("good-token");
    expect(await shell.keychainGet(KEYCHAIN_TOKEN_KEY)).toBe("good-token");
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("a token GitHub rejects leaves the saved token and the services alone", async () => {
    const { connect, install, shell } = setup({
      getRef: () => Promise.reject(new GitHubError("auth", "getRef: Bad credentials")),
    });
    await shell.keychainSet(KEYCHAIN_TOKEN_KEY, "old-good-token");
    await expect(connect("bad-token")).rejects.toBeInstanceOf(GitHubError);
    expect(await shell.keychainGet(KEYCHAIN_TOKEN_KEY)).toBe("old-good-token");
    expect(install).not.toHaveBeenCalled();
  });

  it("a keychain failure says so and installs nothing", async () => {
    const { connect, install, shell } = setup({});
    shell.keychainSet = () => Promise.reject(new Error("errSecAuthFailed"));
    await expect(connect("good-token")).rejects.toMatchObject({ kind: "keychain" });
    expect(install).not.toHaveBeenCalled();
  });

  it("returns once installed, without waiting for the first sync", async () => {
    let finishSync: () => void = () => undefined;
    const { connect, install } = setup({
      initialSync: () =>
        new Promise<void>((resolve) => {
          finishSync = resolve;
        }),
    });
    await connect("good-token");
    expect(install).toHaveBeenCalledTimes(1);
    finishSync();
  });

  it("refuses a second token while one is being checked", async () => {
    let answer: (value: unknown) => void = () => undefined;
    let calls = 0;
    const { connect } = setup({
      getRef: () => {
        calls += 1;
        return calls > 1
          ? Promise.resolve({ sha: "head" })
          : new Promise((resolve) => {
              answer = resolve;
            });
      },
    });
    const first = connect("one");
    await expect(connect("two")).rejects.toBeInstanceOf(ConnectError);
    answer({ sha: "head" });
    await first;
    await expect(connect("three")).resolves.toBeUndefined();
  });

  it("without a GitHub runtime (the browser demo) just saves the token", async () => {
    const fake = buildFakeServices({ withSync: false });
    const install = vi.fn();
    const connect = createConnect({
      current: () => fake.services,
      install,
      build: null,
      initialSync: () => Promise.resolve(),
    });
    await connect("demo-token");
    expect(await fake.shell.keychainGet(KEYCHAIN_TOKEN_KEY)).toBe("demo-token");
    expect(install).not.toHaveBeenCalled();
  });
});
