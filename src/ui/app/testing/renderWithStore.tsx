// ABOUTME: Test helper — wraps a component with ServicesProvider +
// ABOUTME: AppStoreProvider so component tests exercise the real store logic.
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ServicesProvider } from "../ServicesContext";
import { AppStoreProvider, createAppStore } from "../state";
import type { AppStoreDeps } from "../state.types";
import type { FakeServicesOptions } from "./fakes";
import { buildFakeServices } from "./fakes";

interface RenderWithStoreOptions extends FakeServicesOptions {
  storeOverrides?: Partial<AppStoreDeps>;
}

function renderWithStore(ui: ReactElement, options: RenderWithStoreOptions = {}) {
  const fake = buildFakeServices(options);
  const store = createAppStore(fake.services, options.storeOverrides);
  const utils = render(
    <ServicesProvider services={fake.services}>
      <AppStoreProvider store={store}>{ui}</AppStoreProvider>
    </ServicesProvider>,
  );
  return { ...utils, ...fake, store };
}

export { renderWithStore };
