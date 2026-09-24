#!/usr/bin/env bash
# ABOUTME: End-to-end test for export-signing-identity.swift: exports one
# ABOUTME: throwaway identity from a scratch keychain and re-imports the .p12.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: scripts/test-export-signing-identity.sh

Run after changing scripts/export-signing-identity.swift. It never touches
your real keychains: it makes two scratch keychains (not added to your
search list), puts two self-signed identities in the first, exports one of
them by SHA-1 with a passphrase read from stdin, imports the .p12 into the
second keychain the way the Tauri bundler does (`security import -P`), and
checks that exactly that identity arrived. Prints PASS or the failing step.
EOF
  exit 0
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d -t export-identity-test)"
source_kc="$work/source.keychain-db"
dest_kc="$work/dest.keychain-db"
search_list_before="$(security list-keychains -d user)"

cleanup() {
  security delete-keychain "$source_kc" 2>/dev/null || true
  security delete-keychain "$dest_kc" 2>/dev/null || true
  rm -f "$work"/*.pem "$work"/*.p12 "$work"/err.txt
  rmdir "$work" 2>/dev/null || true
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

make_identity() { # name
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=$1" \
    -keyout "$work/$1.key.pem" -out "$work/$1.cert.pem" 2>/dev/null
  openssl pkcs12 -export -passout pass:scratch -name "$1" \
    -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
    -inkey "$work/$1.key.pem" -in "$work/$1.cert.pem" -out "$work/$1.p12"
  security import "$work/$1.p12" -k "$source_kc" -P scratch -A >/dev/null
}

sha1_of() { # cert.pem
  openssl x509 -in "$1" -noout -fingerprint -sha1 | sed 's/.*=//; s/://g'
}

security create-keychain -p scratch "$source_kc"
security create-keychain -p scratch "$dest_kc"
security unlock-keychain -p scratch "$source_kc"
security unlock-keychain -p scratch "$dest_kc"
make_identity "Export Test Wanted"
make_identity "Export Test Other"
wanted="$(sha1_of "$work/Export Test Wanted.cert.pem")"

passphrase="$(openssl rand -base64 24)"
printf '%s\n' "$passphrase" |
  swift -suppress-warnings "$repo_root/scripts/export-signing-identity.swift" "$wanted" "$work/out.p12" "$source_kc" ||
  fail "export exited non-zero"
[[ -s "$work/out.p12" ]] || fail "no .p12 written"
[[ "$(stat -f %Lp "$work/out.p12")" == "600" ]] || fail ".p12 isn't mode 600"

# The same trip CI makes: base64 (the secret), decoded, then Tauri's import.
base64 -i "$work/out.p12" | base64 -D -o "$work/roundtrip.p12"
security import "$work/roundtrip.p12" -k "$dest_kc" -P "$passphrase" -T /usr/bin/codesign >/dev/null ||
  fail "the .p12 doesn't import with the passphrase"
identities="$(security find-identity "$dest_kc")"
grep -q "$wanted" <<<"$identities" || fail "the wanted identity didn't arrive"
grep -q "Export Test Other" <<<"$identities" && fail "the other identity was exported too"

# A missing identity must fail loudly, not write an empty file.
if printf '%s\n' "$passphrase" |
  swift -suppress-warnings "$repo_root/scripts/export-signing-identity.swift" "0000000000000000000000000000000000000000" "$work/none.p12" "$source_kc" 2>/dev/null; then
  fail "exporting an unknown identity succeeded"
fi
[[ ! -e "$work/none.p12" ]] || fail "an unknown identity still wrote a file"
if printf '%s\n' "$passphrase" |
  swift -suppress-warnings "$repo_root/scripts/export-signing-identity.swift" "$wanted" "$work/none.p12" "$work/missing.keychain-db" 2>"$work/err.txt"; then
  fail "a missing keychain succeeded"
fi
grep -q "no such keychain" "$work/err.txt" || fail "a missing keychain gave: $(cat "$work/err.txt")"

[[ "$(security list-keychains -d user)" == "$search_list_before" ]] ||
  fail "your keychain search list changed"
echo PASS
