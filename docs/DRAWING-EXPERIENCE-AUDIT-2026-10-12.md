# Drawing experience audit — 12 October 2026

## Scope and user goal

Reviewed the interactive model authoring workspace with the wall and door tools, numeric placement, selection and inspector, North elevation, 3D view, and snapping controls. The user goal is to make day-to-day drawing feel familiar to a Revit user. The model used for the visual review was the wall/stair proof project, which I restored after the review.

## Step-by-step health

1. **Open plan view — Good foundation, crowded tags.** The view switcher, level/phase/unit controls, plan zoom and fit are easy to locate. On the proof model, wall tags crowd column symbols and wall lines, so the mark can be hard to associate with the right object. See [01-plan-idle.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/01-plan-idle.png).
2. **Start a wall — Good drawing controls, limited canvas room.** Wall type, placement reference, alignment constraint, snap, and live dimensions are present. The tool options sit over the lower canvas, and the cursor-following dimension box can cover the geometry being laid out. See [02-wall-tool.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/02-wall-tool.png) and [03-wall-start-dimensions.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/03-wall-start-dimensions.png).
3. **Set a wall length and inspect it — Good precision, dense inspector.** A 2 m segment could be entered from the keyboard. The selected wall's total thickness and core/plaster values are visible, alongside many other editable fields; grouping common properties and keeping the object header/actions visible would reduce scrolling. See [04-wall-properties.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/04-wall-properties.png).
4. **Open an elevation — Good view controls.** Elevation has its own fit, zoom slider, and level datum; it is easier to reframe than the 3D view. See [05-north-elevation.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/05-north-elevation.png).
5. **Inspect the model in 3D — Improved after the initial capture.** The original screenshots show the small initial framing and missing selection feedback. The editor now has Fit Model and Frame Selection controls, plus hover and selected-object outlines. These updates were verified against the restored sample model after the screenshots were captured.
6. **Choose snap modes and place an opening — Good capability, inconsistent guidance.** Seven snap categories and a clear Ctrl free-placement hint are available. Door placement lists type, size, and keyboard hints, but those hints and the active drawing controls occupy different parts of the canvas. See [08-snap-settings.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/08-snap-settings.png) and [09-door-tool.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/09-door-tool.png).

## Strengths

Core drafting already has useful BIM behaviors: snap modes, explicit placement references, alignment constraints, dimension entry in project units, wall core/finish information, per-level views, and selection grips. Plan, elevation, and 3D selection are connected to the same object properties.

## Improvement status

1. **3D navigation and selection — Implemented.** Fit Model and Frame Selection controls are available, and selected/hovered objects receive a visible outline. The current view also presents basic navigation guidance.
2. **Drawing overlays — Implemented.** Active tool options can collapse, and live dimensions move to the opposite side of the cursor when needed to keep the target geometry visible.
3. **Plan annotation collisions — Improved.** Wall labels search farther placement offsets and retain a leader to the wall anchor when nearby marks occupy the preferred position. Dense or unusual geometry still merits broader model testing.
4. **Properties hierarchy — Implemented for the wall inspector.** Object identity, type, level and phase stay in the header; wall finishes, hosted openings and setback details are grouped into collapsible sections. Other object inspectors still need a family-by-family review.
5. **Tool hints and shortcuts — Improved.** Placement hints describe the active drawing step and Enter/Escape behavior; arch-floor, ceiling, room-separator and grid-system shortcuts are exposed. Global tool shortcuts now yield to a focused native level selector so its letter type-ahead and Escape behavior continue to work.

## Accessibility and evidence limits

Visible controls have names and many core tools expose keyboard shortcuts; the canvas also supplies a description for selection and overlapping objects. A focused regression check verified native level-selector type-ahead and Escape handling. This audit did not test full keyboard-only completion, screen-reader object navigation, tablet touch targets, or contrast with an automated checker. It inspected representative authoring interactions, not every structural/MEP tool, sheet composition, or export workflow; this is not a claim of full accessibility compliance.

## Verification follow-up — 12 October 2026

The 3D controls and selection feedback were inspected in the running editor. The wall inspector's finish, hosted-opening and setback disclosures were opened and verified. The level selector was tested with letter-key selection and Escape while a drawing tool was active; the selected tool remained active and the project level was restored afterward.

`apps/plan-editor`: production build passed and 24 tests passed. The selected engine and output suites passed 188 tests; `npm run verify:coordination` passed 47 checks. The Vite build still reports large application/PDF/Three.js chunks. Other inspector families, all authoring tools, sheet composition and export remain outside this interaction pass.
