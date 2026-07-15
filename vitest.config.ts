// ABOUTME: Vitest config. Node environment by default; individual test files opt
// ABOUTME: into jsdom with a `// @vitest-environment jsdom` pragma at the top.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules/**", "dist/**", "src-tauri/**", "inspo/**"],
    globals: false,
    passWithNoTests: true,
  },
});
