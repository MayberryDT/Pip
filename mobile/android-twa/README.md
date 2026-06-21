# Pip Android TWA

This shell is deprecated. See `DEPRECATED.md`; the current release Android target is `mobile/android-webview`.
The build, signing, and install notes below are historical reference only unless a separate migration plan reactivates this shell.

This is the Android Trusted Web Activity wrapper for the hosted Pip web app.

The app opens:

```txt
https://spendwithpip.com/app
```

The web app and marketing site remain one Next.js/Netlify deployment. Normal product changes should ship through the web app; a new APK is only needed when Android wrapper metadata changes, such as package identity, signing, icons, permissions, versioning, or TWA config.

## Current Identity

```txt
App name: Pip
Package name: com.spendwithpip.app
Host: spendwithpip.com
Launch URL: /app
Verified scope: https://spendwithpip.com/
Display: standalone
Orientation: portrait
Version code: 4
Version name: 4
Fallback strategy: webview
Bubblewrap CLI: 1.24.1
```

The package name and release keystore are durable. Future APK updates must use the same package name, same signing key, and a higher `versionCode`.

## Signing

The release keystore is intentionally outside the repo:

```txt
/home/tyler/.secrets/pip-android/pip-release.keystore
/home/tyler/.secrets/pip-android/keystore.env
```

The public release certificate SHA-256 fingerprint is:

```txt
E3:22:BA:05:FC:34:50:CE:30:62:7F:50:12:D0:51:34:3E:5C:0B:FF:DF:70:2A:55:E5:D5:AD:4E:B5:DA:A2:F3
```

Do not commit keystores, passwords, signed APKs, signed AABs, `.idsig` files, `local.properties`, or generated build folders.

## Digital Asset Links

The repo file is:

```txt
public/.well-known/assetlinks.json
```

That file must be deployed to production before the installed APK can verify the origin as a full TWA:

```txt
https://spendwithpip.com/.well-known/assetlinks.json
```

Production currently serves that file with the release fingerprint above, which lets Android verify the origin as a full TWA when the device accepts the relationship. The direct-share tester build also uses `webview` fallback, so if Android does not verify the TWA relationship on a sideloaded device, the app should stay inside the installed Pip shell instead of opening Chrome/browser.

## Build A Signed APK

From this directory:

```bash
cd "$(git rev-parse --show-toplevel)/mobile/android-twa"
source /home/tyler/.secrets/pip-android/keystore.env
export BUBBLEWRAP_KEYSTORE_PASSWORD="$PIP_ANDROID_KEYSTORE_PASSWORD"
export BUBBLEWRAP_KEY_PASSWORD="$PIP_ANDROID_KEY_PASSWORD"
npx --yes @bubblewrap/cli build --manifest=twa-manifest.json
```

Current generated artifacts:

```txt
APK: mobile/android-twa/app-release-signed.apk
AAB: mobile/android-twa/app-release-bundle.aab
```

The APK is the file to send directly to private testers. The AAB is for a future Play Console / internal testing path.

Current APK SHA-256:

```txt
abf93d59e0f272242d83e836711351fa5b51e312ddc7a774d22b8d812da95ff2
```

## Local Install Smoke Test

With an Android device connected and USB debugging enabled:

```bash
adb devices -l
adb install -r "$(git rev-parse --show-toplevel)/mobile/android-twa/app-release-signed.apk"
adb shell monkey -p com.spendwithpip.app 1
```

For update-over-install proof, build a later APK with a higher `versionCode`, then run:

```bash
adb install -r "$(git rev-parse --show-toplevel)/mobile/android-twa/app-release-signed.apk"
```

Expected behavior:

```txt
Success
Pip opens https://spendwithpip.com/app inside the installed app shell.
```

## Verification Commands

```bash
npm run test
npm run build
npm run check:netlify-bundle
npm run start
npm run eval:agent

/home/tyler/.bubblewrap/android_sdk/build-tools/34.0.0/apksigner verify --verbose --print-certs mobile/android-twa/app-release-signed.apk
/home/tyler/.bubblewrap/android_sdk/build-tools/34.0.0/aapt dump badging mobile/android-twa/app-release-signed.apk
/home/tyler/.bubblewrap/android_sdk/build-tools/34.0.0/aapt dump permissions mobile/android-twa/app-release-signed.apk
```

Proof for the first local build is recorded at:

```txt
/tmp/pip-android-apk-proof.json
```
