# SketchUp RBZ Build

Status: Implementation packaging workflow.

## Purpose

Produce an installable ConstructFlow `.rbz` from the repository so native SketchUp acceptance can be exercised against the same source that passed CI.

## Package layout

The RBZ root must contain exactly the SketchUp extension loader and extension directory:

```text
constructflow.rb
constructflow/
  bootstrap.rb
  main.rb
  core/
  modules/
```

Repository-only paths such as `apps/`, `docs/`, `test/`, `.github/` and development scripts must not be packaged.

## Local build

From the repository root:

```bash
bash scripts/build_rbz.sh
```

The default output name includes the `VERSION` declared in `apps/sketchup-extension/constructflow.rb`:

```text
dist/ConstructFlow-<version>.rbz
```

An explicit output path may be supplied:

```bash
bash scripts/build_rbz.sh dist/ConstructFlow.rbz
```

The build fails when:

- SketchUp extension source is missing;
- `VERSION` cannot be read;
- ZIP integrity fails;
- the RBZ root layout is unexpected;
- `constructflow/bootstrap.rb` is missing.

## CI artifact

`.github/workflows/build-rbz.yml` builds and validates an RBZ for pull requests, `main` pushes and manual workflow dispatches. It uploads `dist/ConstructFlow.rbz` as a GitHub Actions artifact retained for 30 days.

The artifact is intended for native acceptance and internal installation testing. A successful package build proves only package structure/integrity; it does not prove the extension boots successfully in SketchUp or that any native acceptance checkpoint passes.

## Native acceptance usage

Install the RBZ through SketchUp Extension Manager, then follow `docs/implementation/NATIVE-APPLICATION-ACCEPTANCE-RUNBOOK.md`.

Record actual native results through the ConstructFlow Native Acceptance evidence boundary. Do not mark a checkpoint passed merely because the RBZ build workflow is green.
