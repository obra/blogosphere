#!/usr/bin/env bash
# ABOUTME: Stores the signing and notarization secrets the Release workflow
# ABOUTME: needs in the GitHub repo, prompting so values never hit history.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/set-release-secrets.sh <developer-id.p12>

Sets the four GitHub Actions secrets .github/workflows/release.yml reads:

  APPLE_CERTIFICATE           the .p12, base64-encoded
  APPLE_CERTIFICATE_PASSWORD  the password you gave the .p12 on export
  APPLE_ID                    your Apple account email
  APPLE_PASSWORD              an app-specific password (account.apple.com ›
                              Sign-In and Security › App-Specific Passwords)

Export the .p12 first: Keychain Access › login › My Certificates, right-click
"Developer ID Application: Jesse Vincent (87WJ58S66M)" › Export…, choose
Personal Information Exchange (.p12), and set a password. Delete the file
once this script has run.

Passwords are read without echo and piped straight to `gh secret set`; they
never appear in shell history or the process list. Needs `gh auth login`
with access to the repo. Re-run any time to replace the secrets.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

p12="$1"
if [[ ! -f "$p12" ]]; then
  echo "error: no such file: $p12" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh isn't signed in; run 'gh auth login' first." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(gh repo view "$(git -C "$repo_root" remote get-url origin)" --json nameWithOwner -q .nameWithOwner)"

read -r -s -p "Password for $(basename "$p12"): " p12_password
echo
read -r -p "Apple ID email: " apple_id
read -r -s -p "App-specific password: " apple_password
echo
if [[ -z "$p12_password" || -z "$apple_id" || -z "$apple_password" ]]; then
  echo "error: every value is required; nothing was set." >&2
  exit 1
fi

set_secret() {
  gh secret set "$1" --repo "$repo" >/dev/null
  echo "Set $1"
}

base64 -i "$p12" | set_secret APPLE_CERTIFICATE
printf '%s' "$p12_password" | set_secret APPLE_CERTIFICATE_PASSWORD
printf '%s' "$apple_id" | set_secret APPLE_ID
printf '%s' "$apple_password" | set_secret APPLE_PASSWORD
echo "Done: $repo has its release secrets. Remove $p12 now."
