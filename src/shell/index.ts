// ABOUTME: Public entry point for the platform shell — re-exports the Tauri-backed
// ABOUTME: and in-memory ShellApi factories consumed by app wiring and tests.

export type { FakeShell, FakeShellOptions } from "./fake";
export { createFakeShell } from "./fake";
export { createTauriShell } from "./tauri";
