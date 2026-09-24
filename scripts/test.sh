#!/usr/bin/env bash

# ConstructFlow test runner — runs exactly what CI runs:
#   1. ruby -c syntax check on core + modules
#   2. the full Minitest suite
# Uses local Ruby when available, otherwise falls back to Docker (ruby:3.2).

set -euo pipefail
cd "$(dirname "$0")/.."

RUN_SYNTAX="find apps/sketchup-extension/constructflow/core apps/sketchup-extension/constructflow/modules -name '*.rb' -print0 | xargs -0 -n1 ruby -c > /dev/null && echo 'SYNTAX: ALL OK'"
RUN_TESTS="ruby -Itest -Iapps/sketchup-extension -e 'Dir[\"test/**/*_test.rb\"].sort.each { |file| require_relative file }'"

if command -v ruby > /dev/null 2>&1; then
  bash -c "$RUN_SYNTAX"
  bash -c "$RUN_TESTS"
else
  echo "Ruby not found - running via Docker (ruby:3.2)..."
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W 2>/dev/null || pwd)":/work -w //work ruby:3.2 bash -c "$RUN_SYNTAX && $RUN_TESTS"
fi
