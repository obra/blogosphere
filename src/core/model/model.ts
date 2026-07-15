// ABOUTME: createModel() — wires the pure functions in this directory into the
// ABOUTME: frozen ModelApi contract. Stateless: safe to construct once and share.

import { applyEditsImpl } from "./applyEdits";
import { parseEntry } from "./entry";
import { replaceBodyImpl } from "./frontMatter";
import { newEntryImpl } from "./newEntry";
import { isManagedPath, kindForPath, pathFor, pathParts, permalinkFor, slugify } from "./paths";
import { planPublishImpl } from "./publish";
import type { ModelApi } from "./types";
import { validateForCommit } from "./validate";

export function createModel(): ModelApi {
  return {
    parseEntry,
    kindForPath,
    isManagedPath,
    pathParts,
    pathFor,
    slugify,
    permalinkFor,
    applyEdits: applyEditsImpl,
    replaceBody: replaceBodyImpl,
    newEntry: newEntryImpl,
    planPublish: planPublishImpl,
    validateForCommit,
  };
}
