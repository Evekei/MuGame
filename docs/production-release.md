# Production Release

MuGame cannot be fully independent while the mobile app points at a laptop FastAPI server. The production shape is:

```text
Android APK
  -> bundled static Next.js app
  -> HTTPS FastAPI service
  -> SQLite volume on the service host
  -> NetEase app for playback
```

Do not package `localhost`, `127.0.0.1`, or a LAN address into a release APK.

## Deploy API

Build the API image:

```powershell
docker build -t mugame-api:0.1.0 services/api
```

Run it behind an HTTPS reverse proxy or on a platform that provides HTTPS:

```powershell
docker run -d `
  --name mugame-api `
  -p 8000:8000 `
  -v mugame-api-data:/data `
  --env-file .env.production `
  mugame-api:0.1.0
```

Required production environment:

```text
MUGAME_DB_PATH=/data/mugame.sqlite3
MUGAME_CORS_ORIGINS=http://localhost,https://localhost,capacitor://localhost,ionic://localhost
```

Verify from the phone network:

```powershell
Invoke-RestMethod https://your-api.example.com/health
```

## Build Android Release

Set signing variables. Keep the keystore outside Git:

```powershell
$env:MUGAME_ANDROID_KEYSTORE_FILE = "$env:USERPROFILE\.mugame\release.jks"
$env:MUGAME_ANDROID_KEYSTORE_PASSWORD = "<store-password>"
$env:MUGAME_ANDROID_KEY_ALIAS = "mugame"
$env:MUGAME_ANDROID_KEY_PASSWORD = "<key-password>"
```

Build:

```powershell
.\scripts\build-android-release.ps1 -ApiBaseUrl "https://your-api.example.com"
```

Output:

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

For inspection only, an unsigned APK can be built with:

```powershell
.\scripts\build-android-release.ps1 -ApiBaseUrl "https://your-api.example.com" -AllowUnsigned
```

## Final Smoke Test

On a real Android device, with the laptop API turned off:

1. Open MuGame and confirm account status loads.
2. Import two playlist links.
3. Confirm and build the temporary playlist.
4. Tap Play and verify NetEase opens the MuGame temporary playlist.
5. Open the lyrics/detail page.
6. Use floating Check/Hide.
7. Open statistics from the floating window.

If any API call succeeds while the laptop API is stopped, the APK is no longer dependent on the computer API.
