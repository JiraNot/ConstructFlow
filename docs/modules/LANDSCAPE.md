# Landscape Module

Status: Proposed v1  
Module ID: `constructflow.landscape`

## Mission

Own landscape design semantics used in residential renovation/extension projects while delegating paving construction to Surface and utility networks to MEP modules.

## Owns

- PlantingBed
- PlantInstance
- TreeInstance
- ShrubInstance
- GroundcoverZone
- Planter
- LandscapeAssembly
- GardenFurniturePlacement
- Fountain/WaterFeature intent
- TreePit semantic intent where not already embedded in Surface

## Dependencies

Required:

- Core;
- Site/Levels for external context.

Optional:

- Surface for paths/paving/tree-pit cutouts;
- Electrical for garden lighting;
- Plumbing for water points;
- Drainage for drains;
- Library for plants/furniture/materials.

## Plant assets

Plant objects should support:

- species/common name;
- nominal spread/height;
- placement;
- presentation proxy/high-detail variant;
- quantity unit;
- optional growth/mature-size metadata;
- catalog/source metadata.

## Planting beds

Parameters:

- arbitrary closed boundary;
- soil/planting assembly metadata;
- species/group mix;
- mulch/stone/groundcover finish;
- level/slope relation where required.

## Garden paths

Landscape owns design intent and can invoke Surface path-based paving capability for construction setting-out.

## Garden structures

Pergolas/screens/walls may be catalog/assembly objects owned by appropriate Architecture/Decorative/Structure modules. Landscape references them as part of design composition rather than duplicating their construction data.

## Commands

- `CreatePlantingBed`
- `PlacePlant`
- `ArrayPlantsAlongPath`
- `CreatePlanter`
- `PlaceLandscapeAsset`
- `CreateGardenPathIntent`
- `CreateWaterFeatureIntent`

## Phase behavior

Existing trees/landscape elements can remain/remove/relocate. Relocating a plant may be a simple instance relocation if it represents landscape placement rather than construction replacement; physical structures use construction lifecycle rules.

## LOD

Default low-poly/proxy representation. High-detail plant/furniture geometry is presentation-only and must not degrade normal modeling performance.

## Quantity

- plant counts;
- planting-bed area;
- soil/mulch/stone quantities when assembly rules exist;
- planter count;
- catalog assets count.

Paving quantities remain Surface-owned.

## Drawing

- landscape plan;
- plant tags/schedule;
- planting-bed boundaries;
- landscape asset symbols;
- cross-references to paving/lighting/drainage plans.

## QA

- plant asset missing proxy/placement definition;
- planting bed invalid boundary;
- tree conflicts with known building/structure zones where configured;
- tree pit not coordinated with paving;
- landscape light/water/drain requirement unconnected when marked required.

## Acceptance criteria

- AC-LAND-001: planting bed supports arbitrary boundary and persists.
- AC-LAND-002: plant proxy can switch LOD without changing semantic asset identity.
- AC-LAND-003: garden path intent can create/associate a Surface path layout through public capability.
- AC-LAND-004: plant schedule remains traceable to placed smart objects.
- AC-LAND-005: tree pit/paving coordination can be validated without Landscape directly editing Surface private data.