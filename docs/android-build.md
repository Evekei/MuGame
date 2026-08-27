# Android Build

This stage builds only the Android package. Do not run `cap sync ios` unless a shared-layer bug requires it.

## Environment

- OS used for this build: Windows 10.0.26200
- JDK used for this build: Microsoft OpenJDK 21.0.12.1
- Android SDK tools used for device checks: adb 37.0.1
- Android compile SDK: 36
- Android target SDK: 36
- Android min SDK: 24
- Connected smoke-test device detected: Huawei P40 / `ANA_AN00`

## App Identity

- Capacitor appId: `com.mugame.mobile`
- Android applicationId: `com.mugame.mobile`
- App name: `MuGame`
- versionName: `0.1.0`
- versionCode: `1`
- Icon: existing `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round`
- Splash: existing `res/drawable*/splash.png`
- Capacitor Android local app scheme: `http`

## API URL

Production Android builds must not embed `localhost`, `127.0.0.1`, `0.0.0.0`, or `::1` in `NEXT_PUBLIC_API_BASE_URL`.

For release builds, use an HTTPS API URL reachable by the phone:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "https://your-railway-domain.up.railway.app"
pnpm --dir apps/mobile build
pnpm --dir apps/mobile exec cap sync android
```

For a debug APK smoke test against a laptop API on the same Wi-Fi, use the laptop LAN address instead of localhost:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://192.168.0.102:8000"
pnpm --dir apps/mobile build
Set-Location apps/mobile
npx cap sync android
Set-Location ../..
```

Before handing off a build, verify the static output does not contain localhost:

```powershell
rg "localhost|127\.0\.0\.1|0\.0\.0\.0|::1" apps/mobile/out
```

## Android Network Configuration

The manifest includes:

- `android.permission.INTERNET`
- `android.permission.SYSTEM_ALERT_WINDOW`
- NetEase package/query declarations for `com.netease.cloudmusic`, `https://music.163.com`, and `orpheus://`
- `android:usesCleartextTraffic="false"` on the main application

Release builds should use HTTPS API URLs. The Capacitor local app scheme stays `http` so LAN HTTP debug APIs are not blocked by WebView mixed-content rules; this does not make release HTTP APIs acceptable.

For a complete APK that does not depend on a computer API, deploy `services/api` to an HTTPS endpoint first, then build the APK with that endpoint. See `docs/production-release.md`.

## Debug APK

Build:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://192.168.0.102:8000"
pnpm --dir apps/mobile test
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile lint
pnpm --dir apps/mobile build
Set-Location apps/mobile
npx cap sync android
Set-Location android
.\gradlew.bat :app:assembleDebug
Set-Location ../../..
```

Output:

```text
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Install and launch:

```powershell
adb devices -l
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p com.mugame.mobile 1
```

## Release Signing

Signing keys must never be committed to Git. The repository ignores `*.jks`, `*.keystore`, and `keystore.properties`.

Create a local keystore outside the repository or in an ignored path:

```powershell
keytool -genkeypair `
  -v `
  -keystore "$env:USERPROFILE\.mugame\release.jks" `
  -alias mugame `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

Set signing environment variables:

```powershell
$env:MUGAME_ANDROID_KEYSTORE_FILE = "$env:USERPROFILE\.mugame\release.jks"
$env:MUGAME_ANDROID_KEYSTORE_PASSWORD = "<store-password>"
$env:MUGAME_ANDROID_KEY_ALIAS = "mugame"
$env:MUGAME_ANDROID_KEY_PASSWORD = "<key-password>"
```

Build release:

```powershell
.\scripts\build-android-release.ps1 -ApiBaseUrl "https://your-railway-domain.up.railway.app"
```

Release output:

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

If signing environment variables are missing, Gradle can still assemble an unsigned release APK for inspection, but that APK is not suitable for distribution.

## Smoke Test Checklist

Run this on a physical Android device after installing the debug APK:

1. Open MuGame.
2. Open the NetEase account entry and verify login state.
3. Import two playlist links.
4. Confirm the playlists and build the temporary playlist.
5. Tap Play and verify NetEase opens the temporary playlist and starts playback.
6. Verify the song detail/lyrics page opens.
7. Use the floating window Check and Hide actions.
8. Open statistics from MuGame and from the floating window.
9. Verify analytics cards load or show partial/running states without blanking the page.

## Smoke Test Result For This Build

- Device: Huawei P40 / `ANA_AN00`
- API used for debug smoke: `http://192.168.0.102:8000`
- Result:
  - Login state visible as `kei_36`.
  - Playlist preview recognized multiple NetEase playlists.
  - Import produced a ready temporary playlist with 135 playable tracks.
  - NetEase opened the MuGame temporary playlist and started playback.
  - NetEase song detail and lyrics views opened.
  - Floating Check displayed the current song source.
  - Floating statistics stayed over NetEase instead of switching foreground back to MuGame.
- Smoke screenshots are under `apps/mobile/android/app/build/outputs/apk/debug/p40-smoke-*.png`.

## Common Issues

- API request failed on device: confirm `NEXT_PUBLIC_API_BASE_URL` is reachable from the phone and is not localhost.
- API request failed immediately after switching the local app scheme to `https`: use an HTTPS API, or keep the Android local app scheme as `http` for LAN debug builds to avoid mixed-content blocking.
- Debug build can reach LAN HTTP but release cannot: release is expected to use HTTPS.
- NetEase does not auto-play: confirm Accessibility permission is enabled for MuGame.
- Check cannot locate a song: confirm Notification Listener permission is enabled for MuGame and NetEase is actively playing.
- Floating window does not appear: confirm overlay permission is enabled for MuGame.
