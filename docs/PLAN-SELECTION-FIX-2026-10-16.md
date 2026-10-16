# Floor-plan visibility and overlapping selection — 2026-10-16

## Changes

- Architectural floor plans exclude ceilings from rendering, pointer picking, marquee selection and snap candidates by using one filtered plan snapshot. Explicit ceiling/ceiling-void authoring temporarily includes ceilings. RCP and the default `all` representation retain their existing scope.
- Plan picking is calculated in `representation-engine`, using generic geometry helpers in `geometry-kernel`. The canvas receives an ordered candidate list in one call instead of enumerating hits repeatedly and then overriding their order by family.
- Openings use the clear wall span, frame/leaf linework and swing arcs rather than a large invisible circular area. Two-leaf hinged doors use half-width swings. Sliding/fixed doors do not acquire a hinged swing.
- Visible geometry within an 8 px tolerance is ranked by distance, with family priority used within 2 px distance bands. Enclosing floor/room interiors follow nearby geometry; surface void interiors are excluded. Rotated columns use their rotated footprints.
- Geometry is cached by the immutable plan/source snapshots, with bounding-box rejection before detailed distance checks.
- Normal hover follows the best current candidate. Explicit Tab/list selection remains usable within 6 px of its acquisition point, preserving cyclic candidate order. Moving away, changing tool/model, or clearing selection releases that preference.
- The existing overlap selector uses shared short Thai family labels, grid tags and stable local numbers when multiple candidates have the same label. Tab, Shift+Tab, arrow buttons and the selector remain available.

## Contracts

No persisted schema, UUID, marks, object types, phases, model mutation commands or history contracts changed. Visibility and pick geometry are derived presentation data. No project data is rewritten by these changes.

## Changed files

- `packages/geometry-kernel/src/picking.ts`
- `packages/geometry-kernel/src/index.ts`
- `packages/representation-engine/src/planPicking.ts`
- `packages/representation-engine/src/index.ts`
- `apps/plan-editor/src/components/planHitTesting.mjs`
- `apps/plan-editor/src/components/planHitTesting.d.mts`
- `apps/plan-editor/src/components/usePlanCanvasController.ts`
- `apps/plan-editor/src/components/usePlanCanvasPicking.ts`
- `apps/plan-editor/src/components/handlePlanCanvasAuthoringPointerMove.ts`
- `apps/plan-editor/src/components/handlePlanCanvasSelectionPointerDown.ts`
- `apps/plan-editor/src/components/usePlanCanvasSurfaceOverlays.ts`
- `apps/plan-editor/src/components/PlanCanvasInteractionHints.tsx`

## Verification and limits

- `npm run build --prefix packages/geometry-kernel` — passed.
- `npm run build --prefix packages/representation-engine` — passed.
- `npm run build --prefix apps/plan-editor` — passed; final Vite build 11.75 s. Existing LibreDWG externalization and large-chunk warnings remain.
- `git diff --check` — passed.
- No automated tests were added or run in this change. Browser interaction acceptance and physical-device checks have not been performed for this implementation.
- Detailed decorative door profiles and screen-scaled rendering details can differ from the canonical opening linework. Manual selection around unusual custom opening symbols remains a follow-up check.
- Next check: floor/ceiling overlap, door next to stairs, room/floor interiors and voids, explicit Tab/list choice followed by drag, and RCP selection on a real project.
