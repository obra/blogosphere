// ABOUTME: Copy Secret Link from a menu has no inline "copied" check, so it
// ABOUTME: announces the copied URL; the inline control stays silent as before.
import { describe, expect, it } from "vitest";
import { runMenuCommand } from "./menuModel";
import { createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

const ANNOUNCEMENT = /^Secret link copied: /;

const draft = makeEntry({ path: "content/drafts/d.md", kind: "draft", draft: true, title: "D" });

async function storeWithDraft() {
  const copied: string[] = [];
  const store = createAppStore(buildFakeServices({ seedEntries: [draft] }).services, {
    writeClipboardText: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
    createId: () => "minted-secret-id",
  });
  await store.getState().refresh();
  store.getState().select(draft.path);
  return { store, copied };
}

describe("secret link announcements", () => {
  it("announces the copied URL when asked (menus)", async () => {
    const { store, copied } = await storeWithDraft();
    await store.getState().shareSecretLink(draft.path, { announce: true });
    expect(copied).toHaveLength(1);
    const toast = store.getState().toasts.at(-1);
    expect(toast?.tone).toBe("success");
    expect(toast?.message).toBe(`Secret link copied: ${copied[0]}`);
  });

  it("stays silent by default (the inline control shows its own check)", async () => {
    const { store } = await storeWithDraft();
    await store.getState().shareSecretLink(draft.path);
    expect(store.getState().toasts).toEqual([]);
  });

  it("announces from the … menu's Copy Secret Link", async () => {
    const { store } = await storeWithDraft();
    runMenuCommand("copySecretLink", store);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getState().toasts.at(-1)?.message).toMatch(ANNOUNCEMENT);
  });
});
