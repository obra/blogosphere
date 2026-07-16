// @vitest-environment jsdom
// ABOUTME: The secret-link affordance: drafts always get one (minted on first
// ABOUTME: use), and an existing link is shown as the URL with a copy icon.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "../editor/jsdom-layout-shim";
import { EditorScreen } from "./EditorScreen";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { makeEntry } from "./testing/builders";
import { buildFakeServices } from "./testing/fakes";

afterEach(() => {
  cleanup();
});

async function renderEditorFor(record: ReturnType<typeof makeEntry>) {
  const fake = buildFakeServices({ seedEntries: [record] });
  const store = createAppStore(fake.services, {
    writeClipboardText: () => Promise.resolve(),
    createId: () => "minted-secret-id",
  });
  render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>
        <EditorScreen />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await store.getState().refresh();
    store.getState().select(record.path);
  });
  return { store, ...fake };
}

it("a draft without a secret link offers to create one", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  await renderEditorFor(draft);

  expect(screen.getByText("Secret link")).not.toBeNull();
  expect(screen.queryByLabelText("Copy secret link")).toBeNull();
});

it("clicking Secret link mints the opaqueId and then shows the link with a copy icon", async () => {
  const draft = makeEntry({ path: "content/drafts/2026-01-01-a.md", kind: "draft", draft: true });
  const { services } = await renderEditorFor(draft);

  await act(async () => {
    fireEvent.click(screen.getByText("Secret link"));
    await Promise.resolve();
  });

  const saved = await services.store.getEntry(draft.path);
  expect(saved?.opaqueId).toBe("minted-secret-id");
  expect(screen.getByText("/private/minted-secret-id/")).not.toBeNull();
  expect(screen.getByLabelText("Copy secret link")).not.toBeNull();
});

it("an entry that already has a secret link shows it, with the full URL on hover", async () => {
  const draft = makeEntry({
    path: "content/drafts/2026-01-01-a.md",
    kind: "draft",
    draft: true,
    opaqueId: "existing-id",
  });
  await renderEditorFor(draft);

  const link = screen.getByText("/private/existing-id/");
  expect(link.closest(".secret-link")?.getAttribute("title")).toBe(
    "https://blog.fsck.com/private/existing-id/",
  );
  expect(screen.getByLabelText("Copy secret link")).not.toBeNull();
});

it("a published post without an opaqueId gets no secret-link affordance", async () => {
  const post = makeEntry({ path: "content/blog/2026/2026-01-01-a.md", kind: "post" });
  await renderEditorFor(post);

  expect(screen.queryByText("Secret link")).toBeNull();
  expect(screen.queryByLabelText("Copy secret link")).toBeNull();
});
