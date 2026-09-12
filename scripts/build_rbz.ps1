[CmdletBinding()]
param (
    [string]$OutputPath,
    [switch]$InstallToSketchUp
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$SrcDir = Join-Path $RootDir "apps\sketchup-extension"
$Loader = Join-Path $SrcDir "constructflow.rb"

if (-not (Test-Path $Loader) -or -not (Test-Path (Join-Path $SrcDir "constructflow"))) {
    Write-Error "ConstructFlow SketchUp extension source not found under $SrcDir"
    exit 1
}

$LoaderContent = Get-Content -Raw $Loader
if ($LoaderContent -match "VERSION\s*=\s*['""]([^'""]+)['""]") {
    $Version = $matches[1]
} else {
    Write-Error "VERSION not found in $Loader"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $DistDir = Join-Path $RootDir "dist"
    if (-not (Test-Path $DistDir)) {
        New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    }
    $OutputPath = Join-Path $DistDir "ConstructFlow-$Version.rbz"
} else {
    $OutDir = Split-Path -Parent $OutputPath
    if ($OutDir -and -not (Test-Path $OutDir)) {
        New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    }
}

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
    Copy-Item -Path $Loader -Destination (Join-Path $TempDir "constructflow.rb") -Force
    Copy-Item -Path (Join-Path $SrcDir "constructflow") -Destination (Join-Path $TempDir "constructflow") -Recurse -Force

    Get-ChildItem -Path $TempDir -Include ".DS_Store", "Thumbs.db", "*.bak" -Recurse -Force | Remove-Item -Force

    if (Test-Path $OutputPath) {
        Remove-Item -Path $OutputPath -Force
    }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $zip = [System.IO.Compression.ZipFile]::Open($OutputPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $files = Get-ChildItem -Path $TempDir -Recurse -File
        foreach ($file in $files) {
            $relPath = $file.FullName.Substring($TempDir.Length).TrimStart('\', '/')
            $entryName = $relPath -replace '\\', '/'
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally {
        $zip.Dispose()
    }

    $readZip = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
    try {
        $hasBootstrap = ($readZip.Entries | Where-Object { $_.FullName -eq 'constructflow/bootstrap.rb' }).Count -gt 0
        $fileCount = ($readZip.Entries | Where-Object { -not $_.FullName.EndsWith('/') }).Count

        if (-not $hasBootstrap) {
            Write-Error "RBZ is missing constructflow/bootstrap.rb"
            exit 1
        }
    } finally {
        $readZip.Dispose()
    }

    Write-Host "Built: $OutputPath" -ForegroundColor Green
    Write-Host "Version: $Version"
    Write-Host "Files: $fileCount"

    $GenericPath = Join-Path (Split-Path -Parent $OutputPath) "ConstructFlow.rbz"
    Copy-Item -Path $OutputPath -Destination $GenericPath -Force
    Write-Host "Generic alias: $GenericPath"

    if ($InstallToSketchUp) {
        $PluginsDir = Join-Path $env:APPDATA "SketchUp\SketchUp 2026\SketchUp\Plugins"
        if (Test-Path $PluginsDir) {
            Write-Host "Deploying to SketchUp 2026 Plugins folder..." -ForegroundColor Cyan
            Copy-Item -Path $Loader -Destination (Join-Path $PluginsDir "constructflow.rb") -Force
            Copy-Item -Path (Join-Path $SrcDir "constructflow") -Destination $PluginsDir -Recurse -Force
            Write-Host "Successfully deployed to $PluginsDir" -ForegroundColor Green
        } else {
            Write-Warning "SketchUp Plugins directory not found at $PluginsDir"
        }
    }
} finally {
    if (Test-Path $TempDir) {
        Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
