// ABOUTME: In-memory GitHubApi test double with real content-addressed
// ABOUTME: semantics — blobs/trees/commits keyed by a stable hash, CAS ref updates.
// biome-ignore-all lint/suspicious/useAwait: GitHubApi methods are declared async
// (with no internal await, since this in-memory fake is synchronous) for the same
// reason store/drivers/better-sqlite3.ts is — a synchronous throw here must still
// surface as a rejected Promise, matching GitHubApi's real (network-backed) contract.
import {
  type CommitInfo,
  type GitHubApi,
  GitHubError,
  type TreeChange,
  type TreeEntry,
  type UpdateRefResult,
} from "../../github/types";

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

const HASH_SEED_A = 5381;
const HASH_SEED_B = 52_711;
const HASH_MULTIPLIER_A = 33;
const HASH_MULTIPLIER_B = 37;
// Both just under 2**32: keeps each half's decimal-to-hex render at a stable
// 8-digit width without needing any bitwise truncation.
const HASH_MODULUS_A = 4_294_967_291;
const HASH_MODULUS_B = 4_294_967_279;
const HASH_HEX_WIDTH = 8;
const HEX_RADIX = 16;

/**
 * Deterministic, dependency-free content hash (two parallel djb2-style
 * rolling hashes, arithmetic only — no bitwise ops, no node:crypto). Not
 * cryptographic — "stable" (same content always yields the same sha, and
 * collisions are astronomically unlikely at test scale) is the only property
 * a content-addressed fake needs.
 */
function stableHash(bytes: Uint8Array): string {
  let h1 = HASH_SEED_A;
  let h2 = HASH_SEED_B;
  for (const byte of bytes) {
    h1 = (h1 * HASH_MULTIPLIER_A + byte) % HASH_MODULUS_A;
    h2 = (h2 * HASH_MULTIPLIER_B + byte) % HASH_MODULUS_B;
  }
  const hex1 = h1.toString(HEX_RADIX).padStart(HASH_HEX_WIDTH, "0");
  const hex2 = h2.toString(HEX_RADIX).padStart(HASH_HEX_WIDTH, "0");
  return `${hex1}${hex2}`;
}

/**
 * In-memory GitHubApi with real git-ish semantics: content-addressed blobs
 * and trees, a commit chain, and a fast-forward-only ref. Test-control extras
 * (`initRepo`, `pushExternalChange`, `raceOnNextUpdateRef`, `readFile`,
 * `offline`) simulate the outside world moving the repo without going
 * through the engine under test.
 */
export class FakeRemote implements GitHubApi {
  private readonly blobs = new Map<string, Uint8Array>();
  private readonly trees = new Map<string, TreeEntry[]>();
  private readonly commits = new Map<string, CommitInfo>();
  private ref: string | null = null;
  private commitCounter = 0;
  private pendingRace: (() => void) | null = null;

  /** When true, every method throws a GitHubError("network", ...) immediately. */
  // biome-ignore lint/style/noInferrableTypes: load-bearing, not redundant — without it, noUnnecessaryConditions below infers the literal `false` (external `remote.offline = true` assignments aren't visible to it) and flags assertOnline() as dead code.
  offline: boolean = false;

  private assertOnline(): void {
    if (this.offline) {
      throw new GitHubError("network", "simulated network failure");
    }
  }

  private putBlob(bytes: Uint8Array): string {
    const sha = stableHash(bytes);
    if (!this.blobs.has(sha)) {
      this.blobs.set(sha, bytes);
    }
    return sha;
  }

  private putTree(entries: readonly TreeEntry[]): string {
    const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
    const canonical = sorted
      .map((entry) => `${entry.mode} ${entry.type} ${entry.sha}\t${entry.path}`)
      .join("\n");
    const sha = stableHash(utf8Bytes(canonical));
    if (!this.trees.has(sha)) {
      this.trees.set(sha, sorted);
    }
    return sha;
  }

  private putCommit(treeSha: string, parents: readonly string[], message: string): string {
    this.commitCounter += 1;
    // The counter (not content) breaks ties between commits that would
    // otherwise be identical (same tree/parents/message) — same as a real
    // commit's timestamp does — so two such commits still get distinct shas.
    const canonical = `tree ${treeSha}\nparents ${parents.join(",")}\nseq ${this.commitCounter}\n\n${message}`;
    const sha = stableHash(utf8Bytes(canonical));
    this.commits.set(sha, { sha, treeSha, parents: [...parents], message });
    return sha;
  }

  private requireTree(sha: string): TreeEntry[] {
    const entries = this.trees.get(sha);
    if (!entries) {
      throw new GitHubError("not-found", `unknown tree ${sha}`);
    }
    return entries;
  }

  private applyChanges(
    base: readonly TreeEntry[],
    changes: Readonly<Record<string, string | null>>,
  ): TreeEntry[] {
    const byPath = new Map(base.map((entry) => [entry.path, entry]));
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) {
        byPath.delete(path);
      } else {
        byPath.set(path, {
          path,
          mode: "100644",
          type: "blob",
          sha: this.putBlob(utf8Bytes(content)),
        });
      }
    }
    return [...byPath.values()];
  }

  private staleRefOnce: string | null = null;

  /** Test-only: the next getRef() serves this sha instead of the real head —
   *  simulating GitHub's read-replica lag returning a pre-push head. */
  serveStaleRefOnce(sha: string): void {
    this.staleRefOnce = sha;
  }

  // ---- GitHubApi ----

  async getRef(): Promise<string> {
    this.assertOnline();
    if (this.staleRefOnce !== null) {
      const stale = this.staleRefOnce;
      this.staleRefOnce = null;
      return stale;
    }
    if (this.ref === null) {
      throw new GitHubError("not-found", "ref has no commits yet");
    }
    return this.ref;
  }

  async getCommit(sha: string): Promise<CommitInfo> {
    this.assertOnline();
    const commit = this.commits.get(sha);
    if (!commit) {
      throw new GitHubError("not-found", `unknown commit ${sha}`);
    }
    return commit;
  }

  async getTreeRecursive(treeSha: string): Promise<TreeEntry[]> {
    this.assertOnline();
    return [...this.requireTree(treeSha)];
  }

  async getBlob(sha: string): Promise<Uint8Array> {
    this.assertOnline();
    const bytes = this.blobs.get(sha);
    if (!bytes) {
      throw new GitHubError("not-found", `unknown blob ${sha}`);
    }
    return bytes;
  }

  async getBlobText(sha: string): Promise<string> {
    return decodeUtf8(await this.getBlob(sha));
  }

  async createBlob(content: string | Uint8Array): Promise<string> {
    this.assertOnline();
    return this.putBlob(typeof content === "string" ? utf8Bytes(content) : content);
  }

  async createTree(baseTreeSha: string, changes: readonly TreeChange[]): Promise<string> {
    this.assertOnline();
    const base = this.requireTree(baseTreeSha);
    const byPath = new Map(base.map((entry) => [entry.path, entry]));
    for (const change of changes) {
      if (change.sha === null) {
        byPath.delete(change.path);
      } else {
        byPath.set(change.path, {
          path: change.path,
          mode: change.mode,
          type: "blob",
          sha: change.sha,
        });
      }
    }
    return this.putTree([...byPath.values()]);
  }

  async createCommit(input: {
    treeSha: string;
    parents: string[];
    message: string;
  }): Promise<string> {
    this.assertOnline();
    this.requireTree(input.treeSha);
    for (const parent of input.parents) {
      if (!this.commits.has(parent)) {
        throw new GitHubError("not-found", `unknown parent commit ${parent}`);
      }
    }
    return this.putCommit(input.treeSha, input.parents, input.message);
  }

  async updateRef(newSha: string): Promise<UpdateRefResult> {
    this.assertOnline();
    if (this.pendingRace) {
      const run = this.pendingRace;
      this.pendingRace = null;
      run();
    }
    const commit = this.commits.get(newSha);
    if (!commit) {
      throw new GitHubError("not-found", `unknown commit ${newSha}`);
    }
    // Fast-forward only: the current ref must be the new commit's parent.
    // force is never an option here — there is no parameter for it.
    if (this.ref !== null && !commit.parents.includes(this.ref)) {
      return { ok: false, reason: "not-fast-forward" };
    }
    this.ref = newSha;
    return { ok: true, newSha };
  }

  // ---- Test control ----

  /** Seeds the repo with an initial commit containing these files, as if
   *  freshly cloned. Returns the initial commit sha. */
  initRepo(files: Readonly<Record<string, string>>): string {
    const treeSha = this.putTree(this.applyChanges([], files));
    const commitSha = this.putCommit(treeSha, [], "Initial commit");
    this.ref = commitSha;
    return commitSha;
  }

  /**
   * Simulates a push that didn't go through the engine under test (e.g.
   * Claude Code committing directly), unconditionally advancing the ref.
   * `files`: path -> new content, or null to delete that path.
   */
  pushExternalChange(
    files: Readonly<Record<string, string | null>>,
    message = "External change",
  ): string {
    if (this.ref === null) {
      throw new Error("pushExternalChange: repo has no initial commit — call initRepo first");
    }
    const head = this.commits.get(this.ref);
    if (!head) {
      throw new Error("pushExternalChange: ref points at an unknown commit");
    }
    const treeSha = this.putTree(this.applyChanges(this.requireTree(head.treeSha), files));
    const commitSha = this.putCommit(treeSha, [this.ref], message);
    this.ref = commitSha;
    return commitSha;
  }

  /**
   * Arms a one-shot hook: the *next* updateRef call first applies this
   * external change (advancing the ref out from under the pending commit),
   * then proceeds — so that call observes a stale parent and reports
   * not-fast-forward, exactly like a real race against another writer.
   */
  raceOnNextUpdateRef(
    files: Readonly<Record<string, string | null>>,
    message = "External change (race)",
  ): void {
    this.pendingRace = () => {
      this.pushExternalChange(files, message);
    };
  }

  /** Current blob sha for a path in HEAD, or null if absent / repo empty. */
  currentBlobSha(path: string): string | null {
    if (this.ref === null) {
      return null;
    }
    const head = this.commits.get(this.ref);
    if (!head) {
      return null;
    }
    return this.trees.get(head.treeSha)?.find((entry) => entry.path === path)?.sha ?? null;
  }

  /** Current text content for a path in HEAD, or null if absent. */
  readFile(path: string): string | null {
    const sha = this.currentBlobSha(path);
    if (sha === null) {
      return null;
    }
    const bytes = this.blobs.get(sha);
    return bytes ? decodeUtf8(bytes) : null;
  }

  /** All managed-looking paths currently in HEAD (for property-test invariants). */
  currentPaths(): string[] {
    if (this.ref === null) {
      return [];
    }
    const head = this.commits.get(this.ref);
    if (!head) {
      return [];
    }
    return (this.trees.get(head.treeSha) ?? []).map((entry) => entry.path);
  }
}

export function createFakeRemote(): FakeRemote {
  return new FakeRemote();
}
