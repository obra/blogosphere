# Tooling

One-page reference for the toolchain, set up before any feature code lands (see
`docs/superpowers/plans/2026-07-15-blogging-client-plan.md`, phase 1).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 (must match `src-tauri/tauri.conf.json`'s `build.devUrl`). |
| `npm run build` | `tsc --noEmit` then `vite build` → `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run typecheck` | `tsc --noEmit` against `tsconfig.json` (`src/` only). |
| `npm run lint` | `biome check .` — formatting, import order, and lint rules; no writes. |
| `npm run lint:fix` | `biome check --write .` — applies safe fixes. |
| `npm run format` | `biome format --write .` — formatting only. |
| `npm run test` | `vitest run` — single pass, no watch. |
| `npm run test:watch` | `vitest` — watch mode. |
| `npm run fuzz` | Property tests at high iteration count. See **FUZZ_RUNS** below. |
| `npm run test:corpus` | Markdown round-trip test against a real blog checkout. See **Corpus** below. |
| `npm run tauri -- <args>` | Passthrough to the Tauri CLI. |
| `(cd src-tauri && cargo check)` | Rust typecheck. |
| `(cd src-tauri && cargo clippy -- -D warnings)` | Clippy with `clippy::pedantic` promoted to hard errors. |
| `(cd src-tauri && cargo fmt --check)` | Rust formatting check (stable rustfmt defaults). |

## Git hooks

`git config core.hooksPath .githooks` is set locally, and re-applied by the
`prepare` npm script on every `npm install` so it survives fresh clones.
`.githooks/pre-commit` runs, in order, bailing with a clear message on the
first failure:

1. `biome check --write --staged --no-errors-on-unmatched`, then re-stages
   exactly the files that were staged before the commit — never the whole
   working tree, so unrelated in-progress edits are never swept in.
2. `npm run typecheck`.
3. `npm run test -- --run --silent`.

## Biome deny-list

`biome.json` turns on every stable rule (`linter.rules.preset: "all"`) —
Biome's released npm binaries don't ship nursery/experimental rules, so `all`
really is all of them. Six rules are turned back off, **globally**, because
they fight this codebase rather than catch real bugs in it. Each was found by
running `biome check` with `preset: "all"` against the committed contracts and
this scaffold, not guessed in advance:

| Rule | Why it's off |
|---|---|
| `style/useConsistentMethodSignatures` | Every contract interface (`src/core/**/types.ts`, `src/shell/types.ts`, `src/ui/types.ts`) uses TS method-shorthand (`foo(): T`) consistently — ~60 call sites. The rule wants property-style (`foo: () => T`); enforcing it would both rewrite frozen files and fight the established convention for new ones. |
| `correctness/useImportExtensions` | `moduleResolution: "bundler"` (Vite-idiomatic) intentionally omits extensions on relative imports; every existing contract already omits them. |
| `correctness/noUnresolvedImports` | False positive: it can't resolve `StrictMode` from `react`'s export map, even though `react`'s runtime exports it and both `tsc` and `vite build` accept the import. `react` is imported everywhere in a React app, so an unreliable resolver here is worse than no rule. |
| `style/noTernary` | Bans all ternaries. Idiomatic and pervasive for JSX conditional rendering (WYSIWYG/source toggle, sync-status pill variants, draft badges, ...) and compact result-mapping throughout `ui/**` and `core/**`. |
| `style/useFilenamingConvention` | Fires on any `*.test.ts(x)` file — the `.test` suffix doesn't match "camelCase / kebab-case / snake_case / equal to an export" — i.e. every test file in the project, present and future. |
| `style/noJsxLiterals` | Flags hardcoded JSX string literals for i18n extraction. This is a single-author, single-locale desktop tool with no i18n on the roadmap; the design doc specifies literal UI copy ("Save", "Publish", sync-status text) throughout. |

## Scoped overrides (not blanket disables)

Three narrow `overrides` entries in `biome.json` handle cases that are about
*specific files*, not the codebase as a whole — so the rule stays on
everywhere else:

- **Frozen contracts** (`src/core/services.ts`, the four
  `src/core/*/types.ts`, `src/shell/types.ts`, `src/ui/types.ts`): formatter
  disabled, `assist.source.organizeImports` disabled, and
  `style/noParameterProperties` / `style/useConsistentMemberAccessibility`
  disabled (both trip on `GitHubError`'s constructor parameter properties).
  These exact files were committed before this scaffold ran and must not be
  edited by it; their formatting/import order/class style predates this
  config. New sibling files (e.g. a future `src/core/model/parse.ts`) are
  **not** covered by this override and get every rule normally.
- **`vite.config.ts` / `vitest.config.ts`**: `style/noDefaultExport` off (both
  tools require a default-exported config; there's no alternative API),
  `style/noProcessEnv` + `correctness/noProcessGlobal` +
  `correctness/noNodejsModules` off (these are Node-context build config
  files; reading `process.env.TAURI_*` directly is the documented Tauri
  pattern and has no browser-side equivalent).
- **Test files** (`src/**/*.test.ts`, `src/**/*.test.tsx`):
  `style/noProcessEnv` + `correctness/noNodejsModules` off, for the
  `FUZZ_RUNS` convention below. `noProcessEnv` stays enforced for real
  application code, where reading `process.env` would be a bug — the webview
  has no such global at runtime. `complexity/noExcessiveLinesPerFunction` off
  — a `describe(...)` block's line count is the sum of every `it(...)` nested
  inside it, not one function's real complexity; the rule stays on for
  application code, where a long function is a real smell. `security/noSecrets`
  off — its entropy heuristic false-positives on ordinary `describe`/`it`
  title strings (e.g. `"groupByYearMonth"`, `"TagChipsEditor"`); real secret
  literals (tokens, keys) showing up in test fixtures would still be a
  problem, but this project has none and the rule can't tell "high-entropy
  identifier" from "high-entropy credential."

## Clippy

`src-tauri/Cargo.toml` sets:

```toml
[lints.rust]
warnings = "deny"      # any compiler warning fails cargo check / cargo build

[lints.clippy]
pedantic = "warn"      # on, but only a hard failure under -D warnings
```

`cargo clippy -- -D warnings` is the enforced gate (CI and this scaffold's
verification); a plain `cargo clippy` during local iteration shows pedantic
findings as warnings without blocking.

**Allow-list: currently empty.** The placeholder shell (four plugin
registrations plus a documented `# Panics` section on `run()`, since
`.expect()` can panic) passes `cargo clippy -- -D warnings` with zero
exceptions needed. If a future module hits a pedantic lint that's genuinely
wrong for a specific function — the sync engine's state machine and the
diff3 merge are the likely candidates — add a narrowly-scoped
`#[allow(clippy::the_lint)]` directly above the item in question (function or
block level, not a crate-level `#![allow(...)]`), with a one-line comment
explaining why. Keep this list tiny and honest; don't pre-emptively allow
anything that isn't actually blocking real, reasonable code.

## Tauri capabilities (`src-tauri/capabilities/default.json`)

- **`http:default` scope is `https://**`** (any HTTPS host), not just
  `api.github.com`. It has to cover two unrelated needs: the GitHub API
  client (`src/bootstrap/tauri.ts`) and the "+ Link" dialog's "Fetch title"
  button (`src/bootstrap/fetchTitle.ts`), which GETs whatever third-party
  page URL the user is linking to, to read its `og:title`/`<title>`. That
  page can be on any host, so an allow-list can't be narrower than "any
  HTTPS URL" without breaking the feature for most real links. Two things
  keep this from being as broad as it sounds:
  - The GitHub client doesn't actually use this capability at all — it calls
    the platform's native `fetch` directly (api.github.com sends CORS
    headers, so no ACL grant is needed there; see the comment in
    `buildGithubAndSync`). This capability is exercised by the title-fetch
    path only.
  - The title fetch is a plain GET with a 5s timeout that only ever reads
    the response as text and regexes out a title — it never executes
    anything from the page, sends the response anywhere but into a text
    field the user can edit before saving, or attaches credentials.
  - **Method-level scoping was considered and isn't possible**: the
    `tauri-plugin-http` scope schema (`Entry { url: UrlPattern }` in the
    plugin's own `scope.rs`) only ever matches on URL, with no `method`
    field to restrict to GET — so "GET-only" isn't expressible in the
    capability file. That's enforced in application code instead
    (`fetchPageTitle` always calls `tauriFetch` with `method: "GET"`).
- **`clipboard-manager:allow-write-text`** was added alongside the
  pre-existing `allow-read-text` — "Copy secret link" (draft opaqueId
  sharing) writes to the clipboard via this plugin on the Tauri path; only
  reading it (the "+ Link" URL prefill) was previously granted.
- **`sql:allow-execute`** was added alongside `sql:default`. `sql:default`
  only grants `allow-close`/`allow-load`/`allow-select` (tauri-plugin-sql's
  own `permissions/default.toml` — reads and connection lifecycle only);
  `execute` (every INSERT/UPDATE/DELETE, including schema creation) needs
  its own explicit grant. Without it the app can *open* its SQLite database
  but never *write* to it — `sql.execute not allowed` at the first
  `CREATE TABLE`, caught by the `tauri dev` smoke test the first time the
  app actually ran against the real plugin end to end.

## FUZZ_RUNS convention

Property tests (fast-check) read their iteration count from the environment
instead of hardcoding it:

```ts
// ABOUTME: ...
import process from "node:process";
import fc from "fast-check";
import { describe, it } from "vitest";

const DEFAULT_FUZZ_RUNS = 200;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || DEFAULT_FUZZ_RUNS;

describe("model", () => {
  it("property: parse(edit(x)) reflects the edit", () => {
    fc.assert(
      fc.property(arbitraryEntry(), (entry) => {
        /* ... */
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
```

Name property-test blocks so their full name contains the word `property`
(e.g. `it("property: ...")`) — `npm run fuzz` filters on exactly that via
`vitest run --testNamePattern property`, and sets `FUZZ_RUNS=10000`.
`npm run test` (and CI by default) runs at the low default (200) for speed;
`npm run fuzz` is the nightly/pre-release high-iteration pass called for in
the design doc.

## Corpus test usage

`npm run test:corpus` runs `vitest run corpus` (positional filter → any test
file with "corpus" in its path) with `BLOG_CORPUS_DIR` defaulted to
`inspo/blog` — a real checkout of the target blog, useful for catching
round-trip bugs against real-world front matter shapes. The default-via-env
trick needs a real shell, hence the `scripts/corpus.sh` wrapper instead of a
plain `package.json` script string (npm scripts don't expand `${VAR:-default}`
themselves). Override for CI or a different checkout:

```sh
BLOG_CORPUS_DIR=/path/to/other/checkout npm run test:corpus
```

Per the design doc, CI should also run the same test against a small
synthetic corpus (fixtures covering every front-matter shape in the real
blog: block scalars, quoted titles, tag arrays, `opaqueId`, `draft`) so the
round-trip guarantee doesn't depend on `inspo/blog` being present. That
fixture set is quality-module work, not part of this scaffold.
