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
  1. Finds the "Developer ID Application" identity for the team release.yml
     signs as (asking which, if a renewal left several) and exports just it
     (scripts/export-signing-identity.swift, compiled to a throwaway binary)
     with a random password. macOS asks you to allow the export: enter your
     login password and click Allow, not Always Allow.
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

# The team the workflow signs as, so the two can't drift apart.
team="$(sed -n 's/^ *APPLE_TEAM_ID: *//p' "$repo_root/.github/workflows/release.yml")"
[[ -n "$team" ]] || { echo "error: no APPLE_TEAM_ID in release.yml" >&2; exit 1; }
identities="$(security find-identity -v -p codesigning | "$repo_root/scripts/find-developer-id.sh" "$team")"
if [[ -z "$identities" ]]; then
  echo "error: no valid \"Developer ID Application: … ($team)\" identity in your keychain." >&2
  exit 1
fi
# Several after a renewal: both keys stay valid (and precious), so ask.
if [[ "$(wc -l <<<"$identities")" -gt 1 ]]; then
  echo "Several Developer ID Application identities for $team:"
  nl -w2 -s') ' <<<"$identities"
  read -r -p "Which one should CI sign with? " choice
  [[ "$choice" =~ ^[1-9][0-9]*$ ]] || { echo "error: no such choice" >&2; exit 1; }
  identities="$(sed -n "${choice}p" <<<"$identities")"
  [[ -n "$identities" ]] || { echo "error: no such choice" >&2; exit 1; }
fi
sha1="${identities%% *}"

work="$(mktemp -d -t release-secrets)"
trap 'rm -f "$work/developer-id.p12" "$work/export-signing-identity"; rmdir "$work"' EXIT
# A throwaway binary asks for the key, not the shared `swift` interpreter:
# an accidental "Always Allow" then trusts nothing that outlives this run.
swiftc -suppress-warnings -O "$repo_root/scripts/export-signing-identity.swift" \
  -o "$work/export-signing-identity"
echo "Exporting ${identities#* }."
echo "macOS will ask to allow it: enter your login password and click Allow (not Always Allow)."
p12_password="$(openssl rand -base64 24)"
printf '%s\n' "$p12_password" | "$work/export-signing-identity" "$sha1" "$work/developer-id.p12"

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
  if ! gh secret set "$1" --repo "$repo" >/dev/null; then
    echo "error: couldn't set $1. The four secrets must match each other;" >&2
    echo "       releases will fail until this script runs to the end. Re-run it." >&2
    exit 1
  fi
  echo "Set $1"
}

base64 -i "$work/developer-id.p12" | set_secret APPLE_CERTIFICATE
printf '%s' "$p12_password" | set_secret APPLE_CERTIFICATE_PASSWORD
printf '%s' "$apple_id" | set_secret APPLE_ID
printf '%s' "$apple_password" | set_secret APPLE_PASSWORD
echo "Done: $repo has its release secrets."
