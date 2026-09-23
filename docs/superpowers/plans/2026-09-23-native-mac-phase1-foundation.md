# Native Mac Redesign — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app know which platform it runs on, and on macOS switch its colors, type, focus rings, scrollbars, selection, and icons to the system's own — without changing anything on iOS, Android, or web.

**Architecture:** A Rust `current_platform` command is resolved before React mounts; the result goes on `<html data-platform>` and into `createTauriShell(platform)`. All Mac styling lives in one new stylesheet scoped to `html[data-platform="macos"]` that overrides the existing CSS tokens. Icons go through a semantic `<Icon name>` component: on macOS it asks a Rust command to render the SF Symbol to a PNG at runtime; everywhere else (and on any failure) it draws the Lucide icon.

**Tech Stack:** Tauri 2.11 (Rust, objc2-app-kit 0.3.2), React 19, zustand, Vite 8 + lightningcss, vitest + @testing-library/react (jsdom per-file), Biome, lucide-react 1.47.

**Spec:** `docs/superpowers/specs/2026-09-23-native-mac-redesign-design.md` (§1 Platform gate, §4 scrollbars/chrome text, §7 Visual system, §11 phase 1). Read it before starting.

## Execution record (2026-09-23)

Executed in commits `3fb475f`..`077d594`, one per task (Task 5 split into
CSS and click-focus; Task 8 into shell+cache and component). Two
adversarial reviews of this plan found real defects; the code was
prototyped, verified, then replayed task by task with each test seen
failing first. **Where the tasks below disagree with the commits, the
commits are right.** Corrections:

- **Task 3:** the testing fake shell (`src/ui/app/testing/fakeShell.ts`)
  defaulted to `"macos"`; it now defaults to `"web"`, or the phone-layout
  tests and the browser demo would lose compact mode. Callers use a new
  `useAppCompactLayout()` wrapper (an inline `useServices()` call tripped a
  Biome type-inference false positive). CSS test helpers live inside
  `cssContract.test.ts` (Biome forbids exports from tests) and split
  selectors only on top-level commas, so `:is(a, b)` stays one selector.
- **Task 5:** the Mac focus halo is set through `--focus-ring-width` /
  `--focus-ring-color` variables that the base `:focus-visible` rule reads.
  A Mac-specific `:focus-visible` rule would outrank Crepe's and the title
  field's deliberate `outline: none`. List rows set the width to 0: AppKit
  lists show focus through the selection color. Rows and sidebar sections
  now focus themselves on click; WebKit doesn't, so the focused selection
  never showed after a click (commit `869bb8f`).
- **Task 7:** `CGImageForProposedRect` applies the screen's backing scale
  on top of the requested one (4× on Retina), so the renderer draws into an
  explicitly sized `NSBitmapImageRep` instead. The objc2 crates build with
  `default-features = false`. `SymbolPng` derives `Debug`. The test
  compares integer pixel counts (clippy `float_cmp`). The command takes
  `&str`.
- **Task 8:** both fake shells gain `renderSymbol`. The component test
  captures the fallback warning, and a new `iconNames.test.ts` covers spec
  §10 (every semantic icon resolves). `console.warn` uses a documented
  `biome-ignore`.
- **Task 9:** `scripts/**/*.mjs` gets a Biome override (console, Node
  modules, `process`). "Prove it fails" uses a fake dist dir, not an old
  build.
- **Task 10:** done during prototyping, in Blogosphere Dev via the bridge:
  platform `macos`, wide layout at the minimum width, system label and
  selection colors, `color-mix` with system colors resolving, a 1100×720
  default window, SF Symbols in the editor toolbar, accent selection with
  white text and no ring. **Still open:** Jesse's dark-mode check and the
  accent-color live-tracking check.

## Global Constraints

- The native Mac design applies only when `data-platform="macos"`. iOS, Android, web, and the phone layout keep today's look and behavior exactly.
- Never use CSS `light-dark()`. Light/dark pairs use `@media (prefers-color-scheme: dark)`. The production CSS target stays `safari13` (`vite.config.ts`).
- The macOS token block declares `color-scheme: light dark`.
- SF Symbols are never committed to the repo in any form (no SVG/PNG exports). They are rendered by macOS at runtime only. Lucide (ISC) is the fallback everywhere else.
- Rust: `warnings = "deny"`, `cargo clippy -- -D warnings` (pedantic), `cargo fmt`. Custom commands need an ACL permission in `src-tauri/permissions/*.toml` and a grant in `src-tauri/capabilities/default.json`.
- TypeScript: `npm run lint` (Biome) must report zero errors **and zero infos**; `npm run typecheck`; `npm test`. The pre-commit hook runs all three — never bypass it (`--no-verify` is forbidden).
- Every new source file starts with a two-line `// ABOUTME:` header (CSS: `/* ABOUTME: … */`), matching existing files.
- Match surrounding style; comments explain *why*, never history.
- Work on branch `design/native-mac-redesign` (worktree `/Users/jesse/git/blogosphere/.claude/worktrees/blogosphere-issue-312120`). Commit after every task.

## Review Focus

1. `current_platform` rejects or the Tauri bridge isn't ready → the app must still boot, with the non-Mac look ("web"), not a blank window. (Test in Task 2.)
2. A Mac window dragged narrower than 760px → it must keep the desktop three-pane layout, never flip to the phone shell. (Tests in Task 3.)
3. Dark mode with a selected row → the selected title and its date must be readable (white on accent when focused, label color on gray when not). (Test in Task 5; visual check in Task 10.)
4. An SF Symbol name that doesn't exist on this macOS, or a renderer error → the Lucide icon shows, nothing crashes, and it's logged once per name. (Test in Task 8.)
5. Release build minification rewriting the macOS token block (as it would `light-dark()`) → the build must fail loudly. (Task 9.)

---

### Task 1: Rust `current_platform` command and Mac window defaults

**Files:**
- Create: `src-tauri/src/platform.rs`
- Create: `src-tauri/permissions/native-ui.toml`
- Create: `src-tauri/tauri.macos.conf.json`
- Modify: `src-tauri/src/lib.rs` (module + `generate_handler!`)
- Modify: `src-tauri/capabilities/default.json` (grant `native-ui`)

**Interfaces:**
- Produces: Tauri command `current_platform` → JSON string `"macos" | "ios" | "android" | "windows" | "linux"`. ACL permission set `native-ui` (Task 7 adds `render_symbol` to it).

- [ ] **Step 1: Write the failing test** — create `src-tauri/src/platform.rs`:

```rust
// ABOUTME: Reports which OS this build targets, so the webview can pick its
// ABOUTME: platform look before first render (see the native Mac redesign spec §1).

/// The platform name the frontend's `Platform` type understands.
#[must_use]
pub fn platform_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

#[tauri::command]
#[must_use]
pub fn current_platform() -> &'static str {
    platform_name()
}

#[cfg(test)]
mod tests {
    use super::platform_name;

    #[test]
    #[cfg(target_os = "macos")]
    fn reports_macos_on_macos() {
        assert_eq!(platform_name(), "macos");
    }
}
```

Then in `src-tauri/src/lib.rs` add `mod platform;` next to `mod keychain;`.

- [ ] **Step 2: Run the test to verify it compiles and passes** (a pure `cfg!` function can't meaningfully fail first; the check here is that it's wired and correct on this Mac)

Run: `cd src-tauri && cargo test -q platform`
Expected: `test platform::tests::reports_macos_on_macos ... ok`

- [ ] **Step 3: Register the command and its permission**

In `src-tauri/src/lib.rs`, extend the handler list:

```rust
        .invoke_handler(tauri::generate_handler![
            keychain::keychain_get,
            keychain::keychain_set,
            keychain::keychain_delete,
            platform::current_platform,
        ])
```

Create `src-tauri/permissions/native-ui.toml`:

```toml
# ABOUTME: App-level ACL permissions for native-UI helper commands
# ABOUTME: (src/platform.rs), granted to the main window via capabilities/default.json.

[[permission]]
identifier = "allow-current-platform"
description = "Enables the current_platform command, which reports the OS this build targets."
commands.allow = ["current_platform"]

[[set]]
identifier = "native-ui"
description = "Allows the native-UI helper commands (platform detection)."
permissions = ["allow-current-platform"]
```

In `src-tauri/capabilities/default.json`, add `"native-ui"` after `"keychain-access"` in `permissions`.

- [ ] **Step 4: Mac window defaults** — create `src-tauri/tauri.macos.conf.json`. Tauri merges this file over `tauri.conf.json` on macOS only, as a JSON merge patch: arrays are **replaced**, so the whole window object must be repeated. Copy the current `app.windows[0]` object from `tauri.conf.json` verbatim and change only `width` to `1100` and `height` to `720`:

```json
{
  "app": {
    "windows": [
      {
        "title": "Blogosphere",
        "width": 1100,
        "height": 720,
        "resizable": true,
        "fullscreen": false,
        "titleBarStyle": "Overlay",
        "hiddenTitle": true,
        "minWidth": 760,
        "minHeight": 500
      }
    ]
  }
}
```

Before saving, diff your object against `tauri.conf.json`'s `app.windows[0]` and carry over **every** other key it has (e.g. `label`, `minHeight`), so nothing but the size changes. `minWidth` stays 760 in this phase; phase 2 lowers it with sidebar auto-collapse.

- [ ] **Step 5: Build checks**

Run: `cd src-tauri && cargo fmt --check && cargo clippy -q -- -D warnings && cargo test -q`
Expected: no output from fmt/clippy; all tests `ok`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/platform.rs src-tauri/src/lib.rs src-tauri/permissions/native-ui.toml src-tauri/capabilities/default.json src-tauri/tauri.macos.conf.json
git commit -m "Add current_platform command and Mac-only window defaults"
```

---

### Task 2: Resolve the platform before first render

**Files:**
- Create: `src/bootstrap/platform.ts`
- Create: `src/bootstrap/platform.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx` (prop `platform`, pass to `boot`)
- Modify: `src/App.test.tsx` (render `<App platform="web" />`)
- Modify: `src/bootstrap/index.ts` (`boot(platform)`)
- Modify: `src/bootstrap/tauri.ts` (`createTauriServices(platform)`)
- Modify: `src/shell/tauri.ts` (`createTauriShell(platform)`)

**Interfaces:**
- Consumes: Tauri command `current_platform` (Task 1).
- Produces:
  - `detectPlatform(deps: { isTauri: () => boolean; invoke: (cmd: string) => Promise<unknown> }): Promise<Platform>`
  - `applyPlatformAttribute(root: HTMLElement, platform: Platform): void` — sets `root.dataset.platform`.
  - `createTauriShell(platform: Platform): ShellApi`; `createTauriServices(platform: Platform)`; `boot(platform: Platform)`; `<App platform={Platform} />`.

- [ ] **Step 1: Write the failing tests** — `src/bootstrap/platform.test.ts`:

```ts
// @vitest-environment jsdom
// ABOUTME: detectPlatform / applyPlatformAttribute — the pre-render platform
// ABOUTME: probe that picks the Mac look, with a safe "web" fallback.
import { describe, expect, it, vi } from "vitest";
import { applyPlatformAttribute, detectPlatform } from "./platform";

describe("detectPlatform", () => {
  it("is web outside Tauri, without calling the bridge", async () => {
    const invoke = vi.fn();
    expect(await detectPlatform({ isTauri: () => false, invoke })).toBe("web");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks the Rust side inside Tauri", async () => {
    const invoke = vi.fn().mockResolvedValue("macos");
    expect(await detectPlatform({ isTauri: () => true, invoke })).toBe("macos");
    expect(invoke).toHaveBeenCalledWith("current_platform");
  });

  it("maps desktop platforms we don't style natively to web", async () => {
    const invoke = vi.fn().mockResolvedValue("windows");
    expect(await detectPlatform({ isTauri: () => true, invoke })).toBe("web");
  });

  it("falls back to web (and logs) when the command fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const invoke = vi.fn().mockRejectedValue(new Error("bridge not ready"));
    expect(await detectPlatform({ isTauri: () => true, invoke })).toBe("web");
    expect(warn).toHaveBeenCalledWith(
      "current_platform failed; using the web look",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});

describe("applyPlatformAttribute", () => {
  it("writes data-platform on the root element", () => {
    const root = document.createElement("html");
    applyPlatformAttribute(root, "macos");
    expect(root.getAttribute("data-platform")).toBe("macos");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/bootstrap/platform.test.ts`
Expected: FAIL — `Failed to resolve import "./platform"`.

- [ ] **Step 3: Implement** — `src/bootstrap/platform.ts`:

```ts
// ABOUTME: Pre-render platform probe: asks Rust which OS this is (Tauri) or
// ABOUTME: says "web", then stamps it on <html> so CSS can scope the Mac look.
import type { Platform } from "../shell/types";

export interface PlatformProbeDeps {
  isTauri: () => boolean;
  invoke: (cmd: string) => Promise<unknown>;
}

const NATIVE_PLATFORMS: ReadonlySet<Platform> = new Set(["macos", "ios", "android"]);

/** Never rejects: a failed probe must not blank the window, so anything
 *  unexpected means "web" — today's non-Mac look. */
export async function detectPlatform(deps: PlatformProbeDeps): Promise<Platform> {
  if (!deps.isTauri()) {
    return "web";
  }
  try {
    const reported = await deps.invoke("current_platform");
    return NATIVE_PLATFORMS.has(reported as Platform) ? (reported as Platform) : "web";
  } catch (err) {
    console.warn("current_platform failed; using the web look", err);
    return "web";
  }
}

export function applyPlatformAttribute(root: HTMLElement, platform: Platform): void {
  root.dataset.platform = platform;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/bootstrap/platform.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Thread the platform through boot**

`src/shell/tauri.ts` — change the factory signature and `platform()`:

```ts
export function createTauriShell(platform: Platform): ShellApi {
  return {
    platform(): Platform {
      return platform;
    },
```

(Delete the old "v0 targets macOS only" comment.)

`src/bootstrap/tauri.ts` — `export async function createTauriServices(platform: Platform): Promise<Services> { const shell = createTauriShell(platform);` (import `Platform` from `../shell/types`).

`src/bootstrap/index.ts` — `export async function boot(platform: Platform): Promise<Services> { const services = isTauri() ? await createTauriServices(platform) : createDemoServices();` (import the type).

`src/App.tsx` — `export function App(props: { platform: Platform }) {` and in the effect call `boot(props.platform)`; add `props.platform` to the effect's dependency list (`[bootAttempt, props.platform]`).

`src/main.tsx` — replace the render call:

```tsx
import { invoke, isTauri } from "@tauri-apps/api/core";
import { applyPlatformAttribute, detectPlatform } from "./bootstrap/platform";

// The platform decides which stylesheet tokens apply, so it must be on
// <html> before the first paint — otherwise the Mac look flashes in late.
detectPlatform({ isTauri, invoke: (cmd) => invoke(cmd) }).then((platform) => {
  applyPlatformAttribute(document.documentElement, platform);
  createRoot(container).render(
    <StrictMode>
      <App platform={platform} />
    </StrictMode>,
  );
});
```

(Keep the existing `container` null check above it. `detectPlatform` never rejects, so no `.catch` is needed.)

`src/App.test.tsx` — both renders become `render(<App platform="web" />);`.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass (any other caller of `createTauriShell`/`boot` that typecheck flags must pass a platform — there should be none besides the ones above).

- [ ] **Step 7: Commit**

```bash
git add src/bootstrap/platform.ts src/bootstrap/platform.test.ts src/main.tsx src/App.tsx src/App.test.tsx src/bootstrap/index.ts src/bootstrap/tauri.ts src/shell/tauri.ts
git commit -m "Resolve the platform before first render and stamp it on <html>"
```

---

### Task 3: Never use the phone layout on macOS

**Files:**
- Modify: `src/ui/app/useCompactLayout.ts`
- Modify: `src/ui/app/useCompactLayout.test.ts`
- Modify: `src/ui/app/AppShell.tsx:246`, `src/ui/app/EditorScreen.tsx:178` (pass the platform)
- Modify: `src/ui/app/app-mobile.css` (the `@media (max-width: 760px)` block)
- Create: `src/ui/app/cssContract.test.ts` (structural CSS tests; Task 5 extends it)

**Interfaces:**
- Consumes: `useServices().shell.platform()` (existing).
- Produces: `useCompactLayout(platform: Platform): boolean`; test helpers in `cssContract.test.ts`: `readCss(name: string): string`.

- [ ] **Step 1: Write the failing hook test** — in `useCompactLayout.test.ts`, change every `useCompactLayout()` call to `useCompactLayout("web")`, then add:

```ts
it("never reports compact on macOS, even when the viewport is narrow", () => {
  const media = installMatchMedia(true);
  const { result } = renderHook(() => useCompactLayout("macos"));
  expect(result.current).toBe(false);

  act(() => media.setMatches(true));
  expect(result.current).toBe(false);
});
```

- [ ] **Step 2: Write the failing CSS test** — `src/ui/app/cssContract.test.ts`:

```ts
// ABOUTME: Structural checks on the stylesheets — invariants the redesign
// ABOUTME: depends on that no type checker sees (scoping, token coverage).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function readCss(name: string): string {
  return readFileSync(join(__dirname, name), "utf8");
}

/** Body of the first `@media (max-width: 760px) { … }` block. */
function compactMediaBlock(css: string): string {
  const start = css.indexOf("@media (max-width: 760px)");
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error("unterminated @media block");
}

describe("compact (phone) CSS never applies on macOS", () => {
  it("scopes every selector in app-mobile.css's 760px block to non-Mac", () => {
    const block = compactMediaBlock(readCss("app-mobile.css"));
    const selectors = block
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((rule) => rule.split("{")[0]?.trim() ?? "")
      .filter((head) => head.length > 0)
      .flatMap((head) => head.split(",").map((s) => s.trim()));
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toMatch(/^html:not\(\[data-platform="macos"\]\) /);
    }
  });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `npx vitest run src/ui/app/useCompactLayout.test.ts src/ui/app/cssContract.test.ts`
Expected: FAIL — the macOS hook test gets `true`; the CSS test reports the first unscoped selector (e.g. `.entry-list-search input`).

- [ ] **Step 4: Implement the hook gate**

```ts
import type { Platform } from "../../shell/types";

/** macOS never gets the phone shell: a narrow Mac window is still a Mac
 *  window (the spec's platform gate), so only other platforms consult the
 *  viewport. */
function useCompactLayout(platform: Platform): boolean {
  const eligible = platform !== "macos";
  const [compact, setCompact] = useState(() => eligible && (queryList()?.matches ?? false));
  useEffect(() => {
    const mql = eligible ? queryList() : null;
    if (!mql) {
      setCompact(false);
      return;
    }
    const onChange = (event: { matches: boolean }) => setCompact(event.matches);
    mql.addEventListener("change", onChange);
    setCompact(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [eligible]);
  return compact;
}
```

Callers: in `AppShell.tsx` and `EditorScreen.tsx`, replace `useCompactLayout()` with `useCompactLayout(useServices().shell.platform())` (both files already import or can import `useServices` from `./ServicesContext`).

- [ ] **Step 5: Implement the CSS gate** — in `app-mobile.css`, inside the `@media (max-width: 760px)` block only, prefix **every** selector (each comma-separated part) with `html:not([data-platform="macos"]) `. Example:

```css
@media (max-width: 760px) {
  html:not([data-platform="macos"]) .entry-list-search input,
  html:not([data-platform="macos"]) .editor-date-input,
  html:not([data-platform="macos"]) .tag-chips input,
  html:not([data-platform="macos"]) .dialog-field input {
```

Do not use CSS nesting (the `safari13` build target would rewrite it). Leave rules outside that block untouched.

- [ ] **Step 6: Run to verify pass, then the suite**

Run: `npx vitest run src/ui/app/useCompactLayout.test.ts src/ui/app/cssContract.test.ts && npm run typecheck && npm test && npm run lint`
Expected: all pass; lint reports no errors and no infos.

- [ ] **Step 7: Commit**

```bash
git add src/ui/app/useCompactLayout.ts src/ui/app/useCompactLayout.test.ts src/ui/app/AppShell.tsx src/ui/app/EditorScreen.tsx src/ui/app/app-mobile.css src/ui/app/cssContract.test.ts
git commit -m "Keep macOS on the desktop layout at any window width"
```

---

### Task 4: macOS token block (colors, color-scheme, type)

**Files:**
- Create: `src/ui/app/app-macos.css`
- Modify: `src/ui/app/app.css` (import it **last**, after `app-connect.css`)
- Modify: `src/ui/app/cssContract.test.ts`

**Interfaces:**
- Consumes: `readCss` (Task 3).
- Produces: every `:root` token overridden under `html[data-platform="macos"]`, plus new `--bg-selected-inactive`; the stylesheet file `app-macos.css` that Tasks 5 and 6 append to.

- [ ] **Step 1: Write the failing tests** — append to `cssContract.test.ts`:

```ts
/** Custom property names declared directly in app.css's first :root block. */
function rootTokens(): string[] {
  const css = readCss("app.css");
  const start = css.indexOf(":root {");
  const body = css.slice(start, css.indexOf("}", start));
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] as string);
}

describe("macOS token block (app-macos.css)", () => {
  const mac = readCss("app-macos.css");

  it("overrides every token app.css defines", () => {
    const tokens = rootTokens();
    expect(tokens.length).toBeGreaterThan(10);
    for (const token of tokens) {
      expect(mac, `missing ${token}`).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it("declares color-scheme and never uses light-dark()", () => {
    expect(mac).toMatch(/html\[data-platform="macos"\]\s*\{[^}]*color-scheme:\s*light dark/);
    expect(mac).not.toContain("light-dark(");
  });

  it("uses system colors for text, separators, and the accent", () => {
    expect(mac).toMatch(/--text:\s*-apple-system-label/);
    expect(mac).toMatch(/--border:\s*-apple-system-separator/);
    expect(mac).toMatch(/--accent:\s*AccentColor/);
    expect(mac).toMatch(/--accent-text:\s*#ffffff/);
  });

  it("scopes every rule to the Mac platform", () => {
    const heads = mac
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((rule) => rule.split("{").slice(-2, -1)[0]?.trim() ?? "")
      .filter((head) => head.length > 0 && !head.startsWith("@"));
    for (const head of heads) {
      for (const selector of head.split(",")) {
        expect(selector.trim()).toMatch(/^html\[data-platform="macos"\]/);
      }
    }
  });

  it("is loaded after the base tokens so it wins", () => {
    const app = readCss("app.css");
    const imports = [...app.matchAll(/@import "\.\/([^"]+)"/g)].map((m) => m[1]);
    expect(imports.at(-1)).toBe("app-macos.css");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/app/cssContract.test.ts`
Expected: FAIL — `ENOENT … app-macos.css`.

- [ ] **Step 3: Implement** — create `src/ui/app/app-macos.css`:

```css
/* ABOUTME: The macOS look — system colors, type, and chrome behavior, scoped to
   ABOUTME: html[data-platform="macos"]. Other platforms never see these rules. */

html[data-platform="macos"] {
  color-scheme: light dark;

  --font-sans: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;

  --text: -apple-system-label;
  --text-muted: -apple-system-secondary-label;
  --text-faint: -apple-system-tertiary-label;
  --border: -apple-system-separator;
  --border-strong: -apple-system-container-border;
  --bg: -apple-system-text-background;
  --bg-raised: #ececec;
  --bg-sunken: #f5f5f5;
  --bg-hover: color-mix(in srgb, -apple-system-label 6%, transparent);
  --bg-selected: -apple-system-selected-content-background;
  --bg-selected-inactive: -apple-system-unemphasized-selected-content-background;
  --accent: AccentColor;
  --accent-text: #ffffff;
  --danger: -apple-system-red;
  --success: -apple-system-green;
  --warning: -apple-system-orange;
  --shadow: 0 6px 20px rgba(0, 0, 0, 0.16), 0 0 0 0.5px rgba(0, 0, 0, 0.12);
  --shadow-sheet: 0 16px 40px rgba(0, 0, 0, 0.24), 0 0 0 0.5px rgba(0, 0, 0, 0.14);
}

/* Crepe (Write mode) maps its palette onto our tokens on `.editor-doc
   .milkdown` (app-crepe.css), so its overrides need that same selector. Keep
   its selection a text selection, not a solid accent block, and drop the
   red inline code. */
html[data-platform="macos"] .editor-doc .milkdown {
  --crepe-color-selected: -apple-system-selected-text-background;
  --crepe-color-secondary: -apple-system-unemphasized-selected-content-background;
  --crepe-color-inline-code: var(--text);
}

@media (prefers-color-scheme: dark) {
  html[data-platform="macos"] {
    --bg-raised: #2d2d2d;
    --bg-sunken: #1a1a1a;
    --shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(255, 255, 255, 0.1);
    --shadow-sheet: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 0 0.5px rgba(255, 255, 255, 0.12);
  }
}

@media (prefers-contrast: more) {
  html[data-platform="macos"] {
    --border: -apple-system-container-border;
  }
}
```

In `app.css`, add `@import "./app-macos.css";` as the **last** `@import` line.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ui/app/cssContract.test.ts && npm run lint`
Expected: all pass; lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app/app-macos.css src/ui/app/app.css src/ui/app/cssContract.test.ts
git commit -m "macOS: system colors, color-scheme, and system type tokens"
```

---

### Task 5: macOS selection, focus rings, and chrome type sizes

**Files:**
- Modify: `src/ui/app/app-macos.css`
- Modify: `src/ui/app/cssContract.test.ts`

**Interfaces:**
- Consumes: selectors that exist today — `.sidebar-section-button[aria-current="true"]` (`app-sidebar.css:44`), `.entry-row[aria-current="true"]` (`app-sidebar.css:219`), `.entry-row-meta`, `.sidebar-section-count`, `.entry-row-title`, `.quick-open-row[data-active="true"]` (`app-delight.css:45`), containers `.sidebar`, `.entry-list-pane`.

- [ ] **Step 1: Write the failing test** — append to `cssContract.test.ts`:

```ts
describe("macOS selection and focus", () => {
  const mac = readCss("app-macos.css");

  it("draws focused selections as white text on the selection color", () => {
    for (const container of [".sidebar", ".entry-list-pane"]) {
      const rule = new RegExp(
        `html\\[data-platform="macos"\\] ${container.replace(".", "\\.")}:focus-within [^{]*\\[aria-current="true"\\][^{]*\\{[^}]*background:\\s*var\\(--bg-selected\\)[^}]*color:\\s*#ffffff`,
      );
      expect(mac).toMatch(rule);
    }
  });

  it("draws unfocused selections in the unemphasized gray with label text", () => {
    expect(mac).toMatch(/\[aria-current="true"\][^{]*\{[^}]*background:\s*var\(--bg-selected-inactive\)[^}]*color:\s*var\(--text\)/);
  });

  it("keeps secondary text inside a focused selection readable", () => {
    expect(mac).toMatch(/:focus-within [^{]*\[aria-current="true"\] \.entry-row-meta[^{]*\{[^}]*color:\s*rgba\(255, 255, 255, 0\.8\)/);
  });

  it("draws a 3px accent focus ring", () => {
    expect(mac).toMatch(/html\[data-platform="macos"\] :focus-visible\s*\{[^}]*outline:\s*3px solid color-mix\(in srgb, AccentColor 50%, transparent\)/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/app/cssContract.test.ts`
Expected: FAIL on the four new cases.

- [ ] **Step 3: Implement** — append to `app-macos.css`:

```css
/* Selection: AppKit draws the focused list's selection in the selection
   color with white text, and any other list's in unemphasized gray with
   normal text (focus-and-selection.md). */
html[data-platform="macos"] .sidebar-section-button[aria-current="true"],
html[data-platform="macos"] .entry-row[aria-current="true"] {
  background: var(--bg-selected-inactive);
  color: var(--text);
  font-weight: 400;
}
html[data-platform="macos"] .sidebar:focus-within .sidebar-section-button[aria-current="true"],
html[data-platform="macos"] .entry-list-pane:focus-within .entry-row[aria-current="true"] {
  background: var(--bg-selected);
  color: #ffffff;
}
html[data-platform="macos"] .sidebar:focus-within .sidebar-section-button[aria-current="true"] .sidebar-section-count,
html[data-platform="macos"] .entry-list-pane:focus-within .entry-row[aria-current="true"] .entry-row-meta {
  color: rgba(255, 255, 255, 0.8);
}
html[data-platform="macos"] .quick-open-row:hover,
html[data-platform="macos"] .quick-open-row[data-active="true"] {
  background: var(--bg-selected);
  color: #ffffff;
}

/* Focus ring: macOS's halo — wider and softer than the web default, and it
   follows the control's corner radius. */
html[data-platform="macos"] :focus-visible {
  outline: 3px solid color-mix(in srgb, AccentColor 50%, transparent);
  outline-offset: 0;
}

/* Chrome type: 13pt body (already the base), 13pt semibold list titles,
   11pt captions and counts — AppKit's defaults. */
html[data-platform="macos"] .entry-row-title {
  font-weight: 600;
}
html[data-platform="macos"] .entry-row-meta,
html[data-platform="macos"] .sidebar-section-count {
  font-size: 11px;
}
```

- [ ] **Step 4: Run to verify pass, then lint**

Run: `npx vitest run src/ui/app/cssContract.test.ts && npm run lint`
Expected: pass; lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app/app-macos.css src/ui/app/cssContract.test.ts
git commit -m "macOS: native selection, focus ring, and chrome type sizes"
```

---

### Task 6: macOS scrollbars, cursor, and non-selectable chrome

**Files:**
- Modify: `src/ui/app/app.css:155-172` (scope the custom scrollbar to non-Mac)
- Modify: `src/ui/app/app-macos.css`
- Modify: `src/ui/app/cssContract.test.ts`

- [ ] **Step 1: Write the failing test** — append to `cssContract.test.ts`:

```ts
describe("macOS chrome behavior", () => {
  it("never styles scrollbars on macOS (native overlay scrollbars return)", () => {
    const app = readCss("app.css");
    const scrollbarRules = [...app.matchAll(/([^{}]*::-webkit-scrollbar[^{]*)\{/g)].map((m) => (m[1] ?? "").trim());
    expect(scrollbarRules.length).toBeGreaterThan(0);
    for (const head of scrollbarRules) {
      for (const selector of head.split(",")) {
        expect(selector.trim()).toMatch(/^html:not\(\[data-platform="macos"\]\) /);
      }
    }
  });

  it("uses the arrow cursor for controls and makes chrome text unselectable", () => {
    const mac = readCss("app-macos.css");
    expect(mac).toMatch(/cursor:\s*default/);
    expect(mac).toMatch(/user-select:\s*none/);
    // Content and fields must stay selectable.
    expect(mac).toMatch(/:is\([^)]*input[^)]*textarea[^)]*\.ProseMirror[^)]*\.cm-content[^)]*\)\s*\{[^}]*user-select:\s*text/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/app/cssContract.test.ts`
Expected: FAIL — `::-webkit-scrollbar` selectors aren't scoped; no `cursor: default`.

- [ ] **Step 3: Implement**

In `app.css`, prefix each of the four scrollbar rules' selectors with `html:not([data-platform="macos"]) `:

```css
html:not([data-platform="macos"]) ::-webkit-scrollbar {
  width: 9px;
  height: 9px;
}
html:not([data-platform="macos"]) ::-webkit-scrollbar-track {
  background: transparent;
}
html:not([data-platform="macos"]) ::-webkit-scrollbar-thumb {
  /* …unchanged body… */
}
html:not([data-platform="macos"]) ::-webkit-scrollbar-thumb:hover {
  /* …unchanged body… */
}
```

Append to `app-macos.css`:

```css
/* Mac controls use the arrow cursor; the pointing hand is for links. The
   [role] arm raises specificity past two-class rules like `.a .b`. */
html[data-platform="macos"] :is(button, select, summary, label, [role="button"], [role="tab"], [role="option"]) {
  cursor: default;
}

/* Chrome isn't text: dragging across the sidebar or a toolbar must not
   select labels, and ⌘A in the list must not highlight the whole window. */
html[data-platform="macos"] body {
  user-select: none;
}
html[data-platform="macos"] :is(input, textarea, [contenteditable="true"], .ProseMirror, .cm-content) {
  user-select: text;
}
```

(`.ProseMirror` is Milkdown/Crepe's editable surface and `.cm-content` is CodeMirror's; the live view is an iframe, which this rule doesn't reach.)

- [ ] **Step 4: Run to verify pass, then lint and suite**

Run: `npx vitest run src/ui/app/cssContract.test.ts && npm run lint && npm test`
Expected: pass; lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app/app.css src/ui/app/app-macos.css src/ui/app/cssContract.test.ts
git commit -m "macOS: native scrollbars, arrow cursor, unselectable chrome"
```

---

### Task 7: Rust SF Symbol renderer

**Files:**
- Create: `src-tauri/src/symbols.rs`
- Create: `src-tauri/tests/symbols.rs` (runs on the main thread: `harness = false`)
- Modify: `src-tauri/Cargo.toml` (macOS-only deps, `[[test]]`)
- Modify: `src-tauri/src/lib.rs` (`pub mod symbols;`, register command)
- Modify: `src-tauri/permissions/native-ui.toml` (add `render_symbol`)

**Interfaces:**
- Produces:
  - Rust: `pub enum SymbolWeight { Regular, Medium, Semibold }` (serde `lowercase`); `pub struct SymbolPng { pub png: Vec<u8>, pub width: f64, pub height: f64 }` (width/height in **points**; PNG pixels = points × scale); `pub fn render_symbol_png(name: &str, point_size: f64, weight: SymbolWeight, scale: f64) -> Result<SymbolPng, String>` (macOS only).
  - Tauri command `render_symbol { name: string, pointSize: number, weight: "regular"|"medium"|"semibold", scale: number }` → `{ pngBase64: string, width: number, height: number }`; on non-macOS it returns an error string.

- [ ] **Step 1: Dependencies** — in `src-tauri/Cargo.toml` add:

```toml
base64 = "0.22"

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-foundation = { version = "0.3.2", features = ["NSString", "NSData", "NSDictionary", "NSGeometry"] }
objc2-app-kit = { version = "0.3.2", features = [
  "NSImage",
  "NSImageRep",
  "NSBitmapImageRep",
  "NSGraphicsContext",
  "NSFontDescriptor",
  "objc2-core-foundation",
  "objc2-core-graphics",
] }

[[test]]
name = "symbols"
harness = false
```

(`base64` goes under the existing `[dependencies]`. Check `Cargo.lock` for the `objc2` version objc2-app-kit 0.3.2 depends on — `grep -A6 'name = "objc2-app-kit"' Cargo.lock` — and use that major.minor for `objc2`.)

- [ ] **Step 2: Write the failing test** — `src-tauri/tests/symbols.rs`. AppKit drawing wants the main thread, and libtest runs tests on worker threads, so this is a plain `main`:

```rust
// ABOUTME: Main-thread checks for the SF Symbol renderer (harness = false:
// ABOUTME: AppKit image drawing wants the main thread, libtest doesn't provide it).

#[cfg(target_os = "macos")]
fn main() {
    use app_lib::symbols::{render_symbol_png, SymbolWeight};

    let png = render_symbol_png("square.and.pencil", 16.0, SymbolWeight::Regular, 2.0)
        .expect("known symbol renders");
    assert_eq!(&png.png[..8], b"\x89PNG\r\n\x1a\n", "output is a PNG");
    let px_w = u32::from_be_bytes(png.png[16..20].try_into().unwrap());
    let px_h = u32::from_be_bytes(png.png[20..24].try_into().unwrap());
    assert!(png.width > 8.0 && png.height > 8.0, "point size is plausible: {}x{}", png.width, png.height);
    assert_eq!(f64::from(px_w), (png.width * 2.0).round(), "pixels = points x scale (width)");
    assert_eq!(f64::from(px_h), (png.height * 2.0).round(), "pixels = points x scale (height)");

    let err = render_symbol_png("definitely.not.a.symbol", 16.0, SymbolWeight::Regular, 2.0)
        .expect_err("unknown symbol is an error");
    assert!(err.contains("definitely.not.a.symbol"), "error names the symbol: {err}");

    println!("symbols: ok");
}

#[cfg(not(target_os = "macos"))]
fn main() {}
```

- [ ] **Step 3: Run to verify failure**

Run: `cd src-tauri && cargo test -q --test symbols`
Expected: compile error — `unresolved import app_lib::symbols`.

- [ ] **Step 4: Implement** — `src-tauri/src/symbols.rs`:

```rust
// ABOUTME: Renders SF Symbols to PNG at runtime via AppKit, so the webview can
// ABOUTME: show real system symbols without the repo ever shipping symbol files.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SymbolWeight {
    Regular,
    Medium,
    Semibold,
}

/// A rendered symbol. `width`/`height` are in points; the PNG's pixel size is
/// points × the requested scale.
pub struct SymbolPng {
    pub png: Vec<u8>,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolImage {
    png_base64: String,
    width: f64,
    height: f64,
}

/// # Errors
///
/// Returns an error naming the symbol when macOS doesn't know it, or when
/// rasterizing or PNG-encoding fails.
#[cfg(target_os = "macos")]
pub fn render_symbol_png(
    name: &str,
    point_size: f64,
    weight: SymbolWeight,
    scale: f64,
) -> Result<SymbolPng, String> {
    use objc2::AllocAnyThread;
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSFontWeightMedium, NSFontWeightRegular,
        NSFontWeightSemibold, NSImage, NSImageSymbolConfiguration, NSImageSymbolScale,
    };
    use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};

    // SAFETY: reading AppKit's immutable font-weight constants.
    let ns_weight = unsafe {
        match weight {
            SymbolWeight::Regular => NSFontWeightRegular,
            SymbolWeight::Medium => NSFontWeightMedium,
            SymbolWeight::Semibold => NSFontWeightSemibold,
        }
    };
    let base = NSImage::imageWithSystemSymbolName_accessibilityDescription(
        &NSString::from_str(name),
        None,
    )
    .ok_or_else(|| format!("unknown SF Symbol: {name}"))?;
    let config = NSImageSymbolConfiguration::configurationWithPointSize_weight_scale(
        point_size,
        ns_weight,
        NSImageSymbolScale::Medium,
    );
    let image = base
        .imageWithSymbolConfiguration(&config)
        .ok_or_else(|| format!("couldn't configure SF Symbol: {name}"))?;
    let size = image.size();
    let mut rect = NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(size.width * scale, size.height * scale),
    );
    // SAFETY: `rect` is a valid, exclusively borrowed NSRect; no context or
    // hints are passed.
    let cg = unsafe { image.CGImageForProposedRect_context_hints(&mut rect, None, None) }
        .ok_or_else(|| format!("couldn't rasterize SF Symbol: {name}"))?;
    let rep = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg);
    // SAFETY: an empty properties dictionary is always valid.
    let data = unsafe {
        rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }
    .ok_or_else(|| format!("couldn't encode SF Symbol as PNG: {name}"))?;
    Ok(SymbolPng {
        png: data.to_vec(),
        width: size.width,
        height: size.height,
    })
}

/// Tauri command: a sync command, so it runs on the main thread (AppKit).
///
/// # Errors
///
/// See [`render_symbol_png`]; on platforms without SF Symbols it always
/// errors and the frontend falls back to its own icon set.
#[tauri::command]
pub fn render_symbol(
    name: &str,
    point_size: f64,
    weight: SymbolWeight,
    scale: f64,
) -> Result<SymbolImage, String> {
    #[cfg(target_os = "macos")]
    {
        use base64::Engine;
        let png = render_symbol_png(name, point_size, weight, scale)?;
        Ok(SymbolImage {
            png_base64: base64::engine::general_purpose::STANDARD.encode(&png.png),
            width: png.width,
            height: png.height,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (point_size, weight, scale);
        Err(format!("SF Symbols unavailable on this platform: {name}"))
    }
}
```

The objc2 method and type names above were checked against `objc2-app-kit-0.3.2/src/generated/NSImage.rs` and `NSBitmapImageRep.rs`. If the compiler still reports a missing item, open its definition in `~/.cargo/registry/src/*/objc2-app-kit-0.3.2/src/generated/` and add the feature named in its `#[cfg(feature = "…")]` line to the Cargo.toml list; if `AllocAnyThread` isn't the trait name in the resolved objc2 version, use the `alloc()` provider trait that version's docs name for `NSBitmapImageRep`.

In `lib.rs`: `pub mod symbols;` (public so the integration test can reach it) and add `symbols::render_symbol,` to `generate_handler!`. In `native-ui.toml` add:

```toml
[[permission]]
identifier = "allow-render-symbol"
description = "Enables the render_symbol command, which draws an SF Symbol to PNG."
commands.allow = ["render_symbol"]
```

and append `"allow-render-symbol"` to the `native-ui` set's `permissions`, and update its description to "…(platform detection, SF Symbol rendering)."

- [ ] **Step 5: Run to verify pass**

Run: `cd src-tauri && cargo test -q --test symbols`
Expected: prints `symbols: ok`.

If the pixel-size assertions fail (AppKit returned a 1× image despite the larger proposed rect), switch the rasterizing step to drawing into an explicitly sized bitmap: create `NSBitmapImageRep` with `initWithBitmapDataPlanes_pixelsWide_pixelsHigh_…` at `ceil(width*scale) × ceil(height*scale)`, set its `size` to the point size, make an `NSGraphicsContext` from it, and `drawInRect` the image — then re-run. Don't loosen the test.

- [ ] **Step 6: Full Rust checks**

Run: `cd src-tauri && cargo fmt --check && cargo clippy -q --all-targets -- -D warnings && cargo test -q`
Expected: clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/symbols.rs src-tauri/src/lib.rs src-tauri/tests/symbols.rs src-tauri/permissions/native-ui.toml
git commit -m "Render SF Symbols to PNG at runtime via AppKit"
```

---

### Task 8: `<Icon>` — semantic icons with SF Symbols on macOS, Lucide elsewhere

**Files:**
- Modify: `package.json` / `package-lock.json` (`npm install lucide-react@1.47.0`)
- Modify: `src/shell/types.ts` (`renderSymbol`), `src/shell/tauri.ts`, `src/shell/fake.ts`
- Create: `src/ui/icons/iconNames.ts`, `src/ui/icons/symbolCache.ts`, `src/ui/icons/Icon.tsx`
- Create: `src/ui/icons/symbolCache.test.ts`, `src/ui/icons/Icon.test.tsx`
- Modify: `src/ui/app/EditorScreen.tsx` (`HistoryButton`, `ViewOnSiteButton` use `<Icon>`)
- Modify: `src/ui/app/app-delight.css` (`.icon` mask class) — or `app.css`, next to `.editor-icon-button`

**Interfaces:**
- Consumes: Tauri command `render_symbol` (Task 7).
- Produces:
  - `src/shell/types.ts`: `export type SymbolWeight = "regular" | "medium" | "semibold";` `export interface SymbolImage { dataUrl: string; width: number; height: number }` (points); `ShellApi.renderSymbol(name: string, pointSize: number, weight: SymbolWeight, scale: number): Promise<SymbolImage | null>` — resolves `null` on any failure, never rejects.
  - `FakeShellOptions.renderSymbol?: ShellApi["renderSymbol"]` (default: resolves `null`).
  - `iconNames.ts`: `export type IconName = keyof typeof ICONS;` `export const ICONS: Record<…, { sfSymbol: string; lucide: LucideIcon }>`.
  - `symbolCache.ts`: `createSymbolCache(render: ShellApi["renderSymbol"], warn?: (msg: string) => void)` → `{ get(name, pointSize, weight, scale): Promise<SymbolImage | null> }`.
  - `Icon.tsx`: `<Icon name={IconName} size?={number /*pt, default 14*/} weight?={SymbolWeight} />`, decorative (`aria-hidden`); the button keeps the accessible label.

- [ ] **Step 1: Install Lucide**

Run: `npm install --save-exact lucide-react@1.47.0`
Expected: package.json gains `"lucide-react": "1.47.0"`.

- [ ] **Step 2: Write the failing cache test** — `src/ui/icons/symbolCache.test.ts`:

```ts
// ABOUTME: symbolCache — one render per (name, size, weight, scale), and a
// ABOUTME: failed symbol falls back quietly with exactly one warning per name.
import { describe, expect, it, vi } from "vitest";
import { createSymbolCache } from "./symbolCache";

const IMAGE = { dataUrl: "data:image/png;base64,AAAA", width: 16, height: 15 };

describe("createSymbolCache", () => {
  it("renders each (name, size, weight, scale) once", async () => {
    const render = vi.fn().mockResolvedValue(IMAGE);
    const cache = createSymbolCache(render);
    await cache.get("clock", 14, "regular", 2);
    await cache.get("clock", 14, "regular", 2);
    await cache.get("clock", 14, "regular", 1);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("returns null for a failed symbol and warns once per name", async () => {
    const render = vi.fn().mockResolvedValue(null);
    const warn = vi.fn();
    const cache = createSymbolCache(render, warn);
    expect(await cache.get("nope", 14, "regular", 2)).toBeNull();
    expect(await cache.get("nope", 16, "regular", 2)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("SF Symbol unavailable, using fallback icon: nope");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/ui/icons/symbolCache.test.ts`
Expected: FAIL — cannot resolve `./symbolCache`.

- [ ] **Step 4: Implement the shell method and the cache**

`src/shell/types.ts` — add the two types above and, inside `ShellApi`:

```ts
  /** An SF Symbol rendered by the OS (Apple platforms only). Resolves null
   *  when unavailable — callers fall back to their own icon. Never rejects. */
  renderSymbol(
    name: string,
    pointSize: number,
    weight: SymbolWeight,
    scale: number,
  ): Promise<SymbolImage | null>;
```

`src/shell/tauri.ts` — add to the returned object:

```ts
    async renderSymbol(name, pointSize, weight, scale) {
      try {
        const out = await invoke<{ pngBase64: string; width: number; height: number }>(
          "render_symbol",
          { name, pointSize, weight, scale },
        );
        return { dataUrl: `data:image/png;base64,${out.pngBase64}`, width: out.width, height: out.height };
      } catch {
        return null;
      }
    },
```

`src/shell/fake.ts` — add `renderSymbol?: ShellApi["renderSymbol"];` to `FakeShellOptions` and to the returned object:

```ts
    renderSymbol(name, pointSize, weight, scale) {
      return options.renderSymbol
        ? options.renderSymbol(name, pointSize, weight, scale)
        : Promise.resolve(null);
    },
```

`src/ui/icons/symbolCache.ts`:

```ts
// ABOUTME: Memoizes SF Symbol renders per (name, size, weight, scale) so each
// ABOUTME: icon crosses the Rust bridge once, and warns once per missing name.
import type { ShellApi, SymbolImage, SymbolWeight } from "../../shell/types";

export function createSymbolCache(
  render: ShellApi["renderSymbol"],
  warn: (msg: string) => void = (msg) => console.warn(msg),
) {
  const results = new Map<string, Promise<SymbolImage | null>>();
  const warned = new Set<string>();
  return {
    get(name: string, pointSize: number, weight: SymbolWeight, scale: number) {
      const key = `${name}|${pointSize}|${weight}|${scale}`;
      let pending = results.get(key);
      if (!pending) {
        pending = render(name, pointSize, weight, scale).then((image) => {
          if (image === null && !warned.has(name)) {
            warned.add(name);
            warn(`SF Symbol unavailable, using fallback icon: ${name}`);
          }
          return image;
        });
        results.set(key, pending);
      }
      return pending;
    },
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/ui/icons/symbolCache.test.ts && npm run typecheck`
Expected: 2 passed; typecheck clean (every `ShellApi` implementation now has `renderSymbol`).

- [ ] **Step 6: Write the failing component test** — `src/ui/icons/Icon.test.tsx`. Look at an existing jsdom test that renders a component inside `ServicesProvider` (e.g. `grep -ln "ServicesProvider" src/ui/app/*.test.tsx`) and build services the same way it does, varying only the fake shell:

```tsx
// @vitest-environment jsdom
// ABOUTME: <Icon> — SF Symbol mask on macOS when the OS renders it; Lucide on
// ABOUTME: other platforms and whenever the symbol isn't available.
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeShell } from "../../shell";
import { Icon } from "./Icon";
import { renderWithServices } from "./testHelpers";

afterEach(cleanup);

describe("Icon", () => {
  it("draws the Lucide icon on non-Apple platforms without asking for a symbol", () => {
    const renderSymbol = vi.fn();
    const shell = createFakeShell({ platform: "android", renderSymbol });
    const { container } = renderWithServices(<Icon name="versions" />, shell);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(renderSymbol).not.toHaveBeenCalled();
  });

  it("uses the OS-rendered SF Symbol as a mask on macOS", async () => {
    const shell = createFakeShell({
      platform: "macos",
      renderSymbol: () =>
        Promise.resolve({ dataUrl: "data:image/png;base64,QUJD", width: 15, height: 14 }),
    });
    const { container } = renderWithServices(<Icon name="versions" size={14} />, shell);
    await waitFor(() => {
      const mask = container.querySelector<HTMLElement>(".icon-symbol");
      expect(mask?.style.getPropertyValue("--icon-mask")).toBe('url("data:image/png;base64,QUJD")');
      expect(mask?.style.width).toBe("15px");
    });
    expect(container.querySelector("svg")).toBeNull();
  });

  it("falls back to Lucide on macOS when the symbol can't be rendered", async () => {
    const shell = createFakeShell({ platform: "macos", renderSymbol: () => Promise.resolve(null) });
    const { container } = renderWithServices(<Icon name="versions" />, shell);
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
  });

  it("is decorative: hidden from assistive tech", () => {
    const shell = createFakeShell({ platform: "web" });
    const { container } = renderWithServices(<Icon name="openOnSite" />, shell);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});
```

Create `src/ui/icons/testHelpers.tsx` exporting `renderWithServices(node, shell)` that wraps `node` in `ServicesProvider` with a `Services` object built like the existing tests build theirs, substituting `shell` (2-line ABOUTME header; keep it under 30 lines).

- [ ] **Step 7: Run to verify failure**

Run: `npx vitest run src/ui/icons/Icon.test.tsx`
Expected: FAIL — cannot resolve `./Icon`.

- [ ] **Step 8: Implement the name map and component**

`src/ui/icons/iconNames.ts`:

```ts
// ABOUTME: Semantic icon names → SF Symbol (Apple platforms, rendered by the OS)
// ABOUTME: and Lucide (everywhere else). Components only ever use the semantic name.
import { ExternalLink, History, type LucideIcon } from "lucide-react";

export const ICONS = {
  versions: { sfSymbol: "clock.arrow.circlepath", lucide: History },
  openOnSite: { sfSymbol: "arrow.up.right.square", lucide: ExternalLink },
} satisfies Record<string, { sfSymbol: string; lucide: LucideIcon }>;

export type IconName = keyof typeof ICONS;
```

(Later phases add names here next to their first use — don't pre-add unused ones.)

`src/ui/icons/Icon.tsx`:

```tsx
// ABOUTME: <Icon name>: an SF Symbol drawn by macOS (as a CSS mask tinted with
// ABOUTME: currentColor) on Apple platforms, the Lucide icon everywhere else.
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import type { SymbolImage, SymbolWeight } from "../../shell/types";
import { useServices } from "../app/ServicesContext";
import { ICONS, type IconName } from "./iconNames";
import { createSymbolCache } from "./symbolCache";

type CacheOwner = { renderSymbol: Parameters<typeof createSymbolCache>[0] };
const caches = new WeakMap<CacheOwner, ReturnType<typeof createSymbolCache>>();

function cacheFor(shell: CacheOwner) {
  let cache = caches.get(shell);
  if (!cache) {
    cache = createSymbolCache((...args) => shell.renderSymbol(...args));
    caches.set(shell, cache);
  }
  return cache;
}

export function Icon(props: { name: IconName; size?: number; weight?: SymbolWeight }) {
  const { shell } = useServices();
  const size = props.size ?? 14;
  const weight = props.weight ?? "regular";
  const apple = shell.platform() === "macos";
  const entry = ICONS[props.name];
  // undefined = still loading, null = unavailable (use Lucide).
  const [symbol, setSymbol] = useState<SymbolImage | null | undefined>(apple ? undefined : null);
  const scale = useMemo(() => Math.max(1, Math.round(globalThis.devicePixelRatio || 1)), []);

  useEffect(() => {
    if (!apple) {
      return;
    }
    let live = true;
    cacheFor(shell)
      .get(entry.sfSymbol, size, weight, scale)
      .then((image) => {
        if (live) setSymbol(image);
      });
    return () => {
      live = false;
    };
  }, [apple, shell, entry.sfSymbol, size, weight, scale]);

  if (symbol === undefined) {
    // Reserve the box while the OS renders, so the toolbar doesn't jump.
    return <span className="icon-symbol" aria-hidden="true" style={{ width: size, height: size }} />;
  }
  if (symbol === null) {
    const Lucide = entry.lucide;
    return <Lucide size={size} strokeWidth={2} aria-hidden="true" />;
  }
  // CSSProperties has no index signature for custom properties.
  const style = {
    width: symbol.width,
    height: symbol.height,
    "--icon-mask": `url("${symbol.dataUrl}")`,
  } as CSSProperties;
  return <span className="icon-symbol" aria-hidden="true" style={style} />;
}
```

CSS (next to `.editor-icon-button` in `app-delight.css`):

```css
.icon-symbol {
  display: inline-block;
  flex: none;
  background-color: currentColor;
  -webkit-mask: var(--icon-mask) center / contain no-repeat;
  mask: var(--icon-mask) center / contain no-repeat;
}
```

- [ ] **Step 9: Use it** — in `EditorScreen.tsx`, replace the inline `<svg>…</svg>` in `HistoryButton` with `<Icon name="versions" />` and in `ViewOnSiteButton` with `<Icon name="openOnSite" />` (import from `../icons/Icon`). Keep the buttons' `aria-label`s and titles.

- [ ] **Step 10: Run to verify pass, then everything**

Run: `npx vitest run src/ui/icons && npm run typecheck && npm test && npm run lint`
Expected: all pass; lint reports no errors and no infos. (If an existing EditorScreen test renders these buttons without a `ServicesProvider`, it will now fail on `useServices` — fix the test to render inside the provider the way its neighbors do; don't make `Icon` tolerate a missing provider.)

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/shell src/ui/icons src/ui/app/EditorScreen.tsx src/ui/app/app-delight.css
git commit -m "Semantic <Icon>: OS-rendered SF Symbols on macOS, Lucide elsewhere"
```

---

### Task 9: Fail release builds that mangle the macOS token block

**Files:**
- Create: `scripts/check-release-css.mjs`
- Modify: `package.json` (`build` script)

- [ ] **Step 1: Write the check** — `scripts/check-release-css.mjs`:

```js
#!/usr/bin/env node
// ABOUTME: Post-build guard: the minified CSS must still carry the macOS token
// ABOUTME: block intact (minifiers can rewrite color functions we depend on).
//
// Usage: node scripts/check-release-css.mjs [distDir]   (default: dist)
// Runs automatically at the end of `npm run build`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2] ?? "dist";
const assets = join(dist, "assets");
const files = readdirSync(assets).filter((f) => f.endsWith(".css"));
if (files.length === 0) {
  console.error(`check-release-css: no CSS in ${assets} — did the build run?`);
  process.exit(1);
}
const css = files.map((f) => readFileSync(join(assets, f), "utf8")).join("\n");

const required = [
  ["macOS scope", /html\[data-platform=("?)macos\1\]/],
  ["color-scheme", /color-scheme:\s*light dark/],
  ["label color", /--text:\s*-apple-system-label/],
  ["accent color", /--accent:\s*AccentColor/],
  ["selection color", /--bg-selected:\s*-apple-system-selected-content-background/],
];
const failures = required.filter(([, re]) => !re.test(css)).map(([what]) => what);
if (/light-dark\(/.test(css)) failures.push("light-dark() present");

if (failures.length > 0) {
  console.error(`check-release-css: FAILED — ${failures.join(", ")}`);
  console.error(`  checked: ${files.join(", ")}`);
  process.exit(1);
}
console.log(`check-release-css: ok (${files.length} file${files.length === 1 ? "" : "s"})`);
```

- [ ] **Step 2: Prove it fails when it should** — run it against a fake dist whose CSS lacks the block and uses `light-dark()`:

```bash
FAKE="$(mktemp -d)"; mkdir -p "$FAKE/assets"
printf ':root{--text:#1c1e21;--bg:light-dark(#fff,#000)}' > "$FAKE/assets/index.css"
node scripts/check-release-css.mjs "$FAKE"; echo "exit=$?"
rm -rf "$FAKE"
```

Expected: `check-release-css: FAILED — macOS scope, color-scheme, label color, accent color, selection color, light-dark() present` and `exit=1`.

- [ ] **Step 3: Wire it into the build** — in `package.json`:

```json
    "build": "tsc --noEmit && vite build && node scripts/check-release-css.mjs",
```

- [ ] **Step 4: Run it for real**

Run: `npm run build`
Expected: ends with `check-release-css: ok (1 file)` (or however many CSS files Vite emits).

- [ ] **Step 5: Commit**

```bash
git add scripts/check-release-css.mjs package.json
git commit -m "Fail release builds whose CSS lost the macOS token block"
```

---

### Task 10: Verify in the real app

**Files:** none (verification only; fix anything found in a new commit with a test first).

- [ ] **Step 1: Launch** — `scripts/dev-app.sh` (builds and opens the signed "Blogosphere Dev" bundle with its own data). Then `scripts/tauri-mcp.sh driver-session start --port 9223` and confirm `scripts/tauri-mcp.sh driver-session status --json` shows `"connected":true`.

- [ ] **Step 2: Platform and tokens resolve**

```bash
scripts/tauri-mcp.sh webview-execute-js --script "JSON.stringify({p: document.documentElement.dataset.platform, text: getComputedStyle(document.body).color, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), hover: (() => { const d = document.createElement('div'); d.style.background = 'var(--bg-hover)'; document.body.appendChild(d); const v = getComputedStyle(d).backgroundColor; d.remove(); return v; })()})"
```

Expected: `p` is `macos`; `text` is `rgba(0, 0, 0, 0.847)` in light mode; `accent` is `AccentColor`; `hover` is a translucent black (proves `color-mix` with a system color resolves in WKWebView — if it's `rgba(0, 0, 0, 0)`, replace `--bg-hover` with a fixed `rgba(0, 0, 0, 0.05)` / dark `rgba(255, 255, 255, 0.07)` pair, test-first in `cssContract.test.ts`).

- [ ] **Step 3: Icons render as SF Symbols** — select any entry, then:

```bash
scripts/tauri-mcp.sh webview-execute-js --script "[...document.querySelectorAll('.editor-icon-button .icon-symbol')].map(e => e.style.getPropertyValue('--icon-mask').slice(0, 30) + ' ' + e.style.width).join(' | ')"
```

Expected: one or two entries starting with `url("data:image/png;base64,` and a px width. Take `scripts/tauri-mcp.sh webview-screenshot --file <scratchpad>/phase1-light.png` and look at it: crisp symbols, native-looking scrollbars (overlay, appear on scroll), no pointer-hand over buttons.

- [ ] **Step 4: Narrow window stays desktop**

```bash
scripts/tauri-mcp.sh manage-window --action resize --width 760 --height 600
scripts/tauri-mcp.sh webview-execute-js --script "document.querySelector('.app-shell').dataset.layout"
```

Expected: `wide` (`AppShell.tsx` sets `data-layout` to `compact` or `wide`). The window can't go below its 760px minimum; that's the narrowest case this phase has to hold.

- [ ] **Step 5: Dark mode and selection readability** — ask Jesse to switch Appearance to Dark (or use `scripts/tauri-mcp.sh` screenshots after he does), select an entry with the list focused, and take `phase1-dark.png`. Expected: white title and 80%-white date on the accent selection; unfocus the list (click the editor) → gray selection, normal text. This is also where Jesse flips the accent color once to confirm live tracking (spec open risk); record the result in the PR description.

- [ ] **Step 6: Non-Mac look unchanged** — `npm run dev`, open `http://localhost:5173` in the built-in browser (it's the web platform): the app looks exactly as before this phase (old palette, custom scrollbars). Screenshot for the PR.

- [ ] **Step 7: Record** — write the results (pass/fail per step, screenshots' paths, the accent-tracking outcome) into the PR description when phase 1 is proposed for merge. No commit needed unless a fix was made.
