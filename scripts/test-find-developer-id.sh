#!/usr/bin/env bash
# ABOUTME: Tests find-developer-id.sh against canned `security find-identity`
# ABOUTME: output: team filter, duplicates collapsed, other kinds ignored.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: scripts/test-find-developer-id.sh  (run after changing find-developer-id.sh; prints PASS)"
  exit 0
fi

finder="$(cd "$(dirname "$0")" && pwd)/find-developer-id.sh"
A=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
B=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
C=CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

expect() { # description, expected output, input
  local actual
  actual="$(printf '%s\n' "$3" | "$finder" TEAM123)"
  [[ "$actual" == "$2" ]] || fail "$1: expected [$2], got [$actual]"
}

expect "one identity" "$A Developer ID Application: Jesse Vincent (TEAM123)" \
  "  1) $A \"Developer ID Application: Jesse Vincent (TEAM123)\"
  2) $B \"Apple Development: Jesse Vincent (P82MJJHK76)\"
     2 valid identities found"

# The same identity in two keychains is listed once per certificate-key pair.
expect "duplicates collapse" "$A Developer ID Application: Jesse Vincent (TEAM123)" \
  "  1) $A \"Developer ID Application: Jesse Vincent (TEAM123)\"
  2) $A \"Developer ID Application: Jesse Vincent (TEAM123)\"
  3) $A \"Developer ID Application: Jesse Vincent (TEAM123)\""

expect "other teams and kinds are ignored" "" \
  "  1) $A \"Developer ID Application: Someone Else (OTHERTEAM)\"
  2) $B \"Developer ID Installer: Jesse Vincent (TEAM123)\"
  3) $C \"Apple Distribution: Jesse Vincent (TEAM123)\""

expect "a renewal lists both" "$A Developer ID Application: Jesse Vincent (TEAM123)
$C Developer ID Application: Jesse Vincent (TEAM123)" \
  "  1) $C \"Developer ID Application: Jesse Vincent (TEAM123)\"
  2) $A \"Developer ID Application: Jesse Vincent (TEAM123)\""

echo PASS
