// ABOUTME: One-stop test double for Services — wires the fake model/store/
// ABOUTME: sync/shell into the DI aggregate the app store consumes. Import a
// ABOUTME: fake module directly (./fakeSync etc.) for its test-only surface.

import type { Services } from "../../../core/services";
import { DEFAULT_REPO } from "../../../core/services";
import type { EntryRecord } from "../../../core/store/types";
import { createFakeModel } from "./fakeModel";
import type { FakeShell, FakeShellOptions } from "./fakeShell";
import { createFakeShell } from "./fakeShell";
import { createFakeStore } from "./fakeStore";
import type { FakeSync, FakeSyncOptions } from "./fakeSync";
import { createFakeSync } from "./fakeSync";

interface FakeServicesOptions {
  seedEntries?: EntryRecord[];
  /** false simulates "no GitHub token configured yet" (Services.sync === null). */
  withSync?: boolean;
  shellOptions?: FakeShellOptions;
  syncOptions?: FakeSyncOptions;
}

interface FakeServices {
  services: Services;
  sync: FakeSync | null;
  shell: FakeShell;
}

/** Build a full fake Services aggregate, plus direct handles to the fakes
 *  underneath sync/shell for setting up scenarios and asserting on calls. */
function buildFakeServices(options: FakeServicesOptions = {}): FakeServices {
  const shell = createFakeShell(options.shellOptions);
  const sync = options.withSync === false ? null : createFakeSync(options.syncOptions);
  const services: Services = {
    model: createFakeModel(),
    store: createFakeStore(options.seedEntries ?? []),
    shell,
    github: null,
    sync,
    repo: DEFAULT_REPO,
  };
  return { services, sync, shell };
}

export type { FakeServices, FakeServicesOptions };
export { buildFakeServices };
