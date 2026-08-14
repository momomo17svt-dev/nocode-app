param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Docker', 'Local')]
    [string]$Mode,
    [string]$AppPort = '5173'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function New-RandomHex([int]$ByteCount) {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $bytes = New-Object byte[] $ByteCount
        $rng.GetBytes($bytes)
        return -join ($bytes | ForEach-Object { $_.ToString('x2') })
    }
    finally {
        $rng.Dispose()
    }
}

function Read-Keys([string]$Path) {
    $keys = @{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in Get-Content -LiteralPath $Path) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
                $keys[$Matches[1]] = $true
            }
        }
    }
    return $keys
}

function Add-MissingLines([string]$Path, [hashtable]$Values) {
    $keys = Read-Keys $Path
    $missing = @()
    foreach ($key in $Values.Keys) {
        if (-not $keys.ContainsKey($key)) {
            $missing += "$key=$($Values[$key])"
        }
    }
    if ($missing.Count -gt 0) {
        if ((Test-Path -LiteralPath $Path) -and (Get-Item -LiteralPath $Path).Length -gt 0) {
            [System.IO.File]::AppendAllText($Path, [Environment]::NewLine, [System.Text.Encoding]::ASCII)
        }
        $text = ($missing -join [Environment]::NewLine) + [Environment]::NewLine
        [System.IO.File]::AppendAllText($Path, $text, [System.Text.Encoding]::ASCII)
    }
}

$adminPassword = New-RandomHex 18
$jwtSecret = New-RandomHex 32

if ($Mode -eq 'Docker') {
    $target = Join-Path $ProjectRoot '.env'
    $created = -not (Test-Path -LiteralPath $target)
    $volumeName = 'nocode-app_postgres_data'
    if (-not $created) {
        & docker volume inspect antigravity-nocode_postgres_data *> $null
        if ($LASTEXITCODE -eq 0) { $volumeName = 'antigravity-nocode_postgres_data' }
    }
    Add-MissingLines $target ([ordered]@{
        APP_PORT = $AppPort
        POSTGRES_VOLUME_NAME = $volumeName
        POSTGRES_DB = 'nocode_db'
        POSTGRES_USER = 'postgres'
        POSTGRES_PASSWORD = (New-RandomHex 24)
        JWT_SECRET = $jwtSecret
        JWT_EXPIRES_IN = '8h'
        INITIAL_ADMIN_LOGIN = 'admin'
        INITIAL_ADMIN_NAME = 'Administrator'
        INITIAL_ADMIN_PASSWORD = $adminPassword
        CORS_ORIGINS = ''
        PUBLIC_FORM_RATE_LIMIT_PER_MINUTE = '10'
        LLM_BASE_URL = 'http://host.docker.internal:1234/v1'
    })
}
else {
    $target = Join-Path $ProjectRoot 'backend\.env'
    $created = -not (Test-Path -LiteralPath $target)
    Add-MissingLines $target ([ordered]@{
        DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/nocode_db?schema=public'
        JWT_SECRET = $jwtSecret
        JWT_EXPIRES_IN = '8h'
        INITIAL_ADMIN_LOGIN = 'admin'
        INITIAL_ADMIN_NAME = 'Administrator'
        INITIAL_ADMIN_PASSWORD = $adminPassword
        CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
        PUBLIC_FORM_RATE_LIMIT_PER_MINUTE = '10'
        LLM_BASE_URL = 'http://localhost:1234/v1'
    })
}

if ($created) {
    Write-Host 'Initial administrator credentials (shown once):'
    Write-Host '  Login    : admin'
    Write-Host "  Password : $adminPassword"
    Write-Host "  Saved in : $target"
}
else {
    Write-Host "Configuration ready: $target"
}
