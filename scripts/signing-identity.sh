#!/usr/bin/env bash
# ABOUTME: Prints the code-signing identity local macOS builds should use, so
# ABOUTME: rebuilds keep one signature and the keychain stops re-prompting.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: scripts/signing-identity.sh

Prints the codesigning identity for local builds and exits 0, or prints
nothing and exits 1 when there isn't one (callers fall back to ad-hoc).

Why: the keychain remembers "Always Allow" per signer. Ad-hoc signatures
change on every rebuild, so each new build prompts for your password again.
Signing every build with the same certificate means you approve once.

Order: $APPLE_SIGNING_IDENTITY if set (the same variable the Tauri CLI
reads), else the first "Apple Development" identity in your keychain.
EOF
  exit 0
fi

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  printf '%s\n' "$APPLE_SIGNING_IDENTITY"
  exit 0
fi

identity="$(security find-identity -v -p codesigning 2>/dev/null |
  sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -n 1)"
if [[ -z "$identity" ]]; then
  exit 1
fi
printf '%s\n' "$identity"
