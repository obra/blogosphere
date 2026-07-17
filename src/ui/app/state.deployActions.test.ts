// @vitest-environment jsdom
// ABOUTME: Tests for watchDeploy — polling GitHub Actions runs for a pushed
// ABOUTME: commit and reporting the outcome through the activity log/toasts.
import { beforeEach, expect, it } from "vitest";
import type { GitHubApi, WorkflowRun } from "../../core/github/types";
import { GitHubError } from "../../core/github/types";
import { createAppStore } from "./state";
import { resetDeployWatchForTests } from "./state.deployActions";
import { buildFakeServices } from "./testing/fakes";

function instantWait(): Promise<void> {
  return Promise.resolve();
}

beforeEach(() => {
  resetDeployWatchForTests();
});

function workflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    name: "Deploy Eleventy site to Pages",
    status: "completed",
    conclusion: "success",
    htmlUrl: "https://github.com/obra/blog/actions/runs/1",
    ...overrides,
  };
}

/** Only listWorkflowRunsForSha is exercised by watchDeploy — the rest of
 *  GitHubApi is deliberately left unimplemented (see feature E's contract
 *  note for the same pattern). */
function fakeGithub(listWorkflowRunsForSha: GitHubApi["listWorkflowRunsForSha"]): GitHubApi {
  return { listWorkflowRunsForSha } as GitHubApi;
}

it("a successful run logs 'Live on blog.fsck.com' and toasts success", async () => {
  const run = workflowRun({ conclusion: "success", htmlUrl: "https://x/runs/1" });
  const github = fakeGithub(() => Promise.resolve([run]));
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore({ ...services, github });

  await store.getState().watchDeploy("sha1");

  const log = store.getState().syncLog;
  expect(log).toHaveLength(1);
  expect(log[0]?.level).toBe("info");
  expect(log[0]?.message).toBe("Live on blog.fsck.com ✓");
  expect(log[0]?.detail).toBe("https://x/runs/1");
  const { toasts } = store.getState();
  expect(toasts).toHaveLength(1);
  expect(toasts[0]?.tone).toBe("success");
  expect(toasts[0]?.message).toBe("Live on blog.fsck.com");
});

it("a failed run logs an error with the run's URL and no toast", async () => {
  const run = workflowRun({ conclusion: "failure", htmlUrl: "https://x/runs/2" });
  const github = fakeGithub(() => Promise.resolve([run]));
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore({ ...services, github });

  await store.getState().watchDeploy("sha2");

  const log = store.getState().syncLog;
  expect(log).toHaveLength(1);
  expect(log[0]?.level).toBe("error");
  expect(log[0]?.message).toBe("Deploy failed — the site still shows the previous version");
  expect(log[0]?.detail).toBe("https://x/runs/2");
  expect(store.getState().toasts).toHaveLength(0);
});

it("gives up after the poll budget with 'Couldn't find a deploy for this push'", async () => {
  const waitCalls: number[] = [];
  resetDeployWatchForTests({
    wait: (ms) => {
      waitCalls.push(ms);
      return instantWait();
    },
  });
  const github = fakeGithub(() => Promise.resolve([]));
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore({ ...services, github });

  await store.getState().watchDeploy("sha3");

  const log = store.getState().syncLog;
  expect(log).toHaveLength(1);
  expect(log[0]?.level).toBe("info");
  expect(log[0]?.message).toBe("Couldn't find a deploy for this push");
  // ~4 minutes at a ~10s cadence = 24 attempts, waiting between each but not
  // after the last one => 23 waits of 10s.
  expect(waitCalls).toHaveLength(23);
  expect(waitCalls.every((ms) => ms === 10_000)).toBe(true);
});

it("a non-auth error after the first poll is a transient miss, not fatal", async () => {
  resetDeployWatchForTests({ wait: instantWait });
  let calls = 0;
  const run = workflowRun({ conclusion: "success", htmlUrl: "https://x/runs/3" });
  const github = fakeGithub(() => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve([]);
    }
    if (calls === 2) {
      return Promise.reject(new GitHubError("network", "temporary blip"));
    }
    return Promise.resolve([run]);
  });
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore({ ...services, github });

  await store.getState().watchDeploy("sha4");

  const log = store.getState().syncLog;
  expect(log).toHaveLength(1);
  expect(log[0]?.message).toBe("Live on blog.fsck.com ✓");
});

it("an auth error on the first poll logs one warning, never toasts, and disables future watches", async () => {
  resetDeployWatchForTests({ wait: instantWait });
  let calls = 0;
  const github = fakeGithub(() => {
    calls += 1;
    return Promise.reject(new GitHubError("auth", "bad credentials"));
  });
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore({ ...services, github });

  await store.getState().watchDeploy("sha5");
  // A later push (different sha) must not retry the request or re-log.
  await store.getState().watchDeploy("sha6");

  expect(calls).toBe(1);
  const log = store.getState().syncLog;
  expect(log).toHaveLength(1);
  expect(log[0]?.level).toBe("info");
  expect(log[0]?.message).toBe("This token can't watch deploys (needs Actions read)");
  expect(store.getState().toasts).toHaveLength(0);
});

it("a network error on the very first poll is a transient miss, not a permission problem", async () => {
  resetDeployWatchForTests({ wait: instantWait });
  let calls = 0;
  const run = workflowRun({ conclusion: "success", htmlUrl: "https://x/runs/4" });
  const github = fakeGithub(() => {
    calls += 1;
    if (calls === 1) {
      return Promise.reject(new GitHubError("network", "offline for a moment"));
    }
    return Promise.resolve([run]);
  });
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore({ ...services, github });

  await store.getState().watchDeploy("sha7");

  const log = store.getState().syncLog;
  expect(log).toHaveLength(1);
  expect(log[0]?.message).toBe("Live on blog.fsck.com ✓");
});

it("a first-poll failure never disables deploy watching for later pushes", async () => {
  resetDeployWatchForTests({ wait: instantWait });
  const run = workflowRun({ conclusion: "success", htmlUrl: "https://x/runs/5" });
  const github = fakeGithub((sha) => {
    if (sha === "sha-blip") {
      // Not a GitHubError at all — even a bare throw must not read as
      // "this token can't watch deploys".
      return Promise.reject(new Error("boom"));
    }
    return Promise.resolve([run]);
  });
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore({ ...services, github });

  await store.getState().watchDeploy("sha-blip");
  await store.getState().watchDeploy("sha-next");

  const messages = store.getState().syncLog.map((entry) => entry.message);
  expect(messages).not.toContain("This token can't watch deploys (needs Actions read)");
  expect(messages).toContain("Live on blog.fsck.com ✓");
});

it("reports a still-running deploy at timeout instead of claiming none was found", async () => {
  resetDeployWatchForTests({ wait: instantWait });
  const slowRun = workflowRun({
    status: "in_progress",
    conclusion: null,
    htmlUrl: "https://x/runs/9",
  });
  const github = fakeGithub(() => Promise.resolve([slowRun]));
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore({ ...services, github });

  await store.getState().watchDeploy("sha-slow");

  const log = store.getState().syncLog;
  expect(log).toHaveLength(1);
  expect(log[0]?.level).toBe("info");
  expect(log[0]?.message).toBe("Deploy is still running — check the run on GitHub for the result");
  expect(log[0]?.detail).toBe("https://x/runs/9");
});

it("a second watchDeploy for the same sha while one is active is a no-op", async () => {
  resetDeployWatchForTests({ wait: instantWait });
  let calls = 0;
  const run = workflowRun({ conclusion: "success" });
  const github = fakeGithub(() => {
    calls += 1;
    return Promise.resolve([run]);
  });
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore({ ...services, github });

  await Promise.all([store.getState().watchDeploy("sha8"), store.getState().watchDeploy("sha8")]);

  expect(calls).toBe(1);
  expect(store.getState().syncLog).toHaveLength(1);
});

it("does nothing when services.github is null", async () => {
  const { services } = buildFakeServices({ withSync: false });
  const store = createAppStore(services);

  await store.getState().watchDeploy("sha9");

  expect(store.getState().syncLog).toHaveLength(0);
  expect(store.getState().toasts).toHaveLength(0);
});
