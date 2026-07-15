# Implementation plan: Blogosphere v0 (Mac)

Spec: `docs/superpowers/specs/2026-07-15-blogging-client-design.md`. This plan covers
v0 (desktop). iOS/Android shells are later phases.

## Strategy

Contracts-first, then parallel module implementation by subagents with **disjoint file
ownership**, then integration, then adversarial review. Shared files (package.json,
configs) are written once during scaffold and frozen for module agents.

## Phases

| # | Phase | Who | Gate |
|---|---|---|---|
| 0 | Plan + module contracts (types/interfaces) | main session | committed |
| 1 | Scaffold: Tauri v2 + Vite + React + TS strict + Biome (aggressive) + vitest/fast-check + scripts; all deps installed | 1 sonnet agent | `tsc`, `biome check`, `vitest`, `vite build` pass on contracts-only tree |
| 2 | Module fan-out (parallel pipelines: implement → review → fix) | workflow, sonnet + haiku | each module: own tests pass, tsc+eslint clean |
| 3 | Integration: DI wiring, app entry, cargo check, whole-suite green | 1 sonnet agent | all gates green |
| 4 | Adversarial review (find → verify → fix) | workflow | confirmed findings fixed, suite green |
| 5 | Verify: corpus round-trip vs `inspo/blog`, full suite, report | main session | evidence reported |

## Module ownership (phase 2)

| Module | Owns | Model |
|---|---|---|
| model | `src/core/model/**` + tests | sonnet |
| github | `src/core/github/**` + tests | sonnet |
| store | `src/core/store/**` + tests | sonnet |
| sync | `src/core/sync/**` + tests | sonnet |
| editor UI | `src/ui/editor/**` + tests | sonnet |
| app UI | `src/ui/app/**` + tests | sonnet |
| shell | `src-tauri/**`, `src/shell/**` | sonnet |
| quality | `.github/**`, `scripts/**`, synthetic corpus fixtures | haiku |

Rules for all module agents: never touch package.json or shared configs; never run
`npm install`; never `git commit` (main session commits per phase); code against the
contracts in `src/core/*/types.ts` and mock the other modules; every file starts with a
2-line `// ABOUTME:` comment.

## Key interfaces (written in phase 0)

- `src/core/model/types.ts` — entry kinds, parsing, surgical front-matter edits,
  path/slug/date rules, publish transform, validation.
- `src/core/github/types.ts` — Git Data API client (refs/commits/trees/blobs), typed
  errors, injected fetch.
- `src/core/store/types.ts` — SQLite persistence behind a `SqlDriver` abstraction
  (better-sqlite3 in tests, tauri-plugin-sql at runtime), outbox, snapshots, FTS.
- `src/core/sync/types.ts` — sync state machine, diff3 merge, conflicts.
- `src/core/services.ts` — DI aggregate the UI consumes.
- `src/shell/types.ts` — keychain, share inbox, platform.

## Risks in this plan

- Parallel UI agents integrate against fakes; integration agent owns reconciliation.
- Milkdown in jsdom is limited: editor unit tests cover serialization glue only; real
  editor behavior verified via Playwright later / manual smoke.
- No GitHub token in this session: github/sync tested against fixtures + local mock
  server; live integration suite is skip-without-token.
