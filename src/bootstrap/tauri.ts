// ABOUTME: Tauri-runtime bootstrap — builds the real Services (SQLite via
// ABOUTME: tauri-plugin-sql, the GitHub client, and the sync engine) from
// ABOUTME: whatever token is in the OS keychain; github/sync stay null until
// ABOUTME: Settings saves one. buildGithubAndSync is reused live from there.
import Database from "@tauri-apps/plugin-sql";
import { createGitHubApi } from "../core/github/client";
import type { GitHubApi } from "../core/github/types";
import { createModel } from "../core/model";
import type { ModelApi } from "../core/model/types";
import { DEFAULT_REPO, type Services } from "../core/services";
// Imported from their own files, not the "../core/store" barrel: that barrel
// also re-exports createBetterSqliteDriver, which imports the better-sqlite3
// native module (fs/util.promisify) — fine under vitest's Node environment,
// fatal in the webview, and `vite dev` serves unbundled ESM (no tree-shaking
// to drop it), so pulling it in even transitively breaks `tauri dev` at
// runtime. Production `vite build` tree-shakes it away either way, but the
// direct import is correct regardless of that, not just a workaround.
import { createTauriSqlDriver } from "../core/store/drivers/tauri-sql";
import { createStore } from "../core/store/store";
import type { StoreApi } from "../core/store/types";
import { createSync } from "../core/sync/engine";
import type { SyncApi } from "../core/sync/types";
import { createTauriShell } from "../shell";
import type { ShellApi } from "../shell/types";
import { KEYCHAIN_TOKEN_KEY } from "../ui/app/state.types";

const DB_PATH = "sqlite:blogosphere.db";

interface GithubAndSync {
  github: GitHubApi;
  sync: SyncApi;
}

/**
 * Builds a fresh github+sync pair for a token. Exported so the Settings
 * "save token" flow (src/App.tsx) can rebuild these live, without an app
 * restart, the same way boot() builds them the first time.
 */
export function buildGithubAndSync(
  token: string,
  store: StoreApi,
  model: ModelApi,
  shell: ShellApi,
): GithubAndSync {
  const github = createGitHubApi({
    owner: DEFAULT_REPO.owner,
    repo: DEFAULT_REPO.repo,
    branch: DEFAULT_REPO.branch,
    token,
    // Native webview fetch, not the tauri-plugin-http one: api.github.com
    // sends CORS headers (spec, Auth & security), so the platform HTTP
    // stack works directly and needs no ACL capability grant. Bound so it
    // isn't called with a detached `this` (some fetch implementations throw
    // "Illegal invocation" otherwise).
    fetchImpl: globalThis.fetch.bind(globalThis),
  });
  const sync = createSync({
    github,
    store,
    model,
    now: Date.now,
    readAsset: (localPath) => shell.assetRead(localPath),
  });
  return { github, sync };
}

/** Builds the real Services for the Tauri runtime. github/sync are null
 *  until a token is found in the keychain (first run, or before Settings). */
export async function createTauriServices(): Promise<Services> {
  const shell = createTauriShell();
  const db = await Database.load(DB_PATH);
  const store = createStore(createTauriSqlDriver(db));
  await store.init();
  const model = createModel();

  const token = await shell.keychainGet(KEYCHAIN_TOKEN_KEY);
  const { github, sync } = token
    ? buildGithubAndSync(token, store, model, shell)
    : { github: null, sync: null };

  return { model, store, shell, github, sync, repo: DEFAULT_REPO };
}

export { writeText as tauriWriteClipboardText } from "@tauri-apps/plugin-clipboard-manager";
