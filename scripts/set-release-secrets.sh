#!/usr/bin/env bash
# ABOUTME: Stores the signing and notarization secrets the Release workflow
# ABOUTME: needs in the GitHub repo; exports the Developer ID cert itself.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/set-release-secrets.sh

Sets the four GitHub Actions secrets .github/workflows/release.yml reads:

  APPLE_CERTIFICATE           your Developer ID Application certificate and
                              its private key, as a base64 .p12
  APPLE_CERTIFICATE_PASSWORD  a random password this script makes for that .p12
  APPLE_ID                    your Apple account email
  APPLE_PASSWORD              an app-specific password

What happens:
  1. Finds the one "Developer ID Application" identity in your keychain and
     exports just it (scripts/export-signing-identity.swift) with a random
     password. macOS asks you to allow the export: enter your login password
     in that dialog and choose Allow.
  2. Opens account.apple.com so you can make an app-specific password
     (Sign-In and Security › App-Specific Passwords), then asks for your
     Apple ID email and that password, without echoing it.
  3. Pipes every value to `gh secret set`; the .p12 lives in a private temp
     directory and is deleted on exit. No value appears in shell history or
     the process list.

Needs `gh auth login` with access to the repo. Re-run any time to replace
the secrets (e.g. after renewing the certificate).
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

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh isn't signed in; run 'gh auth login' first." >&2
  exit 1
fi
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(gh repo view "$(git -C "$repo_root" remote get-url origin)" --json nameWithOwner -q .nameWithOwner)"

# The SHA-1, not the name: codesign and SecItem lookups are unambiguous by hash.
identities="$(security find-identity -v -p codesigning |
  sed -n 's/^ *[0-9][0-9]*) \([0-9A-F]\{40\}\) "\(Developer ID Application: .*\)"$/\1 \2/p')"
case "$(grep -c . <<<"$identities" || true)" in
  1) ;;
  0)
    echo "error: no valid \"Developer ID Application\" identity in your keychain." >&2
    exit 1
    ;;
  *)
    echo "error: more than one \"Developer ID Application\" identity; delete the old one:" >&2
    echo "$identities" >&2
    exit 1
    ;;
esac
sha1="${identities%% *}"
echo "Exporting ${identities#* } — allow it in the macOS dialog."

work="$(mktemp -d -t release-secrets)"
trap 'rm -f "$work/developer-id.p12"; rmdir "$work"' EXIT
p12_password="$(openssl rand -base64 24)"
printf '%s\n' "$p12_password" |
  swift -suppress-warnings "$repo_root/scripts/export-signing-identity.swift" "$sha1" "$work/developer-id.p12"

open "https://account.apple.com/account/manage"
echo "Make an app-specific password in the browser (Sign-In and Security › App-Specific Passwords)."
read -r -p "Apple ID email: " apple_id
read -r -s -p "App-specific password: " apple_password
echo
if [[ -z "$apple_id" || -z "$apple_password" ]]; then
  echo "error: both values are required; nothing was set." >&2
  exit 1
fi

set_secret() {
  gh secret set "$1" --repo "$repo" >/dev/null
  echo "Set $1"
}

base64 -i "$work/developer-id.p12" | set_secret APPLE_CERTIFICATE
printf '%s' "$p12_password" | set_secret APPLE_CERTIFICATE_PASSWORD
printf '%s' "$apple_id" | set_secret APPLE_ID
printf '%s' "$apple_password" | set_secret APPLE_PASSWORD
echo "Done: $repo has its release secrets."
