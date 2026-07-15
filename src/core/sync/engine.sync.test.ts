// ABOUTME: sync() composite behavior — single status cycle, and graceful
// ABOUTME: (non-throwing) offline handling versus pull()/push() throwing directly.
import { describe, expect, it } from "vitest";
import { GitHubError } from "../github/types";
import { createHarness } from "./testing/harness";

describe("sync(): offline handling", () => {
  it("resolves gracefully with an offline status instead of throwing", async () => {
    const harness = await createHarness();
    const { remote, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Hello", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    remote.offline = true;
    const result = await sync.sync();

    expect(result).toEqual({ pull: null, push: null });
    const status = sync.status();
    expect(status.state).toBe("offline");
    expect(status.message).toBeDefined();
  });

  it("still throws from pull() directly when the network is down (only sync() is graceful)", async () => {
    const harness = await createHarness();
    const { remote, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Hello", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    remote.offline = true;
    await expect(sync.pull()).rejects.toBeInstanceOf(GitHubError);
    expect(sync.status().state).toBe("error");
  });

  it("never calls updateRef while offline", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Hello", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const entry = await store.getEntry(post.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...entry, workingContent: `${post.raw}edit\n`, dirty: true });

    remote.offline = true;
    const refBefore = await Promise.resolve(remote.currentBlobSha(post.path));
    const result = await sync.sync();
    expect(result).toEqual({ pull: null, push: null });
    expect(remote.currentBlobSha(post.path)).toBe(refBefore);
  });
});

describe("sync(): single status cycle", () => {
  it("emits exactly one syncing -> final transition even though push() re-pulls internally", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const mine = model.newEntry({ kind: "post", title: "Mine", date: "2026-01-05" });
    const other = model.newEntry({ kind: "post", title: "Other", date: "2026-01-06" });
    remote.initRepo({ [mine.path]: mine.raw, [other.path]: other.raw });
    await sync.bootstrap();

    // A remote-only change (for pull to fast-forward) and a local dirty edit
    // (for push to commit), so both halves of sync() do real work.
    const otherEdited = model.replaceBody(other.raw, "remote change\n");
    if (!otherEdited.ok) {
      throw new Error(otherEdited.error);
    }
    remote.pushExternalChange({ [other.path]: otherEdited.raw });

    const entry = await store.getEntry(mine.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...entry, workingContent: `${mine.raw}local edit\n`, dirty: true });

    const seen: string[] = [];
    const unsubscribe = sync.onStatus((status) => seen.push(status.state));
    const result = await sync.sync();
    unsubscribe();

    expect(result.pull?.updated).toEqual([other.path]);
    expect(result.push?.committed).toBe(true);
    expect(seen).toEqual(["syncing", "idle"]);
  });
});
