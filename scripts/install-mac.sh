#!/usr/bin/env bash
# ABOUTME: Builds the macOS .app bundle and installs it into /Applications,
# ABOUTME: replacing any existing copy. For local testing of a fresh build.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/install-mac.sh [--help]

Builds Blogosphere.app (release, .app bundle only — no dmg) and installs it
to /Applications/Blogosphere.app, replacing the existing copy.

Refuses to run while Blogosphere is open, so the running app isn't swapped
out from under itself. Quit it first.

Full build output goes to a log file; only the tail is shown on failure.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -gt 0 ]]; then
  echo "error: unknown argument: $1" >&2
  usage >&2
  exit 2
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
built_app="$repo_root/src-tauri/target/release/bundle/macos/Blogosphere.app"
installed_app="/Applications/Blogosphere.app"
log_file="$(mktemp -t blogosphere-build).log"

if pgrep -f "$installed_app/Contents/MacOS/" >/dev/null; then
  echo "error: Blogosphere is running — quit it, then re-run." >&2
  exit 1
fi

echo "Building (log: $log_file)..."
if ! (cd "$repo_root" && npm run tauri build -- --bundles app) >"$log_file" 2>&1; then
  echo "error: build failed. Last 30 lines:" >&2
  tail -n 30 "$log_file" >&2
  exit 1
fi

if [[ ! -d "$built_app" ]]; then
  echo "error: build succeeded but $built_app is missing (see $log_file)" >&2
  exit 1
fi

rm -rf "$installed_app"
cp -R "$built_app" "$installed_app"
echo "Installed $installed_app ($(git -C "$repo_root" rev-parse --short HEAD))"
