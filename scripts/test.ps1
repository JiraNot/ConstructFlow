# ConstructFlow test runner for Windows - runs exactly what CI runs,
# via Docker (ruby:3.2).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

docker run --rm -v "${root}:/work" -w //work ruby:3.2 bash scripts/test.sh
