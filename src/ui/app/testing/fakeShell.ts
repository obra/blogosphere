// ABOUTME: In-memory ShellApi fake — keychain/assets/share-inbox/clipboard held
// ABOUTME: in plain JS structures, with test-only setters to drive scenarios.
import type { Platform, SharePayload, ShellApi } from "../../../shell/types";

interface FakeShellState {
  platform: Platform;
  keychain: Map<string, string>;
  shareInbox: SharePayload[];
  assetBytes: Map<string, Uint8Array>;
  assetLocalPathByRepoPath: Map<string, string>;
  clipboardUrl: string | null;
}

interface FakeShellOptions {
  platform?: Platform;
  clipboardUrl?: string | null;
}

interface FakeShell extends ShellApi {
  /** Test-only: seed the clipboard for the "+ Link" prefill flow. */
  setClipboardUrl(url: string | null): void;
  /** Test-only: enqueue a share-sheet payload as if the OS extension wrote it. */
  addShareInboxItem(payload: SharePayload): void;
}

function keychainSet(state: FakeShellState, key: string, value: string): Promise<void> {
  state.keychain.set(key, value);
  return Promise.resolve();
}

function keychainDelete(state: FakeShellState, key: string): Promise<void> {
  state.keychain.delete(key);
  return Promise.resolve();
}

function shareInboxAck(state: FakeShellState, id: string): Promise<void> {
  state.shareInbox = state.shareInbox.filter((payload) => payload.id !== id);
  return Promise.resolve();
}

function assetWrite(state: FakeShellState, repoPath: string, bytes: Uint8Array): Promise<string> {
  const localPath = `mem://${repoPath}`;
  state.assetBytes.set(localPath, bytes);
  state.assetLocalPathByRepoPath.set(repoPath, localPath);
  return Promise.resolve(localPath);
}

function assetRead(state: FakeShellState, localPath: string): Promise<Uint8Array> {
  const bytes = state.assetBytes.get(localPath);
  if (!bytes) {
    return Promise.reject(new Error(`No asset cached at ${localPath}`));
  }
  return Promise.resolve(bytes);
}

function createState(options: FakeShellOptions): FakeShellState {
  return {
    platform: options.platform ?? "web",
    keychain: new Map(),
    shareInbox: [],
    assetBytes: new Map(),
    assetLocalPathByRepoPath: new Map(),
    clipboardUrl: options.clipboardUrl ?? null,
  };
}

/** A fresh in-memory ShellApi. Defaults to the "web" platform, like the real
 *  fake in src/shell/fake.ts — Mac-only behavior must be opted into. */
function createFakeShell(options: FakeShellOptions = {}): FakeShell {
  const state = createState(options);
  return {
    platform: () => state.platform,
    keychainGet: (key) => Promise.resolve(state.keychain.get(key) ?? null),
    keychainSet: (key, value) => keychainSet(state, key, value),
    keychainDelete: (key) => keychainDelete(state, key),
    shareInboxList: () => Promise.resolve([...state.shareInbox]),
    shareInboxAck: (id) => shareInboxAck(state, id),
    assetWrite: (repoPath, bytes) => assetWrite(state, repoPath, bytes),
    assetRead: (localPath) => assetRead(state, localPath),
    assetPathFor: (repoPath) =>
      Promise.resolve(state.assetLocalPathByRepoPath.get(repoPath) ?? null),
    assetDisplayUrl: (localPath) => localPath,
    clipboardReadUrl: () => Promise.resolve(state.clipboardUrl),
    setClipboardUrl: (url) => {
      state.clipboardUrl = url;
    },
    addShareInboxItem: (payload) => {
      state.shareInbox.push(payload);
    },
  };
}

export type { FakeShell, FakeShellOptions };
export { createFakeShell };
