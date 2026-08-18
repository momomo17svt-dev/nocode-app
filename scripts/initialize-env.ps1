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

function Get-EnvValue([string]$Path, [string]$Key) {
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match ('^\s*' + $Key + '\s*=(.*)')) { return $Matches[1].Trim() }
    }
    return ''
}

function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
    $lines = @(Get-Content -LiteralPath $Path)
    $replaced = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if (-not $replaced -and $lines[$i] -match ('^\s*' + $Key + '\s*=')) {
            $lines[$i] = "$Key=$Value"
            $replaced = $true
        }
    }
    if (-not $replaced) { $lines += "$Key=$Value" }
    $text = ($lines -join [Environment]::NewLine) + [Environment]::NewLine
    [System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

# The backend refuses to start on the values shipped in .env.example, so treat them as absent.
function Test-PlaceholderValue([string]$Value, [int]$MinLength) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
    $trimmed = $Value.Trim()
    if ($trimmed -match 'change_me') { return $true }
    if ($trimmed.ToLowerInvariant() -eq 'password123') { return $true }
    if ($trimmed.Length -lt $MinLength) { return $true }
    return $false
}

function Repair-Secret([string]$Path, [string]$Key, [int]$MinLength, [string]$NewValue) {
    if (-not (Test-PlaceholderValue (Get-EnvValue $Path $Key) $MinLength)) { return $false }
    Set-EnvValue $Path $Key $NewValue | Out-Null
    return $true
}

function Test-DockerVolume([string]$Name) {
    # 'docker volume inspect' writes to stderr when the volume is absent, and Windows
    # PowerShell turns that into a terminating error under $ErrorActionPreference='Stop'.
    # Listing by name stays silent, so a machine without the volume still works.
    $found = & docker volume ls --quiet --filter ('name=' + $Name)
    if ($LASTEXITCODE -ne 0) { return $false }
    foreach ($line in @($found)) {
        if ($line -and $line.Trim() -eq $Name) { return $true }
    }
    return $false
}

$adminPassword = New-RandomHex 18
$jwtSecret = New-RandomHex 32
$adminGenerated = $false
$jwtReplaced = $false
$dbPasswordKept = $false
$dbPasswordGuessed = $false
$volumeName = 'nocode-app_postgres_data'

if ($Mode -eq 'Docker') {
    $target = Join-Path $ProjectRoot '.env'
    $created = -not (Test-Path -LiteralPath $target)
    if (-not $created -and (Test-DockerVolume 'antigravity-nocode_postgres_data')) {
        $volumeName = 'antigravity-nocode_postgres_data'
    }
    Add-MissingLines $target ([ordered]@{
        APP_PORT = $AppPort
        POSTGRES_VOLUME_NAME = $volumeName
        POSTGRES_DB = 'nocode_db'
        POSTGRES_USER = 'postgres'
        POSTGRES_PASSWORD = (New-RandomHex 24)
        JWT_SECRET = $jwtSecret
        JWT_EXPIRES_IN = '8h'
        AUTH_COOKIE_SECURE = 'false'
        AUTH_COOKIE_MAX_AGE_MS = '28800000'
        AUTH_EXPOSE_BEARER_TOKEN = 'false'
        INITIAL_ADMIN_LOGIN = 'admin'
        INITIAL_ADMIN_NAME = 'Administrator'
        INITIAL_ADMIN_PASSWORD = $adminPassword
        CORS_ORIGINS = ''
        PUBLIC_FORM_RATE_LIMIT_PER_MINUTE = '10'
        SLOW_REQUEST_MS = '1000'
        DB_SLOW_QUERY_MS = '500'
        HTTP_LOG_MODE = 'slow'
        VITE_API_TIMEOUT_MS = '20000'
        LLM_PROVIDER = 'lmstudio'
        LLM_BASE_URL = 'http://host.docker.internal:1234/v1'
        LLM_API_KEY = ''
        LLM_API_KEY_HEADER = 'authorization'
    })

    # compose.yaml names the volume from .env, so honour whatever is written there.
    $configuredVolume = Get-EnvValue $target 'POSTGRES_VOLUME_NAME'
    if ($configuredVolume) { $volumeName = $configuredVolume }

    # A .env copied by hand from .env.example keeps its empty secrets (older copies keep
    # the change_me placeholders), and Add-MissingLines never touches a key that already
    # exists. Fill in what compose and the backend refuse to start on.
    $jwtReplaced = Repair-Secret $target 'JWT_SECRET' 32 $jwtSecret
    $adminGenerated = $created -or (Repair-Secret $target 'INITIAL_ADMIN_PASSWORD' 12 $adminPassword)
    $dbPassword = Get-EnvValue $target 'POSTGRES_PASSWORD'
    if (Test-PlaceholderValue $dbPassword 12) {
        $volumeExists = Test-DockerVolume $volumeName
        if ($volumeExists -and -not [string]::IsNullOrWhiteSpace($dbPassword)) {
            # PostgreSQL reads POSTGRES_PASSWORD only while it initializes its data
            # directory. Rotating it against an existing volume just breaks the login.
            $dbPasswordKept = $true
        }
        else {
            # compose refuses to start on an empty value, so one has to be written even
            # when the volume predates it and may hold a different password.
            Set-EnvValue $target 'POSTGRES_PASSWORD' (New-RandomHex 24)
            $dbPasswordGuessed = $volumeExists
        }
    }
}
else {
    $target = Join-Path $ProjectRoot 'backend\.env'
    $created = -not (Test-Path -LiteralPath $target)
    Add-MissingLines $target ([ordered]@{
        DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/nocode_db?schema=public'
        JWT_SECRET = $jwtSecret
        JWT_EXPIRES_IN = '8h'
        AUTH_COOKIE_SECURE = 'false'
        AUTH_COOKIE_MAX_AGE_MS = '28800000'
        AUTH_EXPOSE_BEARER_TOKEN = 'false'
        INITIAL_ADMIN_LOGIN = 'admin'
        INITIAL_ADMIN_NAME = 'Administrator'
        INITIAL_ADMIN_PASSWORD = $adminPassword
        CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
        PUBLIC_FORM_RATE_LIMIT_PER_MINUTE = '10'
        SLOW_REQUEST_MS = '1000'
        DB_SLOW_QUERY_MS = '500'
        HTTP_LOG_MODE = 'slow'
        LLM_PROVIDER = 'lmstudio'
        LLM_BASE_URL = 'http://localhost:1234/v1'
        LLM_API_KEY = ''
        LLM_API_KEY_HEADER = 'authorization'
    })

    # setup.bat runs initdb without authentication, so the bundled server expects this URL.
    $databaseUrl = Get-EnvValue $target 'DATABASE_URL'
    if ([string]::IsNullOrWhiteSpace($databaseUrl) -or $databaseUrl -match 'change_me') {
        Set-EnvValue $target 'DATABASE_URL' 'postgresql://postgres:postgres@127.0.0.1:5432/nocode_db?schema=public'
    }
    $jwtReplaced = Repair-Secret $target 'JWT_SECRET' 32 $jwtSecret
    $adminGenerated = $created -or (Repair-Secret $target 'INITIAL_ADMIN_PASSWORD' 12 $adminPassword)
}

if ($jwtReplaced) {
    Write-Host 'Replaced the placeholder JWT_SECRET with a generated value.'
}

if ($dbPasswordKept) {
    Write-Warning "POSTGRES_PASSWORD is still an example placeholder, but volume $volumeName already exists."
    Write-Warning 'PostgreSQL keeps the password its data directory was created with, so .env is left as is.'
    Write-Warning 'To start over with a generated password (this deletes the local database):'
    Write-Warning '  docker compose down -v'
}

if ($dbPasswordGuessed) {
    Write-Warning "POSTGRES_PASSWORD was empty, so a new one was generated, but volume $volumeName already exists."
    Write-Warning 'PostgreSQL keeps the password its data directory was created with, so the new value may not match.'
    Write-Warning 'If the backend reports password authentication failed, restore the original value, or run:'
    Write-Warning '  docker compose down -v   (this deletes the local database)'
}

if ($adminGenerated) {
    $adminLogin = Get-EnvValue $target 'INITIAL_ADMIN_LOGIN'
    if (-not $adminLogin) { $adminLogin = 'admin' }
    Write-Host 'Initial administrator credentials (shown once):'
    Write-Host "  Login    : $adminLogin"
    Write-Host ("  Password : {0}" -f (Get-EnvValue $target 'INITIAL_ADMIN_PASSWORD'))
    Write-Host "  Saved in : $target"
    Write-Host '  Used only while that administrator does not exist in the database yet.'
}
else {
    Write-Host "Configuration ready: $target"
}
