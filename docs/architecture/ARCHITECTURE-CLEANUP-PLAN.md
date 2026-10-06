# ConstructFlow — Architecture Cleanup & Stabilization Plan

## 1. Context & Purpose

ConstructFlow is entering an architecture stabilization phase to consolidate its modular foundation before expanding production capabilities. The focus is to:
- Preserve and strengthen all 12 existing modules (Architecture, Openings, Door/Window, Structure, Roof, Surface, Interior, Library, Drainage, Electrical, Costing, Extension).
- Avoid speculative rewrites or pivots to non-target platforms (Revit / Archicad).
- Solidify SketchUp as the primary modeling and visualization host.
- Prepare seamless interoperability with AutoCAD / DWG workflows.

## 2. Phased Architecture Road Map

```text
┌────────────────────────────────────────────────────────┐
│ Phase A: Simplified Bootstrap & Declarative Modules    │
│ [STATUS: IMPLEMENTED]                                  │
│ - Single boot path in Runtime.boot!                    │
│ - ModuleDefinition & BuiltinModules catalog            │
│ - Two-phase topological module loading in ModuleLoader │
│ - Clean bootstrap.rb entrypoint                        │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase B: Kernel / Platform / Services Separation       │
│ [STATUS: IMPLEMENTED / PROGRESSIVE]                    │
│ - Core::Host adapters for attributes and transactions  │
│ - Core::DependencyGraph for transitive invalidation     │
│ - Explicit separation of domain logic from host API    │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase C: Command Bus as Strict Mutation Boundary       │
│ [STATUS: IMPLEMENTED / HARDENED]                       │
│ - 100% mutations via CommandBus                        │
│ - Human UI tools, MCP, and Automation use same API     │
│ - Pre-transaction validation and atomicity guards      │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Phase D: Reference Slices & Cross-Domain Coordination   │
│ [STATUS: ACTIVE]                                       │
│ - Reference slice 1: Wall -> Opening -> Door/Window    │
│ - Reference slice 2: Wall Move -> Sockets -> Cabinets  │
│ - Invalidation tokens propagate to BOQ & Drawings      │
└────────────────────────────────────────────────────────┘
```

## 3. Work Completed in Initial Stabilization Batch

1. **Host Boundary (`Core::Host`)**:
   - Created `Core::Host::EntityAttributeAdapter` to isolate SketchUp attribute dictionary calls.
   - Created `Core::Host::ModelTransactionAdapter` to isolate SketchUp operation transactions.
   - Created `Core::Host::SketchUpHost` providing cohesive host runtime services.
   - Updated `Core::AttributeStore` and `Core::TransactionManager` to delegate to host adapters while preserving 100% backward compatibility.

2. **Declarative Module System**:
   - Created `Core::ModuleDefinition` packaging manifest, primary installer, and secondary integrations.
   - Created `Core::BuiltinModules` catalog defining the 12 domain modules and core platform integrations.
   - Enhanced `Core::ModuleLoader#load_module_definitions` to resolve module dependencies topologically and execute a two-phase lifecycle (phase 1: capabilities & commands, phase 2: cross-domain integrations).
   - Streamlined `apps/sketchup-extension/constructflow/bootstrap.rb` into a concise, deterministic entrypoint.

3. **Dependency Graph & Invalidation Engine**:
   - Created `Core::DependencyGraph` providing cycle-safe transitive dependent calculation.
   - Integrated `DependencyGraph` into `Core::SmartObjectManager`.
   - Supported standard invalidation tokens (`geometry`, `quantity`, `drawing`, `schedule`, `validation`).

4. **Safety & Test Verification**:
   - Added unit test suite `test/core/host_adapter_and_architecture_cleanup_test.rb`.
   - Verified that all 800 tests pass with zero regressions.

## 4. Next Implementation Batches

### Batch 2: Plan Editor & 3D Synchronization Hardening
- Ensure Plan Editor interactions and 3D Viewport tools share identical level context and constraint projections.
- Validate that parameter changes in schedule editors (`EditDoorWindowSchedule`, `EditRoomSchedule`, `EditBeamSchedule`, `EditColumnSchedule`) invoke domain commands and trigger `DependencyGraph#invalidate_affected`.

### Batch 3: AutoCAD / DWG Ingestion Pipeline Proposal
- Implement lightweight DWG candidate analysis pipeline for walls, openings, and grids.
- Implement user confirmation UI before converting candidates into Smart Objects.
