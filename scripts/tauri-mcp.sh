#!/usr/bin/env bash
# ABOUTME: Runs the tauri-mcp CLI (screenshots, DOM, IPC against a running
# ABOUTME: dev build) pinned to the same version as the Rust bridge crate.
set -euo pipefail

# Keep in sync with tauri-plugin-mcp-bridge in src-tauri/Cargo.toml — the CLI
# warns (and can misbehave) when the two versions drift apart.
CLI_VERSION="0.13.0"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -eq 0 ]]; then
  cat <<'EOF'
Usage: scripts/tauri-mcp.sh <tauri-mcp args...>

Drives a running Blogosphere dev build (`npm run tauri dev`) through the
debug-only MCP bridge on 127.0.0.1:9223. Release builds don't include it.

  scripts/tauri-mcp.sh driver-session start --port 9223
  scripts/tauri-mcp.sh driver-session status --json   # check "connected":true
  scripts/tauri-mcp.sh webview-screenshot --file shot.png
  scripts/tauri-mcp.sh webview-get-styles --selector ".sidebar" --properties '["background-color"]'
  scripts/tauri-mcp.sh driver-session stop

All flags are kebab-case. Full reference: the tauri-mcp-cli agent skill.
EOF
  exit 0
fi

exec npx -y -p "@hypothesi/tauri-mcp-cli@${CLI_VERSION}" tauri-mcp "$@"
