# Decorative Wall & Façade Module

Status: Proposed v1  
Module ID: `constructflow.decorative`

## Mission

Own parametric decorative layers attached to architectural hosts, including mouldings, cornices, wall panels, grooves, slats, screens, cladding and trim systems.

## Owns

- MouldingRun
- CorniceRun
- BuildingBand
- PanelLayout
- WainscotLayout
- GrooveLayout
- SlatLayout
- DecorativeScreen
- CladdingLayer
- OpeningTrim
- Pilaster
- ColumnWrap

## Dependencies

Required:

- Core;
- host capability, usually Architecture wall/column surfaces.

Optional:

- Opening geometry for cut/avoid behavior;
- Library profiles/catalog;
- Surface/pattern utilities if shared through public capability.

## Core behavior

Decorative systems are layered on a host and should reflow when host dimensions change where mathematically possible.

Pattern behavior around openings:

- Continue through opening coordinate system;
- Restart per zone;
- Center each remaining zone;
- Trim/avoid opening;
- Explicit manual override.

## Profile-driven systems

Moulding/cornice profiles come from approved Profile Library or user-created profiles. The module persists profile reference/version plus placement/path parameters.

## Panel systems

Parameters can include:

- margins;
- rows/columns;
- equal/explicit widths;
- moulding profile;
- panel depth/recess;
- symmetry rule;
- opening avoidance.

## Slat/screen systems

Use fixed module dimensions when material is real:

- slat width;
- depth;
- gap;
- orientation;
- start/center rule;
- max/min residual.

Do not stretch a fixed physical slat just to fill a host.

## Commands

- `ApplyDecorativeWallSystem`
- `CreateMouldingRun`
- `CreateCorniceRun`
- `SetPanelLayout`
- `ApplySlatPattern`
- `ApplyCladdingLayer`
- `ApplyOpeningTrim`
- `CreatePilaster`
- `CreateColumnWrap`

## Phase behavior

Decorative systems carry independent lifecycle. Existing decorative layer can be demolished while host wall remains.

## Library/catalog

- profile assets;
- panel presets;
- slat systems;
- cladding assemblies;
- manufacturer materials.

Swap Type updates profile/material/pattern while retaining host/path where compatible.

## Quantity

- moulding/cornice length;
- slat count/length/area;
- screen/cladding area;
- panel/trim area/length;
- board/sheet counts where assembly rules define them.

## Drawing

- façade/wall elevation representation;
- enlarged decorative wall elevation;
- profile/detail references;
- material tags;
- opening trim details.

## QA

- invalid/overlapping panel zones;
- slat residual below configured minimum;
- moulding path self-intersection;
- decorative element crossing opening contrary to behavior rule;
- missing host/profile;
- incompatible profile scale/material.

## Acceptance criteria

- AC-DEC-001: panel layout reflows after supported host width change.
- AC-DEC-002: moulding follows straight/curved supported paths.
- AC-DEC-003: decorative layout can avoid an opening without manual trimming.
- AC-DEC-004: fixed-size slat spacing does not stretch physical module dimensions.
- AC-DEC-005: quantities update after pattern/profile change.
- AC-DEC-006: existing decorative system can be demolished independently from host.