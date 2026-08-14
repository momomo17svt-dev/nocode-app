# NoCode App - source release archive script
# Creates a source-oriented ZIP without secrets, runtime data, or generated files.
#
# Defaults (per project decision):
#   - Destination : <project>\release\nocode-app_<yyyyMMdd_HHmm>\
#   - Format      : single ZIP, ASCII-only paths inside (drop server re-packs to 7z)
#   - Maps        : EXCLUDED  (storage\tiles ~2.4GB is dropped)  -> use -IncludeTiles to keep
#   - DB data     : EXCLUDED  (no migration\nocode_db.sql)       -> use -IncludeDb to keep
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File "<projectRoot>\submit.ps1"
#   ... -DropRoot "E:\nocode-deploy"   (place onto USB instead)
#   ... -IncludeTiles                  (bundle offline map tiles too)
#   ... -IncludeDb                     (bundle current DB dump; runs export-db first)
#   ... -DryRun                        (show what would happen, build nothing)

param(
    [string]$DropRoot = '',
    [string]$ArchiveName = 'nocode-app',
    [switch]$IncludeTiles,
    [switch]$IncludeDb,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
if (-not $DropRoot) { $DropRoot = Join-Path $ProjectRoot 'release' }
$ts = Get-Date -Format 'yyyyMMdd_HHmm'
$stamp = "${ArchiveName}_$ts"
$outDir = Join-Path $DropRoot $stamp
$zipPath = Join-Path $outDir "$stamp.zip"
$staging = Join-Path $env:TEMP "nocode-submit-$ts"
$stageRoot = Join-Path $staging $ArchiveName   # ASCII wrapper folder = zip top level

# --- Directories excluded from the archive (regenerable / not needed / too big) ---
$excludeDirs = @(
    '.git', '.local-backup', '.vs', 'release', 'pgsql', 'pg-runtime',
    'backend\node_modules', 'frontend\node_modules',
    'backend\dist', 'frontend\dist', 'backend\coverage', 'storage\attachments'
)
if (-not $IncludeTiles) { $excludeDirs += 'storage\tiles' }
if (-not $IncludeDb)    { $excludeDirs += 'migration' }

Write-Host '================================================'
Write-Host ' NoCode App - source archive'
Write-Host "  From : $ProjectRoot"
Write-Host "  To   : $zipPath"
Write-Host ("  Maps : {0}   DB : {1}" -f ($(if ($IncludeTiles) { 'included' } else { 'EXCLUDED' })), ($(if ($IncludeDb) { 'included' } else { 'EXCLUDED' })))
Write-Host '================================================'

if ($DryRun) {
    Write-Host '[DryRun] Excluded dirs:'
    $excludeDirs | ForEach-Object { Write-Host "   - $_" }
    Write-Host '[DryRun] Nothing was created.'
    return
}

# --- Optional: refresh DB dump so the bundle carries latest data ---
if ($IncludeDb) {
    $exportBat = Join-Path $ProjectRoot 'export-db.bat'
    if (Test-Path $exportBat) {
        Write-Host '[1/5] Exporting current database...'
        & cmd.exe /c "`"$exportBat`"" | Out-Null
    } else {
        Write-Warning 'export-db.bat not found; skipping DB export.'
    }
} else {
    Write-Host '[1/5] DB export skipped (per default).'
}

# --- Stage the project into an ASCII wrapper folder ---
Write-Host '[2/5] Staging files (robocopy)...'
if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
$xd = $excludeDirs | ForEach-Object { Join-Path $ProjectRoot $_ }
$excludeFiles = @(
    (Join-Path $ProjectRoot '.env'),
    (Join-Path $ProjectRoot 'backend\.env'),
    (Join-Path $ProjectRoot 'postgresql.zip')
)
$roboArgs = @($ProjectRoot, $stageRoot, '/E', '/MT:16', '/NFL', '/NDL', '/NJH', '/NP', '/R:1', '/W:1', '/XD') + $xd + @('/XF') + $excludeFiles
$null = robocopy @roboArgs
if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE)" }

# --- Force ASCII-only paths (drop server re-packs to multi-volume 7z; JP paths break restore) ---
Write-Host '[3/5] Normalizing to ASCII paths...'
# Known JP file: docs\<U+4ED5 U+69D8 U+66F8>.md  (kept as char codes so this script stays pure ASCII)
$jaSrc = Join-Path (Join-Path $stageRoot 'docs') ([char]0x4ed5 + [char]0x69d8 + [char]0x66f8 + '.md')
if (Test-Path -LiteralPath $jaSrc) { Rename-Item -LiteralPath $jaSrc -NewName 'spec-ja.md' }

$rootLen = $stageRoot.Length
$bad = Get-ChildItem -LiteralPath $stageRoot -Recurse -Force | Where-Object {
    $_.FullName.Substring($rootLen) -match '[^\x00-\x7F]'
}
if ($bad) {
    Write-Warning 'Non-ASCII paths remain (drop server may fail to restore):'
    $bad | ForEach-Object { Write-Warning ('   ' + $_.FullName.Substring($rootLen)) }
    Remove-Item -LiteralPath $staging -Recurse -Force
    throw 'Aborting: rename the above to ASCII (or add handling in submit.ps1) and retry.'
}

# --- Create the ZIP in TEMP first. The drop folder is watched by the release server,
#     which grabs new files immediately; build a COMPLETE zip in TEMP, then move it in. ---
Write-Host '[4/5] Creating ZIP...'
$tmpZip = Join-Path $env:TEMP "$stamp.zip"
if (Test-Path $tmpZip) { Remove-Item -LiteralPath $tmpZip -Force }
$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if ($tar) {
    Push-Location $staging
    try { & tar.exe -a -c -f $tmpZip $ArchiveName }
    finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "tar failed (exit $LASTEXITCODE)" }
} else {
    Compress-Archive -Path $stageRoot -DestinationPath $tmpZip -CompressionLevel Optimal -Force
}

# --- Report from the temp zip (before the server can consume it), then move into drop ---
$fileCount = (Get-ChildItem -LiteralPath $stageRoot -Recurse -File -Force).Count
$sizeMB = [math]::Round((Get-Item -LiteralPath $tmpZip).Length / 1MB, 1)
Remove-Item -LiteralPath $staging -Recurse -Force

Write-Host '[5/5] Placing into drop folder...'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Move-Item -LiteralPath $tmpZip -Destination $zipPath -Force

Write-Host '------------------------------------------------'
Write-Host ("  Folder : {0}" -f $outDir)
Write-Host ("  Zip    : {0}.zip" -f $stamp)
Write-Host ("  Size   : {0} MB" -f $sizeMB)
Write-Host ("  Files  : {0}" -f $fileCount)
Write-Host ("  ZipTop : {0}/  (ASCII)" -f $ArchiveName)
if (-not (Test-Path -LiteralPath $zipPath)) {
    Write-Host '  Note   : release server already picked up the zip (moved to _processed).'
}
Write-Host '------------------------------------------------'
