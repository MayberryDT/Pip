# Pip Android Native WebView Shell

This is the replacement tester APK path for Pip. It is a native Android app shell, not a TWA/Bubblewrap wrapper.

The app launches:

```txt
https://spendwithpip.com/app
```

inside `com.spendwithpip.app.MainActivity` using an app-owned Android `WebView`.

The APK is intentionally small because it does not bundle Chromium, the web app, or a JavaScript runtime. Android provides the system WebView. The proof that this is not the failed TWA path is the launchable native `MainActivity`, the `android.webkit.WebView` implementation in `classes.dex`, and the absence of Android Browser Helper / Trusted Web Activity dependencies.

## Identity

```txt
App name: Pip
Package name: com.spendwithpip.app
Version code: 11
Version name: 0.1.0-native-shell.2
Launch URL: https://spendwithpip.com/app
APK: mobile/android-webview/artifacts/pip-android-v11.apk
APK size: 229,828 bytes
APK SHA-256: 0975827de18c62264f595d46b29e3c9f67677f8870eb6e7190bdf35d9be88990
```

The version code is intentionally higher than the deprecated TWA build's version code `4` so Android can update over the old app if the signing certificate matches.

## Signing

Use the existing Pip release key:

```txt
/home/tyler/.secrets/pip-android/pip-release.keystore
alias: pip-release
```

Do not commit keystores, passwords, APKs, AABs, `.idsig` files, `local.properties` with secrets, or generated build folders.

## Build

```bash
cd /home/tyler/Documents/FreeCash/mobile/android-webview
set -a
source /home/tyler/.secrets/pip-android/keystore.env
set +a
export JAVA_HOME=/home/tyler/.bubblewrap/jdk/jdk-17.0.11+9
export PATH="$JAVA_HOME/bin:$PATH"
./gradlew assembleRelease
```

The signed release APK is generated at:

```txt
mobile/android-webview/app/build/outputs/apk/release/app-release.apk
```

Release copies for testers should be written under:

```txt
mobile/android-webview/artifacts/
```

## Verify

```bash
/home/tyler/.bubblewrap/android_sdk/build-tools/35.0.0/aapt dump badging mobile/android-webview/artifacts/pip-android-v11.apk
/home/tyler/.bubblewrap/android_sdk/build-tools/35.0.0/aapt dump permissions mobile/android-webview/artifacts/pip-android-v11.apk
/home/tyler/.bubblewrap/android_sdk/build-tools/35.0.0/apksigner verify --verbose --print-certs mobile/android-webview/artifacts/pip-android-v11.apk
sha256sum mobile/android-webview/artifacts/pip-android-v11.apk
unzip -p mobile/android-webview/artifacts/pip-android-v11.apk classes.dex | strings | rg -i "PipNativeShell|PipAndroid/1|android/webkit|androidbrowserhelper|trustedwebactivity|customtabs"
```

Expected static proof for `pip-android-v11.apk`:

```txt
package: com.spendwithpip.app
versionCode: 11
versionName: 0.1.0-native-shell.2
launchable activity: com.spendwithpip.app.MainActivity
permissions: INTERNET, ACCESS_NETWORK_STATE
signature: verifies with APK Signature Scheme v2
certificate SHA-256: e322ba05fc3450ce30627f5012d051343e5c0bffdf702a55e5d5ad4eb5daa2f3
application icon: adaptive XML resource backed by existing Pip launcher and maskable assets
classes.dex includes: MainActivity, PipNativeShell, PipAndroid/1, https://spendwithpip.com/app
classes.dex does not include: androidbrowserhelper, trustedwebactivity, customtabs
```

## Device Smoke

```bash
adb install -r /home/tyler/Documents/FreeCash/mobile/android-webview/artifacts/pip-android-v11.apk
adb shell monkey -p com.spendwithpip.app 1
adb shell dumpsys activity activities | rg "mResumedActivity|topResumedActivity|com.spendwithpip.app|com.android.chrome"
adb logcat -d | rg "PipNativeShell"
```

Normal launcher start must foreground `com.spendwithpip.app`, not Chrome.

If a phone still opens Chrome after installing this artifact, collect these outputs from that phone before changing code:

```bash
adb shell pm path com.spendwithpip.app
adb shell dumpsys package com.spendwithpip.app | rg "versionCode|versionName|signatures|MainActivity"
adb shell monkey -p com.spendwithpip.app 1
adb shell dumpsys activity activities | rg "mResumedActivity|topResumedActivity|com.spendwithpip.app|com.android.chrome"
adb logcat -d | rg "PipNativeShell|ActivityTaskManager|com.spendwithpip.app|com.android.chrome"
```

No physical Android device was attached in this Codex session, so the foreground-package smoke remains the one manual gate before sending this APK broadly.

## Web Dogfood

Current verification for the web app that this shell publishes:

```txt
npm run test: 613 passed, 1 skipped
npm run build: passed
npm run check:netlify-bundle: passed
Codex in-app Browser at 390x844: guest onboarding omits the Spendable Cash metric, has no horizontal overflow, and keeps the input visible.
```
