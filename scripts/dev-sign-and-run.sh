#!/usr/bin/env bash
# ABOUTME: Cargo runner for macOS: signs the freshly built binary with a stable
# ABOUTME: identity, then runs it — so `tauri dev` stops re-prompting the keychain.
set -euo pipefail

# Wired up in src-tauri/.cargo/config.toml; cargo invokes this as
# `dev-sign-and-run.sh <binary> [args...]` for `cargo run` (and so `tauri dev`)
# and for test binaries. Signing is best-effort: without an identity the
# binary runs unsigned exactly as before.

if [[ $# -eq 0 || "$1" == "-h" || "$1" == "--help" ]]; then
  echo "Usage: dev-sign-and-run.sh <binary> [args...]  (invoked by cargo as a runner)"
  exit 0
fi

binary="$1"
shift

# One identifier for every dev build (this binary and the debug .app bundle):
# the keychain keys its approval on identifier + certificate.
dev_identifier="com.fsck.blogosphere.dev"

script_dir="$(cd "$(dirname "$0")" && pwd)"
if identity="$("$script_dir/signing-identity.sh")"; then
  if ! codesign --force --sign "$identity" --identifier "$dev_identifier" "$binary" 2>/tmp/blogosphere-codesign.log; then
    echo "warning: codesign failed (see /tmp/blogosphere-codesign.log); running unsigned" >&2
  fi
else
  echo "warning: no signing identity; running unsigned (keychain will re-prompt)" >&2
fi

exec "$binary" "$@"
