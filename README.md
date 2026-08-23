# MuGame

Mobile-first personal playlist game MVP.

## Phase 1 Scope

The project now includes:

- `apps/mobile`: Next.js App Router + TypeScript static export.
- Capacitor config with `webDir` set to the Next.js `out` directory.
- `services/api`: FastAPI with `GET /health`.
- `shared/contracts`: cross-end DTO/interface notes.
- NetEase account session APIs and a native `NeteaseAuth` bridge boundary.

It intentionally does not implement playlist parsing, playback, matching, sync,
or analytics business flows.

## Setup

Install Node dependencies:

```bash
pnpm install
```

Install Python API dependencies:

```bash
python -m pip install -r services/api/requirements-dev.txt
```

Create local environment files as needed:

```bash
cp .env.example apps/mobile/.env.local
```

On Windows PowerShell, copy the file manually or use:

```powershell
Copy-Item .env.example apps/mobile/.env.local
```

## Local Development

Run the API:

```bash
pnpm dev:api
```

Run the mobile web app:

```bash
pnpm dev:web
```

The local web app runs on `http://localhost:3001`.

The web app reads `NEXT_PUBLIC_API_BASE_URL` and calls FastAPI directly.
The API allows `http://localhost:3001` by default during local development.
Do not add Next.js API Routes, Server Actions, or Middleware for backend work.

NetEase login uses the Capacitor native bridge. In a plain browser, tapping
`登录` shows that Android/iOS is required; browser code must not read WebView
cookies.

On Android/iOS, the native bridge opens official NetEase login URLs behind a
small native method switcher for 手机号 / 微信扫码 / QQ. Popup links and external login
schemes stay confined to the native bridge layer.

The API stores the minimum NetEase session needed for the personal MVP in
SQLite. Configure the database path with:

```bash
MUGAME_DB_PATH=mugame.sqlite3
```

## Build And Checks

```bash
pnpm lint
pnpm typecheck
pnpm test:api
pnpm build:web
pnpm cap:sync
```

`pnpm build:web` must produce `apps/mobile/out` for Capacitor.

## Capacitor

Generate native projects when the platform toolchain is available:

```bash
pnpm cap:add:android
pnpm cap:add:ios
```

Open Android:

```bash
pnpm android:open
```

Open iOS on macOS with Xcode:

```bash
pnpm ios:open
```

iOS open/build is expected to require macOS and Xcode. On Windows, keep the
script and documented path ready, then validate iOS on a Mac.

Manual native login checks live in `docs/manual/netease-login.md`.
