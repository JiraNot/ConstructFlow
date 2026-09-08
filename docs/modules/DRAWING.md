# Drawing & Documentation Platform

Status: Proposed v1  
Module ID: `constructflow.drawing`

## Mission

Compose semantic domain representations into construction drawings, schedules, details, LayOut sheets and exportable drawing sets while tracking source state and revision.

## Owns

- DrawingView
- DrawingSheet
- ViewportBinding
- Annotation
- DimensionReference
- TagReference
- Schedule
- DetailReference
- DrawingSet
- ExportJob metadata

## Dependencies

Required:

- Core identity/phase/level;
- Drawing Provider contract.

Optional:

- LayOut adapter;
- Revision/Issue;
- Library Detail assets;
- export adapters.

## Phase views

DrawingView must declare phase filter:

- Existing;
- Demolition;
- Proposed;
- Coordination.

It must derive from one project model and never require separate phase model copies.

## Source tracking

Drawing views/schedules persist source smart-object IDs or query/provider definitions plus generated state/hash/revision metadata.

A source change marks affected view/schedule dirty.

## View types

- plan;
- roof plan;
- reflected ceiling plan;
- elevation;
- section;
- enlarged plan;
- detail;
- schedule/table;
- fabrication/shop view.

## Annotation types

- dimension;
- note;
- leader;
- object/type tag;
- material tag;
- level marker;
- spot elevation;
- grid bubble;
- section/elevation/detail callout;
- revision marker/cloud;
- north arrow;
- title/scale label.

Semantic annotation should reference object parameters rather than duplicate plain text where possible.

## Drawing provider integration

Examples:

- Architecture → wall/opening/room representation;
- DoorWindow → type symbols/schedule;
- Structure → framing/RC/rebar details;
- Surface → paving setting-out/control lines;
- Drainage → routes/inverts;
- Interior → cabinet elevation/parts.

Drawing platform owns composition, not domain formulas.

## Commands

- `GenerateDrawingView`
- `RegenerateDrawingView`
- `GenerateSchedule`
- `CreateDrawingSheet`
- `PlaceViewOnSheet`
- `GenerateDrawingSet`
- `CreateDetailCallout`
- `UpdateDirtyDrawings`
- `ExportDrawingSet`

## LayOut adapter

Initial adapter should support where API permits:

- create/open template document;
- page/sheet creation;
- SketchUp viewport/scenes;
- scale;
- title metadata;
- schedule/detail placement;
- PDF export.

LayOut-specific code remains behind adapter interface.

## Scale/LOD

Domain providers may expose simplified/detailed representations based on drawing scale. Drawing platform passes requested scale/context and does not force global high-detail model geometry.

## Dimensions

Dimension references should use semantic anchors such as:

- wall face/centerline;
- opening extent;
- grid;
- structural axis;
- cabinet divider;
- surface control line;
- level point.

If source reference disappears, dimension becomes broken/dirty and QA reports it.

## Schedules

Initial schedule families:

- door/window;
- material/finish where implemented;
- structural/rebar/BBS;
- electrical fixture;
- plumbing/drainage;
- joinery/cut-list/hardware;
- BOQ references.

## Issue/revision

Drawing issue status:

- Draft;
- For Review/Approval;
- For Construction;
- As-Built;
- Superseded.

Revision metadata is consumed from Revision service and remains separate from construction phase.

## Export rules

Issued export must:

- detect required dirty views;
- warn/block according to policy;
- record drawing set revision/status;
- not clear dirty flags unless regeneration succeeded;
- produce deterministic naming/numbering based on project template.

## QA

- dirty required view;
- broken dimension/tag reference;
- duplicate sheet/drawing number;
- missing phase filter;
- schedule row missing source;
- detail callout target missing;
- inappropriate scale/representation warning;
- issued set missing revision/status metadata.

## Acceptance criteria

- AC-DRAW-001: generate Existing and Proposed plans from one semantic model using phase filters.
- AC-DRAW-002: relevant model change marks linked view/schedule dirty.
- AC-DRAW-003: semantic window tag updates after type change without manual text edit.
- AC-DRAW-004: broken source reference is reported, not silently frozen.
- AC-DRAW-005: domain module can add drawing representation without editing Drawing core switch statements.
- AC-DRAW-006: dirty issued set warns/blocks export under project policy.
- AC-DRAW-007: LayOut adapter is replaceable and not required by domain modules.
- AC-DRAW-008: joinery shop drawing and paving setting-out can use the same platform shell with domain-specific providers.