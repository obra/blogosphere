#!/usr/bin/env node
// ABOUTME: Post-build guard: the minified CSS must still carry the macOS token
// ABOUTME: block intact (minifiers can rewrite color functions we depend on).
//
// Usage: node scripts/check-release-css.mjs [distDir]   (default: dist)
// Runs automatically at the end of `npm run build`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = [
  ["macOS scope", /html\[data-platform=("?)macos\1\]/],
  ["color-scheme", /color-scheme:\s*light dark/],
  ["label color", /--text:\s*-apple-system-label/],
  ["accent color", /--accent:\s*AccentColor/],
  ["selection color", /--bg-selected:\s*-apple-system-selected-content-background/],
];
const LIGHT_DARK = /light-dark\(/;

const dist = process.argv[2] ?? "dist";
const assets = join(dist, "assets");
const files = readdirSync(assets).filter((file) => file.endsWith(".css"));
if (files.length === 0) {
  console.error(`check-release-css: no CSS in ${assets} — did the build run?`);
  process.exit(1);
}
const css = files.map((file) => readFileSync(join(assets, file), "utf8")).join("\n");

const failures = REQUIRED.filter(([, pattern]) => !pattern.test(css)).map(([what]) => what);
if (LIGHT_DARK.test(css)) {
  failures.push("light-dark() present");
}

if (failures.length > 0) {
  console.error(`check-release-css: FAILED — ${failures.join(", ")}`);
  console.error(`  checked: ${files.join(", ")}`);
  process.exit(1);
}
console.log(`check-release-css: ok (${files.length} file${files.length === 1 ? "" : "s"})`);
