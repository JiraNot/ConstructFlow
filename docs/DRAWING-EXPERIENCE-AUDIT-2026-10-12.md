# Drawing experience audit — 12 October 2026

## Scope and user goal

Reviewed the interactive model authoring workspace with the wall and door tools, numeric placement, selection and inspector, North elevation, 3D view, and snapping controls. The user goal is to make day-to-day drawing feel familiar to a Revit user. The model used for the visual review was the wall/stair proof project, which I restored after the review.

## Step-by-step health

1. **Open plan view — Good foundation, crowded tags.** The view switcher, level/phase/unit controls, plan zoom and fit are easy to locate. On the proof model, wall tags crowd column symbols and wall lines, so the mark can be hard to associate with the right object. See [01-plan-idle.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/01-plan-idle.png).
2. **Start a wall — Good drawing controls, limited canvas room.** Wall type, placement reference, alignment constraint, snap, and live dimensions are present. The tool options sit over the lower canvas, and the cursor-following dimension box can cover the geometry being laid out. See [02-wall-tool.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/02-wall-tool.png) and [03-wall-start-dimensions.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/03-wall-start-dimensions.png).
3. **Set a wall length and inspect it — Good precision, dense inspector.** A 2 m segment could be entered from the keyboard. The selected wall's total thickness and core/plaster values are visible, alongside many other editable fields; grouping common properties and keeping the object header/actions visible would reduce scrolling. See [04-wall-properties.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/04-wall-properties.png).
4. **Open an elevation — Good view controls.** Elevation has its own fit, zoom slider, and level datum; it is easier to reframe than the 3D view. See [05-north-elevation.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/05-north-elevation.png).
5. **Inspect the model in 3D — Needs attention.** The model occupies a small part of the viewport and there is no visible Fit/Frame Selection control. Clicking a wall updates its properties and the plan selection, but the wall itself does not show a selection outline in 3D. See [06-3d-view.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/06-3d-view.png) and [07-3d-selected-wall.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/07-3d-selected-wall.png).
6. **Choose snap modes and place an opening — Good capability, inconsistent guidance.** Seven snap categories and a clear Ctrl free-placement hint are available. Door placement lists type, size, and keyboard hints, but those hints and the active drawing controls occupy different parts of the canvas. See [08-snap-settings.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/08-snap-settings.png) and [09-door-tool.png](C:/Users/Dulla-plan66/.codex/visualizations/2026/10/12/01a12e6b-71d4-7c03-9b8d-0972c42fc267/09-door-tool.png).

## Strengths

Core drafting already has useful BIM behaviors: snap modes, explicit placement references, alignment constraints, dimension entry in project units, wall core/finish information, per-level views, and selection grips. Plan, elevation, and 3D selection are connected to the same object properties.

## Highest-value small improvements

1. **Add 3D navigation actions:** show Fit Model, Frame Selection, and reset view buttons, plus standard selection feedback (outline/wash and hover indication). Add pan/zoom/orbit hints that remain visible. This is the largest gap from familiar BIM navigation.
2. **Make the active tool options dockable or collapsible:** keep them in a stable options bar above the canvas, and reposition live dimensions when they cover geometry. This gives more usable drawing area without removing rich controls.
3. **Prevent annotation collisions in plan:** detect when wall tags overlap columns or other tags, then offset the tag and draw a short leader. Keep the tag attached to the correct wall as the view zooms.
4. **Organize the properties panel around common tasks:** pin the selected object's name, type, level, and phase; group dimensions, constraints/host, finishes, and detailed parameters into collapsible sections. Make the scope of editing a type versus one instance explicit at the action.
5. **Standardize tool hints and keyboard coverage:** show one consistent hint strip for click sequence, Enter, Escape, and modifier keys for every drawing tool; expose matching keyboard help for the newer floor/ceiling/room-separator tools.

## Accessibility and evidence limits

Visible controls have names and many core tools expose keyboard shortcuts; the canvas also supplies a description for selection and overlapping objects. This visual audit did not test keyboard-only completion, screen-reader object navigation, touch targets on a tablet, or contrast with an automated checker. It inspected representative authoring interactions, not every structural/MEP tool, sheet composition, or export workflow. The recommendations above are UX opportunities from the captured states, not a claim of full accessibility compliance.

## Recommended order

Start with 3D fit/selection feedback, then reduce drawing overlays and avoid tag collisions. After those changes, review the inspector hierarchy and keyboard guidance across the remaining tools.
