// ABOUTME: Saving a GitHub token: GitHub checks it first, so a bad one never
// ABOUTME: replaces a good one; then it's saved, installed, and the first sync starts.
import type { GitHubApi } from "../core/github/types";
import type { Services } from "../core/services";
import type { SyncApi } from "../core/sync/types";
import { KEYCHAIN_TOKEN_KEY } from "../ui/app/state.types";

/** Why connecting failed, other than GitHub refusing the token (which
 *  rejects with GitHub's own error): the keychain refused it, or another
 *  token was still being checked. */
class ConnectError extends Error {
  readonly kind: "keychain" | "inFlight";
  constructor(kind: ConnectError["kind"], options?: ErrorOptions) {
    super(kind === "keychain" ? "Couldn't save the token." : "Already connecting.", options);
    this.name = "ConnectError";
    this.kind = kind;
  }
}

interface ConnectDeps {
  /** The Services in use right now. */
  current: () => Services;
  /** Swaps in new Services (App's setServices). */
  install: (next: Services) => void;
  /** Builds GitHub and sync for a token, or null without a GitHub runtime
   *  (the browser demo, which only stores the token). */
  build: ((token: string, services: Services) => { github: GitHubApi; sync: SyncApi }) | null;
  initialSync: (services: Services) => Promise<void>;
}

/**
 * Returns `connect(token)`. It rejects with GitHub's error when GitHub won't
 * accept the token (the saved token is untouched), and with a ConnectError
 * when the keychain fails or another token is still being checked. It resolves once the new services are installed; the first
 * sync (a full download on a fresh install) carries on in the background and
 * reports through sync status.
 */
function createConnect(deps: ConnectDeps): (token: string) => Promise<void> {
  let inFlight = false;
  async function saveToken(services: Services, token: string): Promise<void> {
    try {
      await services.shell.keychainSet(KEYCHAIN_TOKEN_KEY, token);
    } catch (cause) {
      throw new ConnectError("keychain", { cause });
    }
  }
  async function connect(token: string): Promise<void> {
    const services = deps.current();
    if (deps.build === null) {
      await saveToken(services, token);
      return;
    }
    const { github, sync } = deps.build(token, services);
    await github.getRef();
    await saveToken(services, token);
    const next: Services = { ...services, github, sync };
    deps.install(next);
    deps.initialSync(next).catch(() => undefined);
  }
  return async (token) => {
    if (inFlight) {
      throw new ConnectError("inFlight");
    }
    inFlight = true;
    try {
      await connect(token);
    } finally {
      inFlight = false;
    }
  };
}

export { type ConnectDeps, ConnectError, createConnect };
