param(
    [Parameter(Mandatory = $true)]
    [string]$ApiBaseUrl,

    [switch]$AllowUnsigned
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
}

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

    if ($uri.Host.ToLowerInvariant() -eq "api.example.com" -or $uri.Host.ToLowerInvariant().EndsWith(".example.com")) {
        throw "ApiBaseUrl must be a real production API URL, not an example.com placeholder."
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

function Test-TextOutputContains {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Roots,

        [Parameter(Mandatory = $true)]
        [string]$Needle
    )

    foreach ($root in $Roots) {
        if (-not (Test-Path $root)) {
            continue
        }
        $match = Get-ChildItem -LiteralPath $root -Recurse -File -Include *.css,*.html,*.js,*.json,*.txt |
            Select-String -SimpleMatch $Needle -List -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($match) {
            return $true
        }
    }
    return $false
}

function Assert-ReleaseStaticOutput {
    param([string]$ExpectedApiBaseUrl)

    $roots = @(
        "apps/mobile/out",
        "apps/mobile/android/app/src/main/assets/public"
    )
    if (-not (Test-TextOutputContains -Roots $roots -Needle $ExpectedApiBaseUrl)) {
        throw "Release static output does not contain the requested API URL: $ExpectedApiBaseUrl"
    }

    $blocked = @(
        "https://api.example.com",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://0.0.0.0:8000",
        "192.168.0.102:8000"
    )
    foreach ($needle in $blocked) {
        if ($needle -eq $ExpectedApiBaseUrl) {
            continue
        }
        if (Test-TextOutputContains -Roots $roots -Needle $needle) {
            throw "Release static output contains blocked API value: $needle"
        }
    }
}

function Find-ApkSigner {
    $pathCommand = Get-Command apksigner -ErrorAction SilentlyContinue
    if ($pathCommand) {
        return $pathCommand.Source
    }

    $sdkRoot = $env:ANDROID_HOME
    if (-not $sdkRoot) {
        $sdkRoot = $env:ANDROID_SDK_ROOT
    }
    if (-not $sdkRoot) {
        return $null
    }

    $candidate = Get-ChildItem -LiteralPath (Join-Path $sdkRoot "build-tools") -Filter apksigner.bat -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($candidate) {
        return $candidate.FullName
    }
    return $null
}

function Assert-SignedApk {
    param([string]$ApkPath)

    $apkSigner = Find-ApkSigner
    if (-not $apkSigner) {
        throw "apksigner was not found. Install Android SDK build-tools or add apksigner to PATH."
    }

    Invoke-Checked $apkSigner "verify" "--verbose" $ApkPath
}

Assert-HttpsApiBaseUrl $ApiBaseUrl
Assert-SigningEnvironment

$env:NEXT_PUBLIC_API_BASE_URL = $ApiBaseUrl

Invoke-Checked "pnpm" "--dir" "apps/mobile" "test"
Invoke-Checked "pnpm" "--dir" "apps/mobile" "typecheck"
Invoke-Checked "pnpm" "--dir" "apps/mobile" "lint"
Invoke-Checked "pnpm" "--dir" "services/api" "test"
Invoke-Checked "pnpm" "--dir" "apps/mobile" "build"

Push-Location apps/mobile
try {
    Invoke-Checked "npx" "cap" "sync" "android"
} finally {
    Pop-Location
}

Assert-ReleaseStaticOutput $ApiBaseUrl

Push-Location apps/mobile/android
try {
    Invoke-Checked ".\gradlew.bat" ":app:assembleRelease"
} finally {
    Pop-Location
}

$signedApk = "apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
$unsignedApk = "apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk"
if (Test-Path $signedApk) {
    Assert-SignedApk $signedApk
    Write-Host "Release APK: $signedApk"
} elseif (Test-Path $unsignedApk) {
    if (-not $AllowUnsigned) {
        throw "Release build produced only an unsigned APK. Check signing environment variables."
    }
    Write-Host "Unsigned release APK: $unsignedApk"
} else {
    throw "Release APK was not produced."
}
