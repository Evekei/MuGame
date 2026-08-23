# Shared Contracts

This package is the source for cross-end wire contract intent.

Keep it small:

- Put only DTO/interface definitions or endpoint contract notes here.
- Do not add platform adapter logic.
- Do not add player, matching, or analytics models until the phase that
  implements those capabilities.

## Health

`GET /health` returns:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "server_time": "2026-08-23T08:00:00.000000+00:00"
}
```

## NetEase Account

`./src/account.ts` defines only the wire DTOs for the NetEase account session
status, profile, and short-lived native session snapshot.

## Import Preview

`./src/imports.ts` defines only playlist preview request/response DTOs. It does
not include full track lists or full import models.
