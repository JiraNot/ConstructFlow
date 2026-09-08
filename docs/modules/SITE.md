# Site & Survey Module

Status: Proposed v1  
Module ID: `constructflow.site`

## Mission

Own site context, survey references and existing/proposed ground information used by renovation, extension, landscape, structure and drainage workflows.

## Owns

- SiteBoundary
- Benchmark
- SurveyPoint
- ExistingGroundRegion
- ProposedGroundRegion
- RoadEdge
- SetbackReference
- UtilityReference

## Does not own

- architectural walls/floors;
- drainage network topology;
- structural foundations;
- detailed paving layouts.

## Required dependencies

- Core Project / Units / Levels / Phase

Optional capabilities:

- Surface for proposed grading/paving;
- Drainage for site drains;
- Drawing for site plans.

## Key parameters

SiteBoundary:

- closed boundary geometry;
- parcel/site identifier;
- source confidence;
- optional legal/reference notes.

SurveyPoint:

- X/Y or local coordinates;
- elevation;
- confidence/source;
- code/description.

Benchmark:

- project datum relation;
- physical description;
- confirmed/assumed state.

GroundRegion:

- boundary;
- spot/control elevations;
- existing/proposed state.

## Commands

- `CreateSiteBoundary`
- `PlaceBenchmark`
- `CreateSurveyPoint`
- `ImportSurveyReference`
- `SetSurveyConfidence`
- `CreateGroundRegion`
- `ModifyGroundControlPoint`

## Events

Emits:

- SiteBoundaryChanged
- SurveyPointChanged
- BenchmarkChanged
- GroundReferenceChanged

Consumes:

- LevelChanged where site references depend on project datum.

## Phase behavior

Site references may be Existing or New where appropriate. Survey facts are not themselves demolition scope, but referenced physical objects/utilities can carry lifecycle through their owner modules.

## Level behavior

Site uses project Benchmark/GL and spot elevations. Raw Z is always interpretable relative to project datum.

## UX

Primary flows:

- trace/import site boundary;
- set benchmark;
- place/import survey points;
- mark confidence;
- display spot levels;
- establish existing/proposed ground references.

## Quantity

Foundation phase: no mandatory BOQ output. Advanced earthwork may provide cut/fill volumes through a future Site/Surface capability.

## Drawing

Provides:

- site boundary;
- road/setback references;
- benchmark/north/source annotations;
- survey/spot level symbols;
- existing/proposed ground references.

## QA

- open/non-closed site boundary;
- duplicate/conflicting benchmark;
- unknown unit on import;
- survey point with unresolved datum;
- proposed ground with invalid control geometry.

## Acceptance criteria

- AC-SITE-001: site boundary persists and reopens with stable ID.
- AC-SITE-002: benchmark change invalidates dependent level/site output.
- AC-SITE-003: assumed/unknown survey data remains explicitly uncertain.
- AC-SITE-004: imported unit ambiguity requires confirmation.

## Deferred

- point-cloud processing;
- terrain meshing at civil-software scale;
- full geospatial/GIS coordinate transformation;
- automated licensed survey validation.