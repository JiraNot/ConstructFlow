# Native Application Acceptance Runbook

Status: Implementation runbook for real SketchUp/LayOut verification.

## Purpose

Run this checklist in supported desktop SketchUp/LayOut builds after the application-level Construction Workflow v1 proof is green. The objective is to collect real native evidence, not to repeat pure-Ruby CI.

## Preparation

Use a disposable acceptance project that contains at least:

- one Existing Architecture host wall;
- one Extension with generated Architecture/Structure/Roof/Surface content;
- one explicit attachment Opening/optional Door-Window infill;
- one reviewed Roof rainwater outlet connected to an in-scope Drainage downpipe;
- at least one Electrical and Interior object;
- current A/S/R/P/L/I/E construction scenes.

Save the model before starting.

## 1. Save / close / reopen identity

1. Open `Extensions > ConstructFlow > Native Acceptance > Capture Save/Reopen Baseline`.
2. Save the `.skp`.
3. Close/reopen the model, or restart SketchUp and reopen it.
4. Run `Verify Save/Reopen`.
5. The checkpoint passes only if project ID, Smart Object IDs, baseline scenes and managed `CF-*` tags survive.

Do not accept a same-runtime `requires_reopen` result as evidence.

## 2. Undo / Redo semantic + geometry

Use a representative mutation such as moving a Drainage route grip, modifying a Smart Wall, or changing a generated construction parameter.

Verify manually:

- one Undo restores both geometry and semantic metadata;
- Redo restores both again;
- no duplicate Smart Object IDs appear;
- dependent dirty state remains coherent.

Record `undo_redo_semantic_geometry` only after observing this in SketchUp.

## 3. Native copy identity

Copy/paste or Move+Copy a representative Smart Object in SketchUp.

Verify that the duplicated production object does not retain the original Smart Object ID after ConstructFlow identity handling. Record `native_copy_identity` only from observed native behavior.

## 4. New / Open observer

Create a new SketchUp model, then reopen the acceptance model without restarting the extension.

Verify Runtime attaches to the correct active model, project ID and Smart Object index. Record `observer_new_open`.

## 5. Migration fixture

Open each supported migration fixture in real SketchUp and verify persisted attributes migrate/read correctly. Record `migration_fixture` with fixture/version notes.

## 6. Interactive tools

Exercise representative native tools/handles:

- Smart Wall draw/modify;
- Opening placement;
- Structure placement where applicable;
- Drainage route-node drag editing.

Verify native input, inference, cancel/commit and Undo behavior. Record `interactive_tools`.

## 7. Scene / tag persistence

Generate/refresh the representative issue-set scenes, save/reopen, and confirm:

- expected scene names remain;
- managed drawing tags remain;
- lifecycle/style tags remain;
- top/parallel/view presentation remains appropriate;
- unrelated user tags were not mutated.

Record `scene_tag_persistence`.

## 8. Real LayOut / PDF

Using a supported company/template asset, exercise the native LayOut path:

- create/open the LayOut document;
- create pages/viewports from the issue set;
- bind SketchUp scenes;
- verify viewport scale/render mode;
- populate title block/revision placeholders;
- save `.layout`;
- export PDF;
- inspect the resulting sheets visually.

Record `layout_pdf_export` with SketchUp/LayOut version, template version/hash and output paths.

## Recording checkpoints

The public command is:

```ruby
JiraNot::ConstructFlow::Runtime.commands.execute(
  'RecordNativeAcceptanceCheckpoint',
  input: {
    checkpoint_id: 'interactive_tools',
    status: 'passed',
    notes: 'Verified in SketchUp <version>',
    evidence: { operator: '<name>', application_version: '<version>' }
  }
)
```

Do not mark a checkpoint `passed` based only on source review or CI. `skipped` remains incomplete.

## Exit criterion

`Runtime.native_acceptance.summary['complete']` is true only when every required checkpoint has explicit native evidence and status `passed`.
