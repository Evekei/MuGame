$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$apiDir = Join-Path $root "services/api"
$mobileEnv = Join-Path $root "apps/mobile/.env.local"
$logDir = Join-Path $root ".codex-logs"
$apiOut = Join-Path $logDir "api.out.log"
$apiErr = Join-Path $logDir "api.err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Content -LiteralPath $mobileEnv -Value "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000" -Encoding ascii

$listener = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (-not $listener) {
  Start-Process `
    -FilePath python `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory $apiDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $apiOut `
    -RedirectStandardError $apiErr | Out-Null

  Start-Sleep -Seconds 1
}

adb reverse tcp:8000 tcp:8000 | Out-Null

$health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5
Write-Host "MuGame API ready:" ($health | ConvertTo-Json -Compress)
Write-Host "ADB reverse:" (adb reverse --list)
Write-Host "Mobile API base: http://127.0.0.1:8000"
