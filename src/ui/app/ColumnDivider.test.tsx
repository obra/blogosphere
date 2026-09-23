// @vitest-environment jsdom
// ABOUTME: ColumnDivider — dragging resizes its column live, clamped so the
// ABOUTME: editor keeps 420pt, and the width is saved when the drag ends.
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ColumnDivider } from "./ColumnDivider";
import { META_SIDEBAR_WIDTH } from "./layoutPrefs";
import { ServicesProvider } from "./ServicesContext";
import { AppStoreProvider, createAppStore } from "./state";
import { buildFakeServices } from "./testing/fakes";

afterEach(() => {
  cleanup();
});

function renderDivider() {
  const { services } = buildFakeServices({ shellOptions: { platform: "macos" } });
  const store = createAppStore(services);
  const { container } = render(
    <ServicesProvider services={services}>
      <AppStoreProvider store={store}>
        <ColumnDivider column="sidebar" />
      </AppStoreProvider>
    </ServicesProvider>,
  );
  const divider = container.querySelector<HTMLElement>(".column-divider");
  if (!divider) {
    throw new Error("divider not rendered");
  }
  return { store, services, divider };
}

describe("ColumnDivider", () => {
  it("resizes its column live as it's dragged", () => {
    const { store, divider } = renderDivider();
    expect(store.getState().sidebarWidth).toBe(200);
    fireEvent.pointerDown(divider, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(globalThis as unknown as Window, { clientX: 240, pointerId: 1 });
    expect(store.getState().sidebarWidth).toBe(240);
  });

  it("clamps the drag so the list and editor keep their minimums", () => {
    const { store, divider } = renderDivider();
    fireEvent.pointerDown(divider, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(globalThis as unknown as Window, { clientX: 2000, pointerId: 1 });
    // jsdom's window is 1024 wide: 1024 - 420 editor - 280 list.
    expect(store.getState().sidebarWidth).toBe(324);
    fireEvent.pointerMove(globalThis as unknown as Window, { clientX: -500, pointerId: 1 });
    expect(store.getState().sidebarWidth).toBe(160);
  });

  it("saves the width when the drag ends, and stops following the pointer", async () => {
    const { store, services, divider } = renderDivider();
    fireEvent.pointerDown(divider, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(globalThis as unknown as Window, { clientX: 230, pointerId: 1 });
    await act(async () => {
      fireEvent.pointerUp(globalThis as unknown as Window, { clientX: 230, pointerId: 1 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await services.store.getMeta(META_SIDEBAR_WIDTH)).toBe("230");
    fireEvent.pointerMove(globalThis as unknown as Window, { clientX: 300, pointerId: 1 });
    expect(store.getState().sidebarWidth).toBe(230);
  });
});
