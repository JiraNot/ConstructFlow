# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, TypeScript, Vite, Tailwind CSS, Canvas/WebGL, Rust/WASM.

## Users

Architects, Structural Engineers, MEP Engineers, Drafters, and Contractors in Thailand.

## Product Purpose

An autonomous, standalone BIM & Construction CAD engine capable of executing a complete project lifecycle: from AI Sketch to Parametric BIM, Thai Law Check, 20-Sheet A3 Set, and Phased BOQ.

## Positioning

ConstructFlow is not merely a plugin or extension for CAD software. It performs all geometry generation, spatial queries, clearance validation, rebar detailing, hydraulic slope calculation, and vector PDF compilation natively, with strict enforcement of Thai Building Codes (กฎกระทรวงฉบับที่ 55) and local engineering standards (EIT / วสท.).

## Operating Context

Web and Desktop environments. Complex multi-viewport editing (Plan, Elevation, 3D), property inspectors, type catalogs, and automated PDF sheet compilation (20-Sheet A3 Construction Permit Sets).

## Capabilities and Constraints

- **Single Source of Truth (SSOT):** Canonical Domain Models, Smart Objects, Type Catalog.
- **Parametric Smart Symbols:** Constraint-based (Cassowary/kiwi.js) geometry for dynamic 2D elevations.
- **BIM Coordination:** R-Tree Spatial Index & Hard/Soft Exact Geometry Clash Detection.
- **Universal Renovation Phasing:** Mandatory phase enforcement (Existing / Demolition / New Construction) for automated BOQ cost segregation.

## Brand Commitments

ConstructFlow (by JiraNot). The tool is highly technical, professional, and precise.

## Evidence on Hand

The repository contains a robust monorepo structure with `@constructflow` packages for geometry-kernel, clash-engine, representation-engine, takeoff-engine, sheet-engine, snapping-engine, constraint-engine, and architecture-engine.

## Product Principles

1. **Standalone-First, Adapters-Second:** Perform all heavy lifting natively before exporting to downstream tools (AutoCAD/Revit/SketchUp).
2. **Universal Phasing:** Every entity carries a lifecycle phase, segregating visuals and cost centers.
3. **Type Catalog Cascading:** Changes to a type instance cascade instantly across 3D meshes, 2D plans, schedules, and BOQ.
4. **Law-Abiding by Default:** Thai setback rules, FAR/OSR, and accessibility constraints are automatically validated.

## Accessibility & Inclusion

Clear visual hierarchy for dense engineering data, legible typography for technical schedules, and adherence to Thai language technical terminology.
