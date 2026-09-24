#!/usr/bin/env bash
# ABOUTME: Sets one new Apple app-specific password on every GitHub secret
# ABOUTME: (repo and org) that notarizes with one, after Apple revokes them.
set -euo pipefail

# Each line: repo OWNER/NAME SECRET, or org ORG SECRET. Found by auditing the
# obra and prime-radiant-inc accounts (2026-09-24); add new notarizing repos here.
TARGETS="
repo obra/blogosphere APPLE_PASSWORD
repo obra/iMessagePrinter APPLE_ID_PASSWORD
repo obra/winby APPLE_ID_PASSWORD
repo obra/ScreenshotForChat APPLE_ID_PASSWORD
org prime-radiant-inc APPLE_APP_SPECIFIC_PASSWORD
repo prime-radiant-inc/teststrip APPLE_APP_SPECIFIC_PASSWORD
repo prime-radiant-inc/clipfan APPLE_APP_SPECIFIC_PASSWORD
repo prime-radiant-inc/clearance APPLE_APP_SPECIFIC_PASSWORD
"

usage() {
  cat <<'EOF'
Usage: scripts/rotate-apple-app-password.sh [--dry-run]

When Apple revokes your app-specific passwords, make one new one at
account.apple.com (Sign-In and Security › App-Specific Passwords) and run
this. It asks for it once, without echoing, and sets it on every secret in
TARGETS (top of this file): repo secrets and org secrets, keeping each org
secret's visibility. The value only ever goes to `gh secret set` on stdin.

Before asking, it checks every target exists (a renamed secret or repo
fails here, not halfway through). --dry-run stops after that check.
Afterwards it prints each secret's new update time.

Needs `gh auth login` with admin on the repos and the org.
EOF
}

dry_run=false
case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
  --dry-run) dry_run=true ;;
  "") ;;
  *)
    echo "error: unknown argument: $1" >&2
    usage >&2
    exit 2
    ;;
esac

# Prints "<visibility> <updated_at>" for an org secret, or "- <updated_at>".
describe() { # kind where secret
  if [[ "$1" == org ]]; then
    gh api "orgs/$2/actions/secrets/$3" -q '"\(.visibility) \(.updated_at)"'
  else
    gh api "repos/$2/actions/secrets/$3" -q '"- \(.updated_at)"'
  fi
}

echo "Checking targets..."
problems=0
while read -r kind where secret; do
  [[ -z "$kind" ]] && continue
  if ! info="$(describe "$kind" "$where" "$secret" 2>/dev/null)"; then
    echo "  MISSING  $kind $where $secret" >&2
    problems=$((problems + 1))
    continue
  fi
  visibility="${info%% *}"
  if [[ "$kind" == org && "$visibility" == selected ]]; then
    echo "  UNSUPPORTED  $where $secret has 'selected' visibility; set it by hand" >&2
    problems=$((problems + 1))
    continue
  fi
  echo "  ok  $kind $where $secret (updated ${info#* })"
done <<<"$TARGETS"
if ((problems > 0)); then
  echo "error: $problems target(s) need fixing in TARGETS; nothing was set." >&2
  exit 1
fi
if $dry_run; then
  exit 0
fi

read -r -s -p "New app-specific password: " password
echo
if [[ -z "$password" ]]; then
  echo "error: empty password; nothing was set." >&2
  exit 1
fi

failed=0
while read -r kind where secret; do
  [[ -z "$kind" ]] && continue
  if [[ "$kind" == org ]]; then
    visibility="$(describe org "$where" "$secret")"
    visibility="${visibility%% *}"
    set_args=(--org "$where" --visibility "$visibility")
  else
    set_args=(--repo "$where")
  fi
  if printf '%s' "$password" | gh secret set "$secret" "${set_args[@]}" >/dev/null; then
    echo "  set  $kind $where $secret (now $(describe "$kind" "$where" "$secret"))"
  else
    echo "  FAILED  $kind $where $secret" >&2
    failed=$((failed + 1))
  fi
done <<<"$TARGETS"
if ((failed > 0)); then
  echo "error: $failed secret(s) weren't set; re-run to retry (it sets all again)." >&2
  exit 1
fi
echo "Done."
