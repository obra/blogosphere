# Installing Blogosphere on your iPhone

This is an ad-hoc build: a copy of Blogosphere signed by Jesse for a fixed list of
iPhones. It is not from the App Store and Apple has not reviewed it.

**Open this page on the iPhone, in Safari, with Tailscale connected:**
https://m5max.trout-rigel.ts.net/

## Install

1. Connect the iPhone to the Tailscale network. The install link only works inside it.
2. Open https://m5max.trout-rigel.ts.net/ in **Safari**. Other browsers handle the
   install link badly or not at all.
3. Tap **Install on this device**, then **Install** again in the prompt.
4. Go to the Home Screen. Blogosphere appears there.

If the page loads but tapping Install does nothing, the phone is not on Tailscale, or
the page was opened outside Safari.

## What this does to your phone

- Your device's UDID (a permanent serial number for the hardware) is registered with
  Apple's developer portal and kept in the build's device list. It cannot be reset or
  changed. It is not published anywhere.
- The app is signed with a provisioning profile that names your device. That profile
  lives inside the app bundle, not in Settings, and it is what allows iOS to run an
  app from outside the App Store.
- Nothing else is installed. This is not MDM, not supervision, and not a device
  management enrollment. It cannot wipe the phone, change settings, or read data
  belonging to other apps. Deleting the app removes all of it.

## When it stops working

The signing profile expires on **2027-10-29**. On that date Blogosphere stops
launching, with no advance warning beyond this paragraph. A new build has to be signed
and installed to keep using it.

The build also stops working if the profile is revoked, or if the phone is removed
from the device list. Either way the fix is the same: a fresh build and a fresh install.

## Removing it

Delete Blogosphere from the Home Screen like any other app. That removes the app and
the provisioning profile embedded in it; there is no separate profile to remove.

If you installed the UDID collection profile at any point, that one does appear in
**Settings → General → VPN & Device Management**. Delete it from there.

## The details

Apple lets a developer sign an app for up to 100 registered devices per product family
per year, outside the App Store. The signature is a provisioning profile that names
each device by UDID. iOS checks that your device's UDID is in the profile before it
will launch the app, which is why the install only works on listed phones and why
adding a phone means rebuilding.

The build is signed with an Apple Distribution certificate for team
`87WJ58S66M` and carries `get-task-allow = false`, so it is not debuggable and does
not need a development Mac attached.

## Current build

| | |
|---|---|
| Version | 0.1.0, build 0.1.0.3 |
| Device | Jesse iPhone Duo (`00008160-000E68263A58000A`) |
| Profile expires | 2027-10-29 |
| Served from | `m5max.trout-rigel.ts.net`, port 8088 behind `tailscale serve` |

Nobody has tapped Install on a physical device yet, so the on-device flow above is
unverified. The three files behind the link are confirmed reachable over HTTPS and the
`.ipa` passes `codesign --verify --deep --strict`.
