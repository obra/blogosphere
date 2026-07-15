// ABOUTME: Cross-module integration test — proves the app store's persisted
// ABOUTME: commit-message templates and the sync engine's own template reader
// ABOUTME: agree on the same store meta key end to end (see core/sync/meta.ts).
import { describe, expect, it } from "vitest";
import { DEFAULT_REPO, type Services } from "../../core/services";
import { baseEntry, commitMessageFor } from "../../core/sync/testing/fixtures";
import { createHarness } from "../../core/sync/testing/harness";
import { createFakeShell } from "../../shell/fake";
import { createAppStore } from "./state";

describe("commit message templates: app store -> sync engine", () => {
  it("a template saved through the app store changes the commit message the sync engine produces", async () => {
    const harness = await createHarness();
    const { remote, store, model, sync } = harness;
    remote.initRepo({ "seed.txt": "seed" });
    await sync.bootstrap();

    // The app store, wired to the *real* store and *real* sync engine (not
    // fakes) so this test proves the actual meta key the two sides agree on,
    // not just that each side's own fake respects whatever key it's told.
    const services: Services = {
      model,
      store,
      shell: createFakeShell(),
      github: null,
      sync,
      repo: DEFAULT_REPO,
    };
    const appStore = createAppStore(services);

    await appStore.getState().setCommitTemplates({
      newPost: "Custom Post: {title}",
      edit: "Custom Edit: {title}",
      newDraft: "Custom Draft: {title}",
      newLink: "Custom Link: {title}",
      delete: "Custom Delete: {path}",
    });

    const created = model.newEntry({ kind: "post", title: "Hello World", date: "2026-01-10" });
    await store.upsertEntry(
      baseEntry({
        path: created.path,
        kind: "post",
        workingContent: created.raw,
        title: "Hello World",
      }),
    );

    const result = await sync.push();

    expect(result.committed).toBe(true);
    expect(await commitMessageFor(remote, result)).toBe("Custom Post: Hello World");
  });
});
