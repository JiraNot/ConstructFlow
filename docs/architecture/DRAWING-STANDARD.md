# Drawing, Detail and Documentation Standard

Status: Accepted foundation contract for architecture; graphic standards remain configurable.

## Principle

The Drawing platform consumes semantic model representations provided by domain modules. It does not independently rediscover construction meaning from raw geometry.

The model is the source of truth; drawings are generated views/schedules/details with explicit dirty-state tracking.

## Drawing families

Initial supported families include:

### General / site

- cover / drawing index;
- existing site plan;
- demolition site plan;
- proposed site plan;
- location, north, benchmark and general notes.

### Architecture

- existing plan;
- demolition plan;
- proposed floor plan;
- roof plan;
- reflected ceiling plan where needed;
- elevations;
- sections;
- enlarged plans;
- door/window schedules;
- opening details;
- façade/decorative wall elevations.

### Structure

- pile/foundation plan;
- pile-cap/footing schedule;
- column/beam layout;
- ground-beam plan;
- slab plan;
- roof framing plan;
- steel/RC details;
- reinforcement details and BBS outputs.

### MEP

- lighting plan;
- power/outlet plan;
- logical control plan where required;
- water supply plan;
- waste/drainage plan;
- rainwater drainage plan;
- schedules/legends.

### Landscape / external

- landscape plan;
- paving setting-out plan;
- parking layout;
- spot levels/slope/drainage plan;
- landscape lighting/drainage where required.

### Interior / fabrication

- furniture/joinery plan;
- cabinet elevation;
- cabinet section;
- kitchen elevations;
- TV wall/feature wall details;
- shop drawings;
- exploded views;
- cut lists and hardware schedules.

## Phase view contract

Drawing views use lifecycle filters, not manual duplicate models.

- **Existing**: state before demolition/new work.
- **Demolition**: existing-to-remain plus demolition representation; new work hidden unless explicitly shown for context.
- **Proposed**: existing-to-remain plus new construction; demolished objects absent or optionally ghosted.
- **Coordination**: configurable view of all relevant states.

## Drawing state

Every generated drawing/view tracks:

```yaml
view_id: ...
source_object_ids: []
source_modules: []
phase_view: proposed
scale: 1:50
status: clean|dirty|error
last_generated_revision: ...
```

Relevant model events mark affected drawings `dirty`; users must not mistake stale drawing output for current model state.

## Domain drawing providers

A domain module can register representations such as:

```text
Structure → foundation plan geometry, beam tags, rebar detail data
Roof      → roof plan, frame layout, flashing/fascia detail references
Interior  → cabinet elevation, section, part IDs, hardware schedule
Surface   → paving lines, borders, origin/control lines, cut pieces
Drainage  → route centerlines, pipe IDs, invert/level annotations
```

Drawing platform owns sheet/view composition, annotation styles, numbering and export orchestration.

## Annotation primitives

Canonical primitives:

- dimension;
- text note;
- leader/callout;
- object tag;
- material tag;
- level marker;
- spot elevation;
- grid bubble;
- section mark;
- elevation mark;
- detail callout;
- revision marker/cloud;
- north arrow;
- scale/title label;
- schedule/table.

## Semantic annotation

Annotations should reference smart objects/parameters where possible rather than store disconnected text.

Example window tag:

`W01` references Door/Window type data and schedule row.

Changing type can update schedule without manually editing every tag.

## Scale / representation

Objects may expose drawing representations by scale/LOD:

- 1:100 — simplified;
- 1:50 — construction plan/elevation;
- 1:20 — enlarged assembly;
- 1:10 / 1:5 — detail/fabrication.

Exact scale mapping is configurable, but domain modules should not force unnecessary 3D detail into all drawings.

## Dimension behavior

Dimensions must prefer semantic references: wall faces/centerlines, grid, opening extents, cabinet module boundaries, structural axes, level points and setting-out controls.

Auto-dimension is assistive; generated dimensions remain inspectable and editable. QA can detect missing/invalid references after geometry changes.

## Level annotation

Use semantic level references for FFL, GL, IL, TOB/BOB, footing/pile levels etc. A level label should update when its referenced project level changes.

## Detail library

Construction details can be:

1. generated from model geometry;
2. parametric detail templates tied to assembly types;
3. approved static/company details with metadata.

Assembly/catalog selection can suggest compatible details, but a static detail must not falsely claim exact geometry synchronization unless it is actually parameter-driven.

## LayOut integration

LayOut is the initial sheet/document environment. ConstructFlow should support:

- template-based document creation;
- pages/sheets;
- SketchUp viewports/scenes;
- scale assignment;
- drawing title/number/revision metadata;
- schedule/detail placement where API support permits;
- PDF export.

Implementation must isolate LayOut-specific adapters so documentation contracts are not permanently tied to one renderer/exporter.

## Drawing numbering

Recommended configurable families:

```text
G-   General
SIT- Site
A-   Architecture
ST-  Structure
E-   Electrical
P-   Plumbing/Drainage
L-   Landscape
I-   Interior
D-   Detail
```

This is a default convention, not a hardcoded domain rule.

## Issue status

Drawings can be marked:

- Draft
- For Review / Approval
- For Construction
- As-Built
- Superseded

Issue status is independent from construction phase.

## Revision

Revision records identify drawing/model changes and issuance. Revision does not replace smart-object lifecycle. Generated outputs retain revision metadata so an issued set can be reproduced or audited.

## QA baseline

Drawing QA should detect at least:

- dirty/outdated source state;
- missing source object;
- invalid dimension reference;
- missing required tag/schedule row;
- view scale mismatch for required detail;
- duplicated drawing number;
- broken detail reference;
- missing phase filter;
- missing revision/issue metadata for issued documents.

## Export baseline

Initial exports:

- PDF drawing sets;
- CSV/XLSX-style schedule/BOQ data through appropriate adapters;
- DWG/DXF where supported and explicitly implemented;
- raster images as secondary presentation output.

Export must not silently clear dirty status unless regeneration succeeded against current source model state.