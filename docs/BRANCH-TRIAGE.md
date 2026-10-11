# Feature Branch Triage — `feat/*` vs `main`

Status: **verified 2026-10-11** against `origin/main` @ `9a44c71`.

Reproduce with:

```bash
npm run verify:branches          # text report, exit 1 when a branch holds files main lacks
npm run verify:branches -- --json
```

## Verdict

**Do not merge these branches.** All 24 `feat/*` branches are stale snapshots of work that was
already landed into `main` by squash (the repository has 64 merged PRs). Their commit tips are not
ancestors of `main`, but their *content* is present in `main` — usually under newer file names.

Merging any of them would roll `main` back to that branch's fork date (2026-09-08 – 2026-09-11) and
delete the work landed since:

| Metric | Value |
| :--- | :--- |
| Feature branches outside `main` | 24 |
| Commits `main` is ahead, per branch | 91 – 686 |
| Commits each branch has that `main` lacks | 1 – 21 |
| Files touched per branch (vs its merge-base) | 1 – 21 |
| Deletions a **single** naive merge would introduce | 139,092 – 181,806 |
| Deletions summed across all 24 merges | 3,963,498 |

Only **20 unique file paths** (22 rows, three branches share one test file) exist on a branch and
**not** in `main`. Everything else is already represented.

Two of those features were genuinely missing from `main` and have since been **ported as ordinary
reviewed work** rather than merged — see [Ported work](#ported-work-2026-10-11).

## Per-branch evidence

`SAME` = byte-identical blob in `main`; `MOVED` = present in both but `main` evolved it;
`ONLY-BR` = exists only on the branch; `MERGE DEL` = deletions a naive `git merge` would cause.

| Branch | Tip | main ahead | branch ahead | SAME | MOVED | ONLY-BR | MERGE DEL |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| `feat/architecture-smart-wall-v1` | `30b0b6b` 09-08 | 685 | 12 | 2 | 10 | 0 | 181,267 |
| `feat/domain-vertical-slice-v1` | `ae8ad3e` 09-10 | 669 | 7 | 0 | 0 | 5 | 167,870 |
| `feat/door-window-infill-v1` | `fa684c0` 09-08 | 683 | 16 | 5 | 10 | 0 | 178,621 |
| `feat/drainage-relocate-manhole-v1` | `a7fddaa` 09-08 | 682 | 14 | 3 | 11 | 0 | 176,863 |
| `feat/extension-door-window-infill-v1` | `dc14de0` 09-10 | 254 | 1 | 0 | 1 | 0 | 148,243 |
| `feat/extension-existing-conflict-scan-v1` | `684e174` 09-10 | 274 | 10 | 0 | 5 | 4 | 149,213 |
| `feat/extension-generator-v1` | `767416f` 09-10 | 674 | 9 | 0 | 6 | 1 | 168,261 |
| `feat/extension-orchestration-v1` | `2a0f601` 09-10 | 670 | 8 | 4 | 4 | 0 | 167,870 |
| `feat/extension-roof-gutter-v1` | `845623c` 09-10 | 220 | 4 | 0 | 2 | 1 | 146,661 |
| `feat/extension-roof-v1` | `56ee213` 09-08 | 681 | 19 | 12 | 7 | 0 | 175,243 |
| `feat/foundation-core-v1` | `0c047c6` 09-08 | 686 | 21 | 6 | 15 | 0 | 181,806 |
| `feat/hosted-gutter-regeneration-v1` | `b3f55b8` 09-11 | 202 | 7 | 0 | 3 | 4 | 145,596 |
| `feat/interior-joinery-v1` | `a7f3314` 09-08 | 677 | 15 | 4 | 7 | 0 | 169,709 |
| `feat/layout-template-registry-v1` | `e826136` 09-10 | 546 | 8 | 0 | 7 | 1 | 162,423 |
| `feat/library-catalog-v1` | `e66e1ee` 09-09 | 676 | 11 | 8 | 2 | 0 | 168,480 |
| `feat/native-layout-acceptance-evidence-v1` | `3271402` 09-11 | 91 | 8 | 0 | 7 | 1 | 139,092 |
| `feat/opening-host-v1` | `c6377e8` 09-08 | 684 | 18 | 7 | 10 | 0 | 180,030 |
| `feat/roof-attachment-junction-v1` | `635300a` 09-10 | 236 | 2 | 0 | 1 | 1 | 147,344 |
| `feat/roof-idempotent-v1` | `723c94e` 09-10 | 651 | 5 | 0 | 3 | 2 | 167,153 |
| `feat/roof-plan-representation-v1` | `143618f` 09-10 | 546 | 18 | 0 | 15 | 1 | 162,097 |
| `feat/structure-foundation-rebar-v1` | `0958542` 09-08 | 680 | 14 | 3 | 10 | 0 | 173,813 |
| `feat/structure-plan-representation-v1` | `a14a1ae` 09-10 | 546 | 13 | 0 | 11 | 1 | 162,241 |
| `feat/surface-layout-solver-v1` | `58e0223` 09-08 | 678 | 10 | 3 | 6 | 0 | 171,363 |
| `feat/surface-paving-v1` | `ab6699d` 09-08 | 679 | 12 | 5 | 7 | 0 | 172,239 |

## The 20 branch-only files

Counterparts below are the closest file in `main`; "superseded" means `main` carries the same
capability under a newer name or a redesigned contract.

### Superseded by redesigned work in main (18 of 20)

| Branch-only file | Branch | Counterpart in `main` |
| :--- | :--- | :--- |
| `.../modules/extension/execution_engine.rb` | `domain-vertical-slice-v1` | `modules/extension/execution_runner.rb`, `docs/implementation/EXTENSION-EXECUTION-v1.md` |
| `.../modules/extension/execution_result.rb` | `domain-vertical-slice-v1` | folded into `execution_runner.rb` |
| `.../modules/extension/domain_handlers.rb` | `domain-vertical-slice-v1` | `modules/extension/generator.rb`, `orchestrator.rb` |
| `docs/implementation/DOMAIN-VERTICAL-SLICE-v1.md` | `domain-vertical-slice-v1` | `docs/implementation/EXTENSION-EXECUTION-v1.md`, `EXTENSION-ORCHESTRATION-v1.md` |
| `test/extension/execution_engine_test.rb` | `domain-vertical-slice-v1` | `test/extension/execution_runner_test.rb` |
| `test/extension/orchestrator_test.rb` | `extension-generator-v1` | `test/extension/orchestration_test.rb`, `orchestrator_dependency_test.rb` |
| `.../modules/roof/extension_gutter_service.rb` | `extension-roof-gutter-v1` | `modules/roof/hosted_gutter_regenerator.rb` |
| `.../modules/roof/hosted_gutter_registration.rb` | `hosted-gutter-regeneration-v1` | `modules/roof/rainwater_registration.rb`, `registration.rb` |
| `.../modules/drainage/downpipe_endpoint_sync_service.rb` | `hosted-gutter-regeneration-v1` | `modules/drainage/rainwater_downpipe_service.rb` |
| `.../modules/drainage/downpipe_endpoint_sync_registration.rb` | `hosted-gutter-regeneration-v1` | `modules/drainage/rainwater_downpipe_registration.rb` |
| `test/drainage/downpipe_endpoint_sync_service_test.rb` | `hosted-gutter-regeneration-v1` | `test/roof/hosted_gutter_regenerator_test.rb` |
| `test/core/native_layout_export_service_test.rb` | `layout-template-registry-v1`, `roof-plan-representation-v1`, `structure-plan-representation-v1` | `test/core/native_layout_adapter_test.rb`, `layout_template_registry_test.rb`, `layout_export_plan_builder_test.rb` |
| `test/core/native_acceptance_layout_evidence_test.rb` | `native-layout-acceptance-evidence-v1` | `test/core/native_acceptance_auto_evidence_test.rb`, `native_acceptance_evidence_store_test.rb`, `docs/architecture/NATIVE-APPLICATION-ACCEPTANCE-EVIDENCE.md` |
| `test/roof/extension_command_registration_test.rb` | `roof-idempotent-v1` | `test/roof/roof_domain_test.rb`; `modules/roof/extension_command_registration.rb` exists in main |
| `docs/implementation/ROOF-IDEMPOTENT-REGENERATION-v1.md` | `roof-idempotent-v1` | `docs/architecture/ROOF-RAINWATER-REGENERATION.md` |

Notes on the gutter/downpipe family: `main`'s `HostedGutterRegenerator` documents exactly the
branch intent — "keeps Roof-owned gutter geometry and outlet connector positions converged with the
current host Roof definition", delegating downpipe regeneration to the Drainage capability.

### Genuinely absent from main (2 features) — both now ported

| Branch | Branch-only files | Evidence of absence in `main` |
| :--- | :--- | :--- |
| `feat/roof-attachment-junction-v1` | `.../modules/roof/roof_junction_definition.rb` | `git grep -i junction` over `apps/sketchup-extension` returns **no** matches; no `flashing`/upstand junction model exists in the Ruby roof module |
| `feat/extension-existing-conflict-scan-v1` | `.../modules/extension/existing_conflict_scan.rb`, `docs/architecture/EXTENSION-EXISTING-CONFLICT-SCAN.md`, `test/extension/existing_conflict_scan_test.rb`, `test/extension/existing_conflict_quality_gate_test.rb` | no file in `main` matches `conflict_scan`/`existing_conflict`, and no doc contains "existing construction conflict"; `main`'s `ConstructionCurrentnessAudit` audits takeoff/drawing currentness, not footprint overlap |

The two features are real work, not duplicates:

- **Roof junction**: `RoofJunctionDefinition` models `new_roof_to_existing_wall` junctions with
  `flashing_profile` (`wall_apron`, `counter_flashing`, `custom`), material, `upstand_mm` (150) and
  `cover_mm` (150) — the waterproofing detail at the wall/roof junction.
- **Existing conflict scan**: semantic, non-destructive scan of `existing`-phase
  `structure.column`, `structure.foundation`, `drainage.manhole` and `drainage.pipe_route` objects
  whose construction footprint intersects the proposed `extension.zone`, gating the package as not
  construction-ready while conflicts remain.

## Ported work (2026-10-11)

Cherry-picking the branch commits onto `main` is not viable: both branches were written against an
older `Repository`/runtime API that `main` has since reworked. The semantics were ported instead and
the branch tests were kept as the acceptance criteria.

### Roof junction & flashing (from `feat/roof-attachment-junction-v1`)

| Change | Path |
| :--- | :--- |
| New definition | [roof_junction_definition.rb](apps/sketchup-extension/constructflow/modules/roof/roof_junction_definition.rb) |
| Persistence | [repository.rb](apps/sketchup-extension/constructflow/modules/roof/repository.rb) — `read_junction` / `write_junction` |
| Command + manifest | [registration.rb](apps/sketchup-extension/constructflow/modules/roof/registration.rb) — `SetRoofJunction`, event `RoofJunctionSet` |
| Load graph | [main.rb](apps/sketchup-extension/constructflow/main.rb), [test_helper.rb](test/test_helper.rb) |
| Tests | [roof_junction_test.rb](test/roof/roof_junction_test.rb), [bootstrap_test.rb](test/runtime/bootstrap_test.rb) |

Beyond the branch's definition-plus-repository pair, the port adds what `main` requires to make the
feature reachable: a typed `SetRoofJunction` command on the Command Bus, host/junction validation
(the host must be an `architecture.wall` for `new_roof_to_existing_wall`, the edge index must exist,
and the stored path must follow the addressed roof edge), idempotent host relationship replacement,
`RoofJunctionSet` events, and dirty flags for quantity/drawing.

### Existing construction conflict scan (from `feat/extension-existing-conflict-scan-v1`)

| Change | Path |
| :--- | :--- |
| New scan | [existing_conflict_scan.rb](apps/sketchup-extension/constructflow/modules/extension/existing_conflict_scan.rb) |
| Quality gate wiring | [construction_quality_gate.rb](apps/sketchup-extension/constructflow/modules/extension/construction_quality_gate.rb) — `conflict_scan:` + `existing_conflict_issues` |
| Workflow wiring | [construction_workflow_runner.rb](apps/sketchup-extension/constructflow/modules/extension/construction_workflow_runner.rb) — runs the scan before QA and returns `conflict_scan` |
| Contract doc | [EXTENSION-EXISTING-CONFLICT-SCAN.md](docs/architecture/EXTENSION-EXISTING-CONFLICT-SCAN.md) |
| Tests | [existing_conflict_scan_test.rb](test/extension/existing_conflict_scan_test.rb), [existing_conflict_quality_gate_test.rb](test/extension/existing_conflict_quality_gate_test.rb) |

Not ported from that branch: its `coordination_plan.rb` change that adds an `architecture` intent.
That is a separate capability (generating architecture intents for an extension), and `main` already
tracks `architecture` in `ConstructionIntentStore::DOMAINS` and serves architecture issue sets
through `ConstructionIssueSetFactory`. It remains an open candidate if extension-generated walls are
wanted from the coordination plan.

## Remaining branch hygiene

1. Delete the stale remote branches once each is either ported or explicitly rejected; nothing else
   on those 24 branches is outstanding.
2. Re-run `npm run verify:branches` after this work is committed: until then the script still reads
   `origin/main`, where the two ported files do not exist yet, and keeps reporting the original
   22 rows.

## Verification of the ported work

Ruby 3.2.3 is available here only through WSL, which matches the CI toolchain
(`.github/workflows/core-tests.yml` uses `ruby-version: '3.2'`). Full suite command, both runs
identical apart from the new files:

```bash
wsl -e bash -lc 'cd /mnt/d/APP/ConstructFlow && bash scripts/test.sh'
```

| Run | Result |
| :--- | :--- |
| `main` before the port | 811 runs, 7820 assertions, **4 failures**, 0 errors |
| After the port | 826 runs, 7894 assertions, **4 failures**, 0 errors |
| New coverage | 15 tests / 73 assertions, all passing (roof junction 9, conflict scan 3, conflict quality gate 2, boot registration 1) |

The 4 failures are pre-existing and unrelated: `PlanDrivenUpgradeDocumentTest` in
`test/docs/plan_driven_upgrade_document_test.rb` asserts prose that `README.md`,
`docs/PLAN-DRIVEN-MODELING-UPGRADE.md`, `docs/ROADMAP.md` and `docs/IMPLEMENTATION-ENTRYPOINT.md`
no longer contain. They fail identically before and after this work and are not caused by it.

The first attempt at the command test ran inside `test/runtime/bootstrap_test.rb` and failed one
unrelated door/window end-to-end test: the runtime-level tests share a single global `Runtime` and
model, so objects created by one test leak into another and fail whenever the random seed puts them
in that order. The command behaviour is now covered against an isolated runtime built from
`build_test_runtime`, and `bootstrap_test.rb` only asserts that boot registers `SetRoofJunction`.

## Limitations of this verification

- Classification is per-path blob comparison against `main`. A "superseded" verdict is based on the
  file's path, its header/contract and the architecture docs in `main`; it is a strong signal, not a
  behavioural diff. Confirm any file you intend to discard.
- `npm run verify:branches` exits **1** while any branch holds a file `main` lacks. That exit status
  is a triage signal (currently 22 rows / 20 unique paths), not a regression in the build.
- The report reads `origin/main` as fetched locally; run `git fetch --prune` first if the remote may
  have moved.
- On Windows Git Bash, `git` arguments containing `<ref>:<path>` are corrupted by MSYS path
  conversion. This script uses `execFileSync` with argument arrays (no shell) and is unaffected; do
  not copy the commands into a shell loop without `MSYS_NO_PATHCONV=1`.
