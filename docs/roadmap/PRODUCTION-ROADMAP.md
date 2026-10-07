# ConstructFlow — Standalone Production Roadmap Entrypoint

The active production plan is [`../ROADMAP.md`](../ROADMAP.md), under
[`ADR-0006`](../decisions/ADR-0006-standalone-first-engine.md).
This entrypoint does not define a separate release sequence.

ConstructFlow owns the canonical `.cfproj` project, command runtime, geometry,
spatial validation, 2D/3D editing, phased takeoff and vector sheet compilation.
SketchUp, LayOut, AutoCAD and IFC/Revit are optional downstream adapters.

The initial engine delivery is S0–S5 in
[`STANDALONE-ENGINE-REVIEW-2026-10.md`](../STANDALONE-ENGINE-REVIEW-2026-10.md),
mapped to the R tracks in the active roadmap. Standalone reliability is verified
through local project roundtrip, command rollback/history, coordinated editing,
quantities and supported drawing outputs. External application verification gates
apply only to the adapter being delivered.

Current implementation evidence is in [`STATUS.md`](../STATUS.md).
Remaining specification work is in
[`FEATURE-PLAN-AUDIT-2026-10-07.md`](../FEATURE-PLAN-AUDIT-2026-10-07.md).
