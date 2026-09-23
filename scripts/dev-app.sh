#!/usr/bin/env bash
# ABOUTME: Builds and opens "Blogosphere Dev.app" — a signed debug bundle with its
# ABOUTME: own identifier and data, safe to run next to the installed app.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/dev-app.sh [--no-open]

Builds a debug .app bundle as "Blogosphere Dev" (identifier
com.fsck.blogosphere.dev) and opens it.

Why a bundle instead of `npm run tauri dev`:
  - its own identifier means its own app-data folder and database, so it never
    fights the installed Blogosphere over the same SQLite file;
  - a real .app is something screenshot/UI tooling can target by bundle id;
  - it's a debug build, so the localhost MCP bridge (scripts/tauri-mcp.sh)
    is included.

It shares the keychain token (same keychain service), and is signed via
scripts/signing-identity.sh so the keychain approval sticks across rebuilds.

Full build output goes to a log file; only the tail is shown on failure.
EOF
}

open_after=true
case "${1:-}" in
  -h | --help) usage; exit 0 ;;
  --no-open) open_after=false ;;
  "") ;;
  *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
esac

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
dev_app="$repo_root/src-tauri/target/debug/bundle/macos/Blogosphere Dev.app"
log_file="$(mktemp -t blogosphere-dev-build).log"

if identity="$("$repo_root/scripts/signing-identity.sh")"; then
  export APPLE_SIGNING_IDENTITY="$identity"
else
  echo "warning: no signing identity; building ad-hoc (keychain will re-prompt)" >&2
fi

# Quit a running copy first so `open` launches the fresh build.
pkill -f "Blogosphere Dev.app/Contents/MacOS/" || true

echo "Building Blogosphere Dev (log: $log_file)..."
if ! (cd "$repo_root" && npm run tauri build -- --debug --bundles app \
  --config '{"identifier":"com.fsck.blogosphere.dev","productName":"Blogosphere Dev"}') \
  >"$log_file" 2>&1; then
  echo "error: build failed. Last 30 lines:" >&2
  tail -n 30 "$log_file" >&2
  exit 1
fi

echo "Built $dev_app"
if $open_after; then
  open "$dev_app"
fi
