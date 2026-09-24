# ConstructFlow test runner for Windows - runs exactly what CI runs,
# via Docker (ruby:3.2).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

docker run --rm -v "${root}:/work" -w //work ruby:3.2 bash -c "find apps/sketchup-extension/constructflow/core apps/sketchup-extension/constructflow/modules -name '*.rb' -print0 | xargs -0 -n1 ruby -c > /dev/null && echo 'SYNTAX: ALL OK' && ruby -Itest -Iapps/sketchup-extension -e 'Dir[\"test/**/*_test.rb\"].sort.each { |file| require_relative file }'"
