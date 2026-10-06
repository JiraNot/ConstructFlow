# ConstructFlow — Production Roadmap (SketchUp-First Residential OS)

## 1. Product Vision

**ConstructFlow is the SketchUp-first Residential Design & Construction Operating System.**

Targeted at real-world residential renovations, kitchen/rear extensions, interior fitouts, structural coordination, and MEP documentation in production offices utilizing SketchUp and AutoCAD.

```text
AutoCAD / DWG / Survey
          │
          ▼
    ConstructFlow
          │
          ▼
       SketchUp
    ┌─────┼─────┐
    ▼     ▼     ▼
  Design BOQ  Drawings
    │     │     │
    └─────┼─────┘
          ▼
     Construction
          │
          ▼
      AI / MCP
```

## 2. Priority Sequence

### P0 — Architecture Stabilization [COMPLETED / VERIFIED]
- **Runtime & Bootstrap Consolidation**: Unified two-phase boot path via `ModuleLoader` and `BuiltinModules`.
- **SketchUp Host Boundary**: `Host::EntityAttributeAdapter`, `Host::ModelTransactionAdapter`, `Host::SketchUpHost`.
- **Dependency Invalidation**: `Core::DependencyGraph` tracking reverse relationships with cycle protection.
- **Contract Preservation**: 100% backward compatibility across all 12 modules, 800 passing tests.

### P1 — Core Disciplines & Coordination [CURRENT ACTIVE]
- **Architecture**: Smart Walls, Wall location lines, Clean joins, Floors, Ceilings, Rooms.
- **Existing → Demolition → New Work**: Phase filtering in 3D, 2D plan, and BOQ separation.
- **Extensions**: Kitchen, carport, and rear additions coordinating structure, roof, and MEP.
- **Interior & Joinery**: Cabinet runs, countertops, wardrobes, sheet nesting, cut lists.
- **Electrical**: Switches, sockets, downlights, circuit assignments, panelboards.
- **Drainage**: Manholes, pipe slopes, detours, roof rainwater connections.
- **Structure**: Columns, beams, footings, coordination with MEP routes.

### P2 — Production Platform & Deliverables [NEAR-TERM]
- **BOQ & Costing Engine**: Thai residential work packages, material/labor split, estimate snapshots.
- **Drawing Automation**: Associative 2D plan linework, sections, elevations, LayOut vector export.
- **Quality Assurance**: Automated clash checks (door vs cabinet, socket vs cabinet, drainage vs footing).

### P3 — AutoCAD / DWG Interoperability [STRATEGIC PRIORITY]
- Import pipeline for DWG layer & block analysis.
- Candidate detection for walls, doors, windows, and columns with interactive confirmation.

### P4 — AI / MCP Enhancement [ONGOING]
- Expand natural language commands for full-room generation, electrical circuiting, and BOQ audits.
- Deepen AI validation using `DependencyGraph` and semantic error recovery.

### Out of Scope / Deferred
- Revit API adapters (deferred).
- Archicad API adapters (deferred).
- Cloud microservices / multi-database backends (deferred; SketchUp model remains local authority).
