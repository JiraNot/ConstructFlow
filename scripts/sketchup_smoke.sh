#!/usr/bin/env bash
# Run the ConstructFlow smoke test inside a real SketchUp and print the report.
#
#   bash scripts/sketchup_smoke.sh
#
# Overrides:
#   SKETCHUP_EXE=...            explicit path to the SketchUp executable
#   SKETCHUP_SMOKE_TIMEOUT=120  seconds to wait for the report
#   SKETCHUP_SMOKE_FORCE=1      run even if a SketchUp instance is already open
#   SKETCHUP_SMOKE_KEEP=1       keep the report file after printing it
#
# Exit codes: 0 all checks passed, 1 test failure/timeout, 2 no SketchUp found,
#             3 SketchUp already running (would quit the user's session).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_RB="$ROOT_DIR/scripts/sketchup_smoke.rb"
REPORT="$ROOT_DIR/sketchup_smoke_report.txt"
TIMEOUT_SECONDS="${SKETCHUP_SMOKE_TIMEOUT:-180}"

is_windows() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

find_sketchup() {
  if [[ -n "${SKETCHUP_EXE:-}" ]]; then
    [[ -f "$SKETCHUP_EXE" ]] || { echo "SKETCHUP_EXE not found: $SKETCHUP_EXE" >&2; return 1; }
    printf '%s\n' "$SKETCHUP_EXE"
    return 0
  fi

  local candidates=()
  if is_windows; then
    for v in 2026 2025 2024 2023 2022 2021 2020; do
      candidates+=("/c/Program Files/SketchUp/SketchUp $v/SketchUp/SketchUp.exe")
      candidates+=("/c/Program Files (x86)/SketchUp/SketchUp $v/SketchUp/SketchUp.exe")
    done
  else
    for v in 2026 2025 2024 2023; do
      candidates+=("/Applications/SketchUp $v/SketchUp.app/Contents/MacOS/SketchUp")
    done
  fi

  local c
  for c in "${candidates[@]}"; do
    [[ -f "$c" ]] && { printf '%s\n' "$c"; return 0; }
  done
  return 1
}

to_win_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    printf '%s\n' "$1"
  fi
}

abort_if_sketchup_running() {
  [[ "${SKETCHUP_SMOKE_FORCE:-}" == "1" ]] && return 0
  if is_windows && tasklist 2>/dev/null | grep -qi 'sketchup.exe'; then
    echo "SketchUp is already running; close it first so the smoke test can own the session" >&2
    echo "(the test quits SketchUp when done). Set SKETCHUP_SMOKE_FORCE=1 to override." >&2
    exit 3
  fi
}

# The first launch of a new SketchUp version shows a CEF "Welcome" window that
# blocks startup. Click its primary button and press Enter so the startup
# script can run unattended.
dismiss_welcome() {
  local pid="$1"
  is_windows || return 0
  powershell -NoProfile -Command "
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;using System.Runtime.InteropServices;
public class W { [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int x,int y);
[DllImport(\"user32.dll\")] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,uint e);
[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h); }
'@
\$root=[System.Windows.Automation.AutomationElement]::RootElement
\$cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$pid)
\$win=\$root.FindFirst([System.Windows.Automation.TreeScope]::Children,\$cond)
if (\$win) {
  \$r=\$win.Current.BoundingRectangle
  [W]::SetForegroundWindow([IntPtr]\$win.Current.NativeWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 400
  [W]::SetCursorPos([int](\$r.X+\$r.Width/2),[int](\$r.Y+\$r.Height-40)) | Out-Null
  [W]::mouse_event(2,0,0,0,0); [W]::mouse_event(4,0,0,0,0)
  Start-Sleep -Milliseconds 600
  (New-Object -ComObject WScript.Shell).SendKeys('{ENTER}')
}
" >/dev/null 2>&1 || true
}

SKETCHUP="$(find_sketchup)" || { echo "Could not find SketchUp; set SKETCHUP_EXE to its full path" >&2; exit 2; }
echo "Using SketchUp: $SKETCHUP"
abort_if_sketchup_running

rm -f "$REPORT"

PID=""
if is_windows; then
  EXE_WIN="$(to_win_path "$SKETCHUP")"
  RB_WIN="$(to_win_path "$SMOKE_RB")"
  PID="$(powershell -NoProfile -Command \
    "(Start-Process -FilePath '$EXE_WIN' -ArgumentList '-RubyStartup','$RB_WIN' -PassThru).Id" | tr -d '\r')"
else
  "$SKETCHUP" -RubyStartup "$SMOKE_RB" >/dev/null 2>&1 &
  PID=$!
fi
echo "Launched SketchUp (pid ${PID:-?}); waiting up to ${TIMEOUT_SECONDS}s for the report..."

elapsed=0
welcome_handled=0
while (( elapsed < TIMEOUT_SECONDS )); do
  if [[ -f "$REPORT" ]]; then break; fi
  sleep 2
  elapsed=$((elapsed + 2))
  if (( welcome_handled == 0 )) && (( elapsed >= 12 )) && [ -n "$PID" ]; then
    dismiss_welcome "$PID"
    welcome_handled=1
  fi
done

if [[ ! -f "$REPORT" ]]; then
  echo "No report after ${TIMEOUT_SECONDS}s — SketchUp may be blocked by a dialog." >&2
  if [[ -n "$PID" ]]; then
    if is_windows; then taskkill //PID "$PID" //F >/dev/null 2>&1 || true
    else kill "$PID" >/dev/null 2>&1 || true
    fi
  fi
  exit 1
fi

echo "----------------------------------------"
cat "$REPORT"
echo "----------------------------------------"

status=0
grep -q 'RESULT: ALL PASS' "$REPORT" || status=1

if [[ "${SKETCHUP_SMOKE_KEEP:-}" != "1" ]]; then
  rm -f "$REPORT"
fi

if (( status == 0 )); then
  echo "SketchUp smoke test: ALL PASS"
else
  echo "SketchUp smoke test: FAILED (see report above)" >&2
fi
exit "$status"
