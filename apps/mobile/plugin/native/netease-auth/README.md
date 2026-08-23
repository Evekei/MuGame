# Netease Auth Native Bridge

This directory contains platform-specific code for the `NeteaseAuth` Capacitor
bridge. It must stay limited to login WebView/session work:

- open or close the NetEase login WebView;
- detect authenticated cookies;
- return a short-lived whitelist cookie snapshot to TypeScript;
- clear WebView cookies on logout.

The login WebView provides a small native method switcher and then opens only
official NetEase login URLs:

```text
手机号: https://music.163.com/m/login
微信扫码: https://music.163.com/api/sns/authorize?snsType=10&clientType=web2&callbackType=Login&forcelogin=true
QQ:     https://music.163.com/api/sns/authorize?snsType=5&clientType=web2&callbackType=Login&forcelogin=true
```

This keeps the mobile login experience and preserves 手机号 / 微信扫码 / QQ choices
without asking for credentials inside MuGame-owned UI.

Native WebView code must keep popup and external login handling inside this
bridge:

- popup login links are opened inside the controlled login WebView;
- non-HTTP(S) login schemes such as WeChat or platform intent URLs are handed to
  the operating system;
- logs may include sanitized URLs, but must never include Cookie or token
  values.

Do not add playlist parsing, matching, playback, analytics, or app business state
to this native plugin.

Android is wired into the current Gradle source set from
`apps/mobile/android/app/build.gradle`.

iOS source is kept here for the Xcode target. On macOS, add the Swift file to
the App target if Capacitor/Xcode does not pick it up automatically, then run the
manual checks in `docs/manual/netease-login.md`.
