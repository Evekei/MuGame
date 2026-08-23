# Netease Auth Native Bridge

This directory contains platform-specific code for the `NeteaseAuth` Capacitor
bridge. It must stay limited to login WebView/session work:

- open or close the NetEase login WebView;
- detect authenticated cookies;
- return a short-lived whitelist cookie snapshot to TypeScript;
- clear WebView cookies on logout.

Do not add playlist parsing, matching, playback, analytics, or app business state
to this native plugin.

Android is wired into the current Gradle source set from
`apps/mobile/android/app/build.gradle`.

iOS source is kept here for the Xcode target. On macOS, add the Swift file to
the App target if Capacitor/Xcode does not pick it up automatically, then run the
manual checks in `docs/manual/netease-login.md`.
