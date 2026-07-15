// ABOUTME: DI aggregate — the one object the UI consumes. Wired with real
// ABOUTME: implementations at app start, with fakes in tests and Storybook-style dev.

import type { GitHubApi } from "./github/types";
import type { ModelApi } from "./model/types";
import type { StoreApi } from "./store/types";
import type { SyncApi } from "./sync/types";
import type { ShellApi } from "../shell/types";

export interface RepoConfig {
  owner: string; // "obra"
  repo: string; // "blog"
  branch: string; // "main"
}

export const DEFAULT_REPO: RepoConfig = {
  owner: "obra",
  repo: "blog",
  branch: "main",
};

/** Everything the UI needs. github/sync are null until a token is configured. */
export interface Services {
  model: ModelApi;
  store: StoreApi;
  shell: ShellApi;
  github: GitHubApi | null;
  sync: SyncApi | null;
  repo: RepoConfig;
}
