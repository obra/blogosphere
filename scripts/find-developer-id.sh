#!/usr/bin/env bash
# ABOUTME: Filters `security find-identity -v -p codesigning` output (stdin) to
# ABOUTME: one team's Developer ID Application identities: "SHA-1 name" lines.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -ne 1 ]]; then
  cat <<'EOF'
Usage: security find-identity -v -p codesigning | scripts/find-developer-id.sh <team id>

Prints each distinct "Developer ID Application: … (<team id>)" identity as
"<SHA-1> <name>", sorted, one per line; prints nothing when there are none.
Duplicates collapse: an identity in two keychains is listed several times by
`security`. Used by set-release-secrets.sh; tested by test-find-developer-id.sh.
EOF
  [[ $# -eq 1 ]] && exit 0
  exit 2
fi

team="$1"
sed -n "s/^ *[0-9][0-9]*) \([0-9A-F]\{40\}\) \"\(Developer ID Application: .* ($team)\)\"\$/\1 \2/p" |
  sort -u
