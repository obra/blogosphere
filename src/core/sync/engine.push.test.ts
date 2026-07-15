// ABOUTME: Push scenarios — new entry, edit, and delete, each using its
// ABOUTME: kind/newness-appropriate commit message template.
import { describe, expect, it } from "vitest";
import { baseEntry, commitMessageFor } from "./testing/fixtures";
import { createHarness } from "./testing/harness";

describe("push: new entry", () => {
  it("commits a brand-new post with the post template and marks it clean", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    const created = model.newEntry({ kind: "post", title: "Brand New", date: "2026-01-10" });
    await store.upsertEntry(
      baseEntry({
        path: created.path,
        kind: "post",
        workingContent: created.raw,
        title: "Brand New",
      }),
    );

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(result.retries).toBe(0);
    expect(remote.readFile(created.path)).toBe(created.raw);
    expect(await commitMessageFor(remote, result)).toBe("Post: Brand New");

    const entry = await store.getEntry(created.path);
    expect(entry?.dirty).toBe(false);
    expect(entry?.baseSha).toBe(remote.currentBlobSha(created.path));
  });
});

describe("push: new entry templates by kind", () => {
  it("uses the draft template for a new draft", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    const draft = model.newEntry({ kind: "draft", title: "WIP", date: "2026-01-10" });
    await store.upsertEntry(
      baseEntry({ path: draft.path, kind: "draft", workingContent: draft.raw, title: "WIP" }),
    );

    const result = await sync.push();
    expect(await commitMessageFor(remote, result)).toBe("Draft: WIP");
  });

  it("uses the link template for a new link", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    const link = model.newEntry({
      kind: "link",
      title: "Neat",
      date: "2026-01-11",
      url: "https://example.com",
    });
    await store.upsertEntry(
      baseEntry({ path: link.path, kind: "link", workingContent: link.raw, title: "Neat" }),
    );

    const result = await sync.push();
    expect(await commitMessageFor(remote, result)).toBe("Link: Neat");
  });
});

describe("push: edit", () => {
  it("commits a change to an already-synced entry with the edit template", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Original", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const edited = model.replaceBody(post.raw, "Edited locally.\n");
    if (!edited.ok) {
      throw new Error(edited.error);
    }
    const entry = await store.getEntry(post.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...entry, workingContent: edited.raw, dirty: true });

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(await commitMessageFor(remote, result)).toBe("Edit: Original");
    expect(remote.readFile(post.path)).toBe(edited.raw);
  });

  it("honors a custom commit message template from store meta", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Original", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();
    await store.setMeta("commitMsgTemplates", JSON.stringify({ edit: "Update: {title}" }));

    const edited = model.replaceBody(post.raw, "Edited locally.\n");
    if (!edited.ok) {
      throw new Error(edited.error);
    }
    const entry = await store.getEntry(post.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...entry, workingContent: edited.raw, dirty: true });

    const result = await sync.push();
    expect(await commitMessageFor(remote, result)).toBe("Update: Original");
  });
});

describe("push: delete", () => {
  it("removes the file remotely and the row locally, using the delete template", async () => {
    const harness = await createHarness();
    const { remote, store, sync, model } = harness;
    const post = model.newEntry({ kind: "post", title: "Doomed", date: "2026-01-05" });
    remote.initRepo({ [post.path]: post.raw });
    await sync.bootstrap();

    const entry = await store.getEntry(post.path);
    if (!entry) {
      throw new Error("test setup");
    }
    await store.upsertEntry({ ...entry, deleted: true, dirty: true });

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(await commitMessageFor(remote, result)).toBe(`Delete: ${post.path}`);
    expect(remote.readFile(post.path)).toBeNull();
    expect(await store.getEntry(post.path)).toBeNull();
  });
});
