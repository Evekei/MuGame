# NetEase Login Manual Test Notes

These checks cover the native WebView part that unit tests cannot fully
exercise on Windows.

## Browser Development

1. Start FastAPI with `pnpm dev:api`.
2. Start the web app with `pnpm dev:web`.
3. Open `http://localhost:3001`.
4. Tap the top-left account entry and tap `登录`.
5. Expected: the UI shows that NetEase login requires the Android or iOS app.
6. Expected: no password input appears in the MuGame UI.

## Android

1. Set `NEXT_PUBLIC_API_BASE_URL` to an API URL reachable from the emulator or
   device, then run `pnpm cap:sync`.
2. Open Android Studio with `pnpm android:open`.
3. Launch the app on an emulator or physical device.
4. Tap the top-left account entry and tap `登录`.
5. Expected: a native WebView opens `https://music.163.com/`.
6. Complete the official NetEase web login flow.
7. Expected: the WebView closes after auth cookies appear.
8. Expected: the account sheet shows `已登录`, nickname, and avatar if available.
9. Force close and relaunch the app.
10. Expected: backend session check restores `已登录`; if the NetEase session is
    invalid, the account state becomes `登录已过期`.
11. Tap `同步登录状态`.
12. Expected: the profile remains current or moves to expired without crashing.
13. Tap `退出登录`.
14. Expected: native WebView cookies and backend session are both cleared.

## iOS

1. Run these checks on macOS with Xcode.
2. Ensure `apps/mobile/plugin/native/netease-auth/ios/NeteaseAuthPlugin.swift`
   is included in the App target if Xcode does not pick it up automatically.
3. Set `NEXT_PUBLIC_API_BASE_URL` to an HTTPS API URL reachable from the device.
4. Run `pnpm cap:sync`, then `pnpm ios:open`.
5. Repeat the Android login, relaunch, sync, and logout checks.

## Log Safety

1. Run backend tests with `pnpm test:api`.
2. During manual login, inspect API logs.
3. Expected: logs may include cookie names and redacted suffixes, but never a
   complete Cookie header, token, or password.
