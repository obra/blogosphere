// ABOUTME: Shared test harness — a FakeRemote plus a real better-sqlite3 store
// ABOUTME: and real model behind createSync(), for the sync engine's scenario tests.
import { createModel } from "../../model";
import type { ModelApi } from "../../model/types";
import { createBetterSqliteDriver, createStore } from "../../store";
import type { StoreApi } from "../../store/types";
import { createSync } from "../engine";
import type { SyncApi, SyncDeps } from "../types";
import { createFakeRemote, type FakeRemote } from "./fakeRemote";

const INITIAL_CLOCK = 1_700_000_000_000;

export interface TestHarness {
  remote: FakeRemote;
  store: StoreApi;
  model: ModelApi;
  deps: SyncDeps;
  sync: SyncApi;
  /** Mutable clock backing `deps.now()`; advance it between ops for determinism. */
  clock: { value: number };
  /** Registers bytes an outbox asset's `readAsset(localPath)` should resolve to. */
  setAssetBytes(localPath: string, bytes: Uint8Array | string): void;
}

export async function createHarness(): Promise<TestHarness> {
  const remote = createFakeRemote();
  const driver = createBetterSqliteDriver(":memory:");
  const store = createStore(driver);
  await store.init();
  const model = createModel();
  const assetBytes = new Map<string, Uint8Array>();
  const clock = { value: INITIAL_CLOCK };

  const deps: SyncDeps = {
    github: remote,
    store,
    model,
    now: () => clock.value,
    readAsset: (localPath: string) => {
      const bytes = assetBytes.get(localPath);
      if (!bytes) {
        return Promise.reject(new Error(`no fake asset registered at ${localPath}`));
      }
      return Promise.resolve(bytes);
    },
  };

  const sync = createSync(deps);

  return {
    remote,
    store,
    model,
    deps,
    sync,
    clock,
    setAssetBytes(localPath, bytes) {
      assetBytes.set(
        localPath,
        typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes,
      );
    },
  };
}
