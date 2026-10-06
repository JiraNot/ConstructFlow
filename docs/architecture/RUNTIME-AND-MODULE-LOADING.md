# ConstructFlow — Runtime Initialization and Module Loading

## 1. Overview

ConstructFlow employs a declarative, manifest-driven module loading lifecycle. Rather than requiring ad-hoc manual scripts or brittle initialization loops, the boot sequence runs as a deterministic, two-phase pipeline managed by `Core::ModuleLoader`.

## 2. Boot Flow Architecture

```text
               constructflow.rb
                      │
                      ▼
            constructflow/bootstrap.rb
                      │
                      ▼
               constructflow/main.rb
                      │
                      ▼
              Core Kernel Boot
         ├── IdGenerator
         ├── DiagnosticLog
         ├── Host::SketchUpHost
         ├── ModuleRegistry (registers CORE_MANIFEST)
         ├── ModuleLoader
         ├── CapabilityRegistry
         ├── ConnectorRegistry
         ├── EventBus
         ├── MigrationRegistry
         └── CommandBus (with TransactionManager)
                      │
                      ▼
          Model & UI Attachment
         ├── Attach SketchUp.active_model
         ├── ProjectStore & LevelRegistry
         ├── SmartObjectManager (with DependencyGraph)
         ├── AppObserver & DropObserver
         └── Core::UiEntry (constructs ConstructFlow menu)
                      │
                      ▼
           Core Platform Integrations
         (Representations, Drawing Presets, Styles, Scenes, LayOut, Identity)
                      │
                      ▼
         ModuleLoader.load_module_definitions
                      │
    ┌─────────────────┴─────────────────┐
    ▼                                   ▼
Phase 1: Module Primary Install    Phase 2: Cross-Domain Integrations
(Topological Order)                (Representations, Rainwater, Detours)
- architecture                     - plan representation providers
- opening                          - extension workflow runner
- door_window                      - rainwater downpipes & routing
- structure                        - route node tools
- roof                             - construction intent stores
- surface                          ...
- interior
- library
- drainage
- electrical
- extension
- costing
```

## 3. Module Definition Contract

A domain module defines its capabilities, commands, objects, and dependencies using a standard `MANIFEST` hash:

```ruby
MANIFEST = {
  id: 'constructflow.architecture',
  name: 'Architecture',
  version: '0.1.0',
  schema_version: 1,
  requires: ['constructflow.core'],
  optional_capabilities: %w[opening.host_integration surface.finish structure.coordination],
  provides: %w[wall.host_surface architecture.wall_quantity architecture.floor_quantity],
  objects: %w[architecture.wall architecture.floor architecture.room architecture.ceiling],
  commands: %w[CreateWall ModifyWallPath MoveWall MoveWallSegment ...],
  events: %w[GeometryChanged ParametersChanged FloorCreated ...],
  providers: %w[constructflow.architecture.wall_quantity ...],
  validators: ['architecture.wall.validity']
}.freeze
```

### 3.1 Two-Phase Lifecycle

1. **Phase 1 (Primary Installation)**:
   - Evaluated in topological dependency order (`requires`).
   - Executes `defn.installer&.call(runtime)`.
   - Registers domain repositories, geometry engines, and validators.
   - Publishes capabilities to `CapabilityRegistry` (e.g. `'wall.host_surface'`, `'opening.infill_host'`).
   - Registers mutating domain commands to `CommandBus`.

2. **Phase 2 (Cross-Domain Integration)**:
   - Executed once **all** modules have completed Phase 1.
   - Executes `defn.integrations.each { |i| i.call(runtime) }`.
   - Binds cross-module representation providers, route candidate evaluators, rainwater planning integrations, and extension bridge commands.
   - Eliminates `KeyError` crashes caused by accessing capabilities before dependency modules have registered.

## 4. Registering New Modules

To register a new domain module (e.g. `constructflow.plumbing`):
1. Define `Plumbing::Registration::MANIFEST` with required dependencies.
2. Implement `Plumbing::Registration.install(runtime)`.
3. Add the module to `Core::BuiltinModules.definitions` (or register dynamically via `ModuleRegistry#register_module`).
4. The `ModuleLoader` automatically determines load order and handles lifecycle execution.
