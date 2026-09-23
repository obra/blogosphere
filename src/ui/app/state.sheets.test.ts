// ABOUTME: Sheets: only one at a time, the conflict sheet's own state, and
// ABOUTME: nothing underneath an open sheet changing through menu commands.
import { describe, expect, it } from "vitest";
import { runMenuCommand } from "./menuModel";
import { createAppStore } from "./state";
import { anySheetOpen } from "./state.sheetActions";
import type { AppState } from "./state.types";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

const draft = makeEntry({ path: "content/drafts/2026-03-04-one.md", kind: "draft" });
const other = makeEntry({ path: "content/drafts/2026-03-05-two.md", kind: "draft" });

async function storeWithDrafts() {
  const { services } = buildFakeServices({ seedEntries: [draft, other] });
  const store = createAppStore(services, { confirm: () => true });
  await store.getState().refresh();
  store.getState().select(draft.path);
  return store;
}

type Store = Awaited<ReturnType<typeof storeWithDrafts>>;

const OPENERS: [string, (store: Store) => void][] = [
  ["Publish", (store) => store.getState().openPublishDialog()],
  ["New Link", (store) => store.getState().openNewLinkDialog()],
  ["Versions", (store) => store.getState().openVersions(draft.path)],
  ["Conflict", (store) => store.getState().openConflict(draft.path)],
];

function sheetsOpen(state: AppState): string[] {
  return [
    state.publishDialogOpen ? "Publish" : null,
    state.newLinkDialogOpen ? "New Link" : null,
    state.versionsPath === null ? null : "Versions",
    state.conflictSheetPath === null ? null : "Conflict",
  ].filter((name): name is string => name !== null);
}

describe("one sheet at a time", () => {
  const pairs = OPENERS.flatMap((first) =>
    OPENERS.filter((second) => second[0] !== first[0]).map((second) => [first, second] as const),
  );
  it.each(pairs.map(([first, second]) => [second[0], first[0], first[1], second[1]] as const))(
    "%s can't open over %s",
    async (_secondName, firstName, openFirst, openSecond) => {
      const store = await storeWithDrafts();
      openFirst(store);
      openSecond(store);
      expect(sheetsOpen(store.getState())).toEqual([firstName]);
      expect(anySheetOpen(store.getState())).toBe(true);
    },
  );

  it("Quick Open can't open over a sheet", async () => {
    const store = await storeWithDrafts();
    store.getState().openPublishDialog();
    store.getState().openQuickOpen();
    expect(store.getState().quickOpenOpen).toBe(false);
  });
});

describe("the conflict sheet", () => {
  it("opens for a path and closes", async () => {
    const store = await storeWithDrafts();
    store.getState().openConflict(draft.path);
    expect(store.getState().conflictSheetPath).toBe(draft.path);
    store.getState().closeConflict();
    expect(store.getState().conflictSheetPath).toBeNull();
  });

  it("closes once that conflict is resolved", async () => {
    const store = await storeWithDrafts();
    store.getState().openConflict(draft.path);
    await store.getState().resolveConflict(draft.path, { choose: "mine" });
    expect(store.getState().conflictSheetPath).toBeNull();
  });
});

describe("with a sheet open, menu commands change nothing underneath", () => {
  it.each(["newPost", "newLink", "delete", "publish", "toggleSidebar"] as const)(
    "%s is refused",
    async (id) => {
      const store = await storeWithDrafts();
      store.getState().openPublishDialog();
      const before = store.getState();
      runMenuCommand(id, store, other.path);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const after = store.getState();
      expect(after.selectedPath).toBe(draft.path);
      expect(after.entries).toBe(before.entries);
      expect(after.sidebarHidden).toBe(before.sidebarHidden);
      expect(sheetsOpen(after)).toEqual(["Publish"]);
    },
  );
});
