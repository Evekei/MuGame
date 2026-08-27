param(
    [Parameter(Mandatory = $true)]
    [string]$ApiBaseUrl,

    [switch]$AllowUnsigned
)

$ErrorActionPreference = "Stop"

function Assert-HttpsApiBaseUrl {
    param([string]$Value)

    try {
        $uri = [System.Uri]::new($Value)
    } catch {
        throw "ApiBaseUrl must be a valid URL."
    }

    if ($uri.Scheme -ne "https") {
        throw "ApiBaseUrl must use https for release builds."
    }

    $blockedHosts = @("localhost", "127.0.0.1", "0.0.0.0", "::1")
    if ($blockedHosts -contains $uri.Host.ToLowerInvariant()) {
        throw "ApiBaseUrl must not point to localhost for release builds."
    }
}

function Assert-SigningEnvironment {
    if ($AllowUnsigned) {
        return
    }

    $required = @(
        "MUGAME_ANDROID_KEYSTORE_FILE",
        "MUGAME_ANDROID_KEYSTORE_PASSWORD",
        "MUGAME_ANDROID_KEY_ALIAS",
        "MUGAME_ANDROID_KEY_PASSWORD"
    )
    $missing = $required | Where-Object { -not [Environment]::GetEnvironmentVariable($_) }
    if ($missing.Count -gt 0) {
        throw "Missing release signing environment variables: $($missing -join ', '). Use -AllowUnsigned only for inspection builds."
    }
}

Assert-HttpsApiBaseUrl $ApiBaseUrl
Assert-SigningEnvironment

$env:NEXT_PUBLIC_API_BASE_URL = $ApiBaseUrl

pnpm --dir apps/mobile test
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile lint
pnpm --dir apps/mobile build

Push-Location apps/mobile
try {
    npx cap sync android
} finally {
    Pop-Location
}

Push-Location apps/mobile/android
try {
    .\gradlew.bat :app:assembleRelease
} finally {
    Pop-Location
}

$signedApk = "apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
$unsignedApk = "apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk"
if (Test-Path $signedApk) {
    Write-Host "Release APK: $signedApk"
} elseif (Test-Path $unsignedApk) {
    Write-Host "Unsigned release APK: $unsignedApk"
} else {
    throw "Release APK was not produced."
}
