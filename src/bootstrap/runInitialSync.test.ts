// ABOUTME: runInitialSync's contract: first run bootstraps (read-only), every
// ABOUTME: later launch pulls — launching the app must never push/deploy.
import { expect, it } from "vitest";
import { META_LAST_ROOT_TREE_SHA } from "../core/sync/meta";
import { buildFakeServices } from "../ui/app/testing/fakes";
import { runInitialSync } from "./index";

it("first run (empty store) bootstraps and does not sync", async () => {
  const fake = buildFakeServices();

  await runInitialSync(fake.services);

  expect(fake.sync?.bootstrapCallCount()).toBe(1);
  expect(fake.sync?.syncCallCount()).toBe(0);
});

it("a routine launch pulls remote changes but never pushes", async () => {
  const fake = buildFakeServices();
  await fake.services.store.setMeta(META_LAST_ROOT_TREE_SHA, "some-tree-sha");

  await runInitialSync(fake.services);

  // Unpushed work from the last session must stay pending until the user
  // syncs — relaunching with half-finished edits to a published post must
  // not deploy them.
  expect(fake.sync?.pullCallCount()).toBe(1);
  expect(fake.sync?.syncCallCount()).toBe(0);
  expect(fake.sync?.bootstrapCallCount()).toBe(0);
});

it("no sync configured: a no-op", async () => {
  const fake = buildFakeServices({ withSync: false });

  await runInitialSync(fake.services);
});
