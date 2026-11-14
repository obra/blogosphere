#!/usr/bin/env bash
# ABOUTME: Builds an ad-hoc .ipa for a fixed list of registered device UDIDs and
# ABOUTME: assembles a tap-to-install page that serves it over HTTPS.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/adhoc-ios.sh [--devices <file>] [--out <dir>] [--build-number <n>] [--no-build]

Builds an ad-hoc iOS .ipa for the devices in the device list and writes a
ready-to-serve download site next to it.

  --devices <file>        UDID list. Default: ios-devices.txt.
  --out <dir>             Output directory. Default: dist-ios-adhoc.
  --build-number <n>      CFBundleVersion. Default: the git commit count.
  --no-build              Skip the archive/export and only rebuild the site
                          from the .ipa already in the output directory.

What it does:
  1. Registers every UDID in the device list with the Apple Developer portal
     and mints (or refreshes) an ad-hoc provisioning profile for
     com.fsck.blogosphere, with `fastlane register_devices` and `fastlane sigh`.
     Re-run this after adding a device: a profile only covers the devices that
     were registered when it was created.
  2. Archives and exports an ad-hoc .ipa with method `release-testing`, which
     is Xcode 27's name for what used to be called ad-hoc.
  3. Writes manifest.plist and index.html next to the .ipa. The index page
     carries the itms-services:// link iOS needs; a plain link to the .ipa
     will not install.

Signing needs an unlocked login keychain, so run this from a Terminal on the
Mac that holds the certificates, not over ssh.

Serving: the page has to be HTTPS, and the .ipa and manifest must be reachable
at the URLs written into manifest.plist. The script does not serve anything.
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

devices_file="ios-devices.txt"
out_dir="dist-ios-adhoc"
build_number=""
do_build=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --devices) devices_file="${2:?--devices needs a file}"; shift 2 ;;
    --out) out_dir="${2:?--out needs a directory}"; shift 2 ;;
    --build-number) build_number="${2:?--build-number needs a value}"; shift 2 ;;
    --no-build) do_build=0; shift ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

team_id="$(node -p "require('./src-tauri/tauri.conf.json').bundle.iOS.developmentTeam")"
bundle_id="$(node -p "require('./src-tauri/tauri.conf.json').identifier")"
app_version="$(node -p "require('./src-tauri/tauri.conf.json').version")"
app_name="$(node -p "require('./src-tauri/tauri.conf.json').productName")"

mkdir -p "$out_dir"

# With --no-build the .ipa already in the output directory is the source of
# truth for the build number; a git-derived number would mislabel it.
if [[ -z "$build_number" && "$do_build" -eq 0 ]]; then
  shopt -s nullglob
  existing=( "$out_dir/$app_name-$app_version-"*.ipa )
  if [[ ${#existing[@]} -eq 1 ]]; then
    build_number="$(basename "${existing[0]}" .ipa)"
    build_number="${build_number##*-}"
  fi
fi
[[ -n "$build_number" ]] || build_number="$(git rev-list --count HEAD)"

if [[ "$do_build" -eq 1 ]]; then
  if [[ ! -f "$devices_file" ]]; then
    echo "error: no device list at $devices_file." >&2
    echo "Make one from the UDIDs you collected; see docs/tooling.md › iOS ad-hoc builds." >&2
    exit 1
  fi

  # A profile only covers devices registered at creation time, so register
  # first and mint the profile second, every run.
  echo "==> Registering devices from $devices_file"
  fastlane run register_devices \
    devices_file:"$devices_file" \
    username:"${APPLE_ID:?set APPLE_ID}" \
    team_id:"$team_id"

  # `sigh` needs an App ID to hang the profile on, and there is no way to ask
  # it to make one. `produce` is idempotent: it reports the existing App ID and
  # changes nothing when it is already there.
  echo "==> Ensuring the App ID exists"
  fastlane produce \
    -a "$bundle_id" \
    --app_name "$app_name" \
    -u "${APPLE_ID:?set APPLE_ID}" \
    --team_id "$team_id" \
    --skip_itc

  echo "==> Minting the ad-hoc provisioning profile"
  profile_dir="$out_dir/profile"
  mkdir -p "$profile_dir"
  fastlane sigh \
    --adhoc true \
    --app_identifier "$bundle_id" \
    --username "${APPLE_ID:?set APPLE_ID}" \
    --team_id "$team_id" \
    --provisioning_name "$app_name Ad Hoc" \
    --filename "$app_name-AdHoc.mobileprovision" \
    --output_path "$profile_dir" \
    --skip_install true

  profile_uuid="$(security cms -D -i "$profile_dir/$app_name-AdHoc.mobileprovision" \
    | plutil -extract UUID raw -)"
  signing_certificate="$(security find-identity -v -p codesigning \
    | sed -n "s/.*\([0-9A-F]\{40\}\) \"Apple Distribution: .*($team_id)\"/\1/p" \
    | head -1)"
  [[ -n "$signing_certificate" ]] || {
    echo "error: no \"Apple Distribution\" identity for team $team_id in the keychain." >&2
    exit 1
  }

  # ad-hoc's name changed to release-testing in Xcode 27; the old name is
  # rejected. Manual signing with an explicit profile because automatic
  # signing wants an Xcode account and fails over a bare command line.
  export_options="$out_dir/ExportOptions.plist"
  cat >"$export_options" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>release-testing</string>
	<key>destination</key>
	<string>export</string>
	<key>teamID</key>
	<string>$team_id</string>
	<key>signingStyle</key>
	<string>manual</string>
	<key>signingCertificate</key>
	<string>$signing_certificate</string>
	<key>provisioningProfiles</key>
	<dict>
		<key>$bundle_id</key>
		<string>$profile_uuid</string>
	</dict>
	<key>thinning</key>
	<string>&lt;none&gt;</string>
	<key>stripSwiftSymbols</key>
	<true/>
</dict>
</plist>
PLIST

  archive_path="$PWD/$out_dir/$app_name.xcarchive"
  export_path="$PWD/$out_dir/export"
  rm -rf "$archive_path" "$export_path"

  echo "==> Archiving"
  ( cd src-tauri/gen/apple
    xcodebuild archive \
      -project app.xcodeproj \
      -scheme app_iOS \
      -configuration Release \
      -destination 'generic/platform=iOS' \
      -archivePath "$archive_path" \
      -allowProvisioningUpdates \
      DEVELOPMENT_TEAM="$team_id"
  )

  echo "==> Exporting the .ipa"
  xcodebuild -exportArchive \
    -archivePath "$archive_path" \
    -exportOptionsPlist "$export_options" \
    -exportPath "$export_path"

  shopt -s failglob
  ipa=( "$export_path"/*.ipa )
  cp "${ipa[0]}" "$out_dir/$app_name-$app_version-$build_number.ipa"
fi

shopt -s failglob
ipa=( "$out_dir"/*.ipa )
ipa_name="$(basename "${ipa[0]}")"

# The device compares the manifest's bundle-version with the app's
# CFBundleVersion, which Xcode composes from the version and build number
# (0.1.0 plus build 1 becomes 0.1.0.1). Read it from the app instead of
# reconstructing it.
unpacked="$(mktemp -d)"
trap 'rm -rf "$unpacked"' EXIT
unzip -q "${ipa[0]}" -d "$unpacked"
app_bundle="$(find "$unpacked/Payload" -maxdepth 1 -name '*.app' -print -quit)"
bundle_version="$(plutil -extract CFBundleVersion raw "$app_bundle/Info.plist")"

# The device installs whatever this manifest points at, so the URLs have to be
# the public HTTPS ones, not local paths.
base_url="${ADHOC_BASE_URL:?set ADHOC_BASE_URL to the HTTPS URL of $out_dir, with no trailing slash}"
cat >"$out_dir/manifest.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>items</key>
	<array>
		<dict>
			<key>assets</key>
			<array>
				<dict>
					<key>kind</key>
					<string>software-package</string>
					<key>url</key>
					<string>$base_url/$ipa_name</string>
				</dict>
			</array>
			<key>metadata</key>
			<dict>
				<key>bundle-identifier</key>
				<string>$bundle_id</string>
				<key>bundle-version</key>
				<string>$bundle_version</string>
				<key>kind</key>
				<string>software</string>
				<key>title</key>
				<string>$app_name</string>
			</dict>
		</dict>
	</array>
</dict>
</plist>
PLIST

# Apple requires the install link to go through the manifest, and a plain .ipa
# link silently does nothing.
cat >"$out_dir/index.html" <<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Install $app_name</title>
<style>
  body { font: 17px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 48px 24px; max-width: 480px; margin-inline: auto; }
  h1 { font-size: 30px; letter-spacing: -.03em; margin: 0 0 8px; }
  p { color: #555; }
  .install { display: block; margin: 28px 0; padding: 16px 20px; border-radius: 14px; background: #1c643a; color: #fff; font-size: 18px; font-weight: 600; text-align: center; text-decoration: none; }
  @media (prefers-color-scheme: dark) { body { background: #111914; color: #edf5ef; } p { color: #a5b8aa; } }
</style>
</head>
<body>
<h1>$app_name</h1>
<p>Version $app_version, build $bundle_version</p>
<a class="install" href="itms-services://?action=download-manifest&amp;url=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$base_url/manifest.plist")">Install on this device</a>
<ol>
  <li>Open this page in Safari on the device.</li>
  <li>Tap Install and confirm the prompt.</li>
  <li>Open $app_name from the Home Screen.</li>
</ol>
<p>This build runs only on devices whose UDID is in the profile.</p>
</body>
</html>
HTML

echo
echo "Wrote $out_dir/$ipa_name, $out_dir/manifest.plist and $out_dir/index.html."
echo "Serve $out_dir over HTTPS at $base_url, then open $base_url/ in Safari on a registered device."
