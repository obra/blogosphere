// ABOUTME: Public entry point for src/core/store — re-exports the store factory
// ABOUTME: and both SqlDriver implementations for shell/test wiring.

// contract — the plan specifies index.ts as the single public entry point
// exporting createStore + both driver factories for shell/test wiring.

export { createBetterSqliteDriver } from "./drivers/better-sqlite3";
export { createTauriSqlDriver } from "./drivers/tauri-sql";
export { createStore } from "./store";
