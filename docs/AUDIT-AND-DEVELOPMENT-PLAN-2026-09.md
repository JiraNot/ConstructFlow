# ConstructFlow — System Audit & Development Plan (September 2026)

Scope: full-repository audit performed after unifying `feat/phases-4-12-complete` with
`origin/main` at the **v1.0.0 Full Release** (`43f4f4d`). This document records what was
checked, what was found, what was fixed as part of the audit, and the development plan
that follows. It complements (does not replace) [`ROADMAP.md`](./ROADMAP.md) and
[`STATUS.md`](./STATUS.md).

---

## 1. Verification performed

| Check | Method | Result |
|---|---|---|
| Ruby syntax, all core/module files | `ruby -c` over every `.rb` (same as CI) | **PASS** |
| Full unit suite | CI-equivalent runner on Ruby 3.2 (Docker `ruby:3.2`, Linux) | **702 runs, 4,170 assertions, 0 failures, 0 errors** (after fixes below) |
| CI status of release commit `43f4f4d` | GitHub Checks API | `core-tests` = **FAILURE** (broken at release; fixed by this audit) |
| RBZ packaging | reviewed `scripts/build_rbz.sh` + `build-rbz.yml` | deterministic, version parsed from loader, layout verified — OK |
| Branch / remote hygiene | `git branch -avv`, GitHub refs | local unified to v1.0.0; `feat/phases-4-12-complete` removed local+remote; ~80 merged stale remote branches remain |
| Working-tree strays | file listing | `test.zip` (412 KB, untracked, gitignored) is leftover garbage — safe to delete |
| CI action versions | workflow review | `actions/checkout@v4` Node-20 deprecation warnings; upgrade recommended |
| Docs SSOT discipline | `docs/STATUS.md`, `docs/ROADMAP.md`, plan-driven master plan | strong; application-level vs native evidence correctly separated |

## 2. Findings and disposition

### 2.1 CI was broken on the v1.0.0 release (critical — FIXED)

`test/core/laser_level_tool_test.rb` and `test/core/structural_profile_catalog_test.rb`
(new in v1.0.0) use `require 'constructflow/...'`, which resolves through `$LOAD_PATH`.
The CI runner (`core-tests.yml`) invoked Ruby with only `-Itest`, so the first require
raised `LoadError` and **the entire suite never executed** on CI. Application code was
correct; the runner was not.

Fix applied: the CI unit-test step now runs
`ruby -Itest -Iapps/sketchup-extension -e 'Dir["test/**/*_test.rb"].sort.each { |file| require_relative file }'`.
Reproduced red → green locally in the CI-equivalent Docker environment.

Policy follow-up: **main must stay green.** A release commit should never land with a
failing required check (see §4 engineering practices).

### 2.2 Line-ending fragility (fixed + hardened)

The v1.0.0 commit stored several files with CRLF content in git. Two contract tests
assert multi-line source/doc text and failed on any CRLF checkout (Windows working
copies and non-LF environments), even though CI-on-Linux happened to pass. This is a
class of failure, not two bugs.

Fixes applied:

- `test/core/native_tool_contract_test.rb` and `test/docs/plan_driven_upgrade_document_test.rb`
  now normalize `\r\n → \n` before content assertions (checkout-agnostic);
- added a repo-wide **`.gitattributes`** (`* text=auto eol=lf`, CRLF kept for
  `.bat/.cmd/.ps1`, binary exclusions for `.png/.jpg/.ico/.rbz/.zip/.skp`) so future
  content is stored normalized and Windows checkouts stay buildable;
- guideline: tests that assert source text must never depend on native line endings.

### 2.3 Repository hygiene

- Local `main` was behind `origin/main` by 23 commits during the audit; synced (fast-forward) to v1.0.0.
- The integration branch `feat/phases-4-12-complete` was fully merged into main; deleted local+remote after a safety push.
- ~80 remote `feat/*`/`fix/*` branches from merged PRs remain on origin. Recommend a scripted, reviewed cleanup
  (`git branch -r --merged origin/main` + `git push origin --delete`) at the next maintenance window.
- `test.zip` in the working root is untracked debris (ignored by `*.zip`); delete it.

### 2.4 Code-quality observations (no action forced, tracked in plan)

- **Runtime wiring**: `constructflow/main.rb` (527 lines) hosts boot + menu + command
  registration in one class; `modules/architecture/registration.rb` is now very large
  (multi-thousand-line). Function is fine, but registration is the fastest-growing
  surface — split by concern (commands / tools / schedules / menus) before R2 expansion.
- **UI layer** (`ui/panel.html/.css/.js`, ~9k lines total) has no automated checks at all.
  At minimum add `node --check panel.js` (syntax) and a smoke HTML/JS parse step in CI.
- **`apps/mcp-server`** (Python AI/MCP bridge) is outside CI: no tests, no lint, and the
  HTTP bridge should be reviewed for auth/token binding before any non-localhost use.
- **No linters** for Ruby (RuboCop) or JS; no coverage measurement. The suite is fast
  (~1.1s), so adding RuboCop + tool-contract guards stays cheap.
- **Actions deprecation**: bump `actions/checkout` to a current major; add a
  `concurrency` group to cancel superseded runs.

### 2.5 The real R0 gate is still open (per STATUS.md — unchanged by this audit)

All 702 tests are application-level evidence with faked SketchUp/LayOut boundaries.
`docs/STATUS.md` correctly states that native save/reopen, Undo/Redo, copy identity,
scenes/styles and LayOut/PDF checkpoints
(`docs/implementation/NATIVE-APPLICATION-ACCEPTANCE-RUNBOOK.md`, checkpoints 1–8)
**remain to be executed in real SketchUp/LayOut**. This is the single most important
outstanding item and takes priority over new feature breadth.

## 3. System snapshot after audit

- Version: extension `VERSION = 1.0.0`; tag `v1.0.0`; `main` == `origin/main` == `43f4f4d` + audit fixes.
- Code: ~570 tracked source/doc files; ~15 domain modules; core command/event/transaction
  architecture with deterministic Smart Object semantics; plan-driven R0–R1 slice implemented.
- Tests: **702 tests / 4,170 assertions / 0 failures / 0 errors**, ~1.1 s, plus RBZ build workflow.
- CI: two workflows (core tests, RBZ build); core-tests repaired and verified green in CI-equivalent environment.

## 4. Development plan

Priority order follows the existing roadmap (R0 → R10) with engineering hygiene folded in.
Each phase exits only with evidence recorded in `docs/STATUS.md`.

### Phase 0 — Engineering hygiene (current audit window)

1. ✅ CI load-path fix (done; suite verified green)
2. ✅ EOL-agnostic contract tests + `.gitattributes` (done)
3. ✅ Branch unification + `feat/phases-4-12-complete` cleanup (done)
4. Add repo-standard test entrypoints: `scripts/test.sh` (+ `.ps1` for Windows) wrapping
   syntax check + suite, used by CI and by contributors (single entrypoint, no drift).
5. Scripted stale-remote-branch cleanup (merged-only, reviewed list, then delete).
6. Bump CI actions to current majors; add `concurrency` cancel-in-progress.
7. Add RuboCop (relaxed, incremental) + `node --check ui/panel.js` to CI.
8. Enable branch protection on `main`: require `core-tests` + `build-rbz` green.
9. Delete stray `test.zip`.
10. Publish a GitHub Release for `v1.0.0` attaching the CI-built RBZ artifact.

### Phase 1 — Close the R0 native gate (highest product value)

Execute the native acceptance runbook checkpoints 1–8 in supported SketchUp/LayOut
versions (save/reopen identity, native Undo/Redo, copy identity, model observers,
migrations, interactive tools, scenes/styles/sections, LayOut/PDF), recording evidence
via the existing automatic evidence recorder. Exit: Gate F0–F3 native closures in STATUS.md.

### Phase 2 — R1 completion: Plan Editor + Smart Wall 2.0

Close remaining R1 deliverables from the roadmap (temporary dimensions, numeric input,
chain drawing, L/T/X join options, wall type/location-line breadth), then prove the
"multi-room wall plan without raw SketchUp tools" exit criterion natively.

### Phase 3 — R2 hosted architecture core

Door/Window/Opening 2.0, Floors, Ceilings, Rooms — most foundations exist; finish the
host lifecycle edge cases (host deletion/replacement resolution) and verify the
"complete simple residential level" exit gate in native SketchUp.

### Phase 4 — R3 parametric + constraints, then R4+ per roadmap

Parametric Object Engine and Constraint/Dependency Engine are already well advanced
(per STATUS.md). Continue the R4–R10 vertical-release sequence (roof/structure →
documentation → renovation/extension workflow → MEP coordination → surface/joinery →
BOQ/QA/publication → AI copilot) with one usable release per increment.

### Continuous engineering practices (all phases)

- Green-CI policy on `main`; no release commits with failing checks.
- Tool-contract guard extended to every new tool (already enforced by tests — keep it).
- Registration files: split by concern as modules grow; keep `main.rb` boot-only.
- UI and MCP-server: minimum automated checks + security review for the HTTP bridge.
- Docs: update `STATUS.md` only with evidence; keep application vs native evidence separated.

## 5. How to re-run this audit

```bash
# CI-equivalent verification (Ruby 3.2, Linux)
docker run --rm -v "$(pwd)":/work -w //work ruby:3.2 bash -c "
  find apps/sketchup-extension/constructflow/core apps/sketchup-extension/constructflow/modules -name '*.rb' -print0 | xargs -0 -n1 ruby -c > /dev/null &&
  ruby -Itest -Iapps/sketchup-extension -e 'Dir[\"test/**/*_test.rb\"].sort.each { |file| require_relative file }'"
```

Expected: `0 failures, 0 errors` and `SYNTAX OK`.
