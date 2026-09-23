// @vitest-environment jsdom
// ABOUTME: The deploy state the Activity popover shows: only the latest push,
// ABOUTME: never stuck on "Deploying…", and "failed" until something newer.
import { beforeEach, expect, it } from "vitest";
import type { GitHubApi, WorkflowRun } from "../../core/github/types";
import { GitHubError } from "../../core/github/types";
import { createAppStore } from "./state";
import { resetDeployWatchForTests } from "./state.deployActions";
import { buildFakeServices } from "./testing/fakes";

let clock = 1000;

beforeEach(() => {
  clock = 1000;
  resetDeployWatchForTests({ wait: () => Promise.resolve() });
});

function run(conclusion: WorkflowRun["conclusion"]): WorkflowRun {
  return { name: "Deploy", status: "completed", conclusion, htmlUrl: "https://x/runs/1" };
}

function storeWith(listWorkflowRunsForSha: GitHubApi["listWorkflowRunsForSha"]) {
  const { services } = buildFakeServices({ withSync: false });
  const github = { listWorkflowRunsForSha } as GitHubApi;
  return createAppStore({ ...services, github }, { now: () => clock });
}

it("is Deploying… while the run is going, then Live with the time", async () => {
  let finish: (runs: WorkflowRun[]) => void = () => undefined;
  const store = storeWith(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const watching = store.getState().watchDeploy("sha1");
  expect(store.getState().deploy).toEqual({ sha: "sha1", state: "deploying", at: 1000 });
  clock = 5000;
  finish([run("success")]);
  await watching;
  expect(store.getState().deploy).toEqual({ sha: "sha1", state: "live", at: 5000 });
});

it("is Failed when the run fails", async () => {
  const store = storeWith(() => Promise.resolve([run("failure")]));
  await store.getState().watchDeploy("sha1");
  expect(store.getState().deploy?.state).toBe("failed");
});

it("clears when watching stops without an answer (auth error)", async () => {
  const store = storeWith(() => Promise.reject(new GitHubError("auth", "no scope")));
  await store.getState().watchDeploy("sha1");
  expect(store.getState().deploy).toBeNull();
});

it("clears when the poll budget runs out", async () => {
  const store = storeWith(() => Promise.resolve([]));
  await store.getState().watchDeploy("sha1");
  expect(store.getState().deploy).toBeNull();
});

it("an older push finishing late never overwrites the newer one", async () => {
  const finishers = new Map<string, (runs: WorkflowRun[]) => void>();
  const store = storeWith(
    (sha) =>
      new Promise((resolve) => {
        finishers.set(sha, resolve);
      }),
  );
  const older = store.getState().watchDeploy("old");
  const newer = store.getState().watchDeploy("new");
  finishers.get("old")?.([run("failure")]);
  await older;
  expect(store.getState().deploy).toMatchObject({ sha: "new", state: "deploying" });
  finishers.get("new")?.([run("success")]);
  await newer;
  expect(store.getState().deploy).toMatchObject({ sha: "new", state: "live" });
});
