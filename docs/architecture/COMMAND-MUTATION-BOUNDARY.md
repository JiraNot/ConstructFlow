# ConstructFlow — Command Mutation Boundary

## 1. Principles of Mutation

In ConstructFlow, **all persistent state changes to the building model must pass through the CommandBus**.

Direct mutation from:
- UI click handlers
- Inspector Dialogs
- External Python scripts / WebSockets
- AI / MCP assistants
- SketchUp Tools

directly calling `entity.set_attribute` or geometry modification outside a command is strictly forbidden.

```text
  SketchUp Tool      Inspector Dialog     MCP / AI Agent     Automation
        │                   │                   │                 │
        └───────────────────┴─────────┬─────────┴─────────────────┘
                                      │
                                      ▼
                             Core::CommandBus
                         (Validation & Transaction)
                                      │
                                      ▼
                              Command Handler
                        (Domain Logic & Geometry)
                                      │
                                      ▼
                               Core::EventBus
                         (Publish Committed Event)
                                      │
                                      ▼
                           Core::DependencyGraph
                    (Invalidate Affected Representations)
```

## 2. Command Execution Lifecycle

1. **Invocation**:
   `Runtime.commands.execute(name, input, version: 1, actor: { kind: 'human' }, project_id: ...)`
2. **Registration Lookup**:
   Checks whether the command name and version are registered. Rejects unregistered commands.
3. **Pre-Transaction Validation**:
   Executes registered `validator`. If invalid, returns `{ status: 'rejected', errors: [...] }` without opening a native SketchUp transaction.
4. **Transaction Run**:
   Invokes `TransactionManager#run(name)` which starts a native SketchUp operation.
5. **Execution**:
   Executes domain handler block. Returns normalized result hash.
6. **Commit & Event Publishing**:
   Upon successful return, commits the operation and publishes declared domain events to `EventBus`.
7. **Dependent Invalidation**:
   `DependencyGraph` propagates invalidation tokens (`dirty_geometry`, `dirty_quantity`, `dirty_drawing`, `dirty_schedule`) to hosted and dependent Smart Objects.

## 3. Human and AI Parity

Human operators and AI actors execute the exact same semantic commands:

| Domain | Semantic Command | Human Tool | AI Tool |
|---|---|---|---|
| Architecture | `CreateWall` | `WallTool` | `execute_command("CreateWall", ...)` |
| Architecture | `ModifyWallPath` | `WallEditTool` | `execute_command("ModifyWallPath", ...)` |
| Architecture | `CreateFloor` | `FloorTool` | `execute_command("CreateFloor", ...)` |
| Architecture | `CreateRoom` | `RoomTool` | `execute_command("CreateRoom", ...)` |
| Opening | `CreateOpening` | `OpeningTool` | `execute_command("CreateOpening", ...)` |
| Door & Window | `CreateDoorWindow` | `PlaceTool` | `execute_command("CreateDoorWindow", ...)` |
| Structure | `CreateColumn` | `ColumnTool` | `execute_command("CreateColumn", ...)` |
| Structure | `CreateBeam` | `BeamTool` | `execute_command("CreateBeam", ...)` |
| Structure | `CreateFoundation` | `FoundationTool` | `execute_command("CreateFoundation", ...)` |
| Roof | `GenerateRoof` | `RoofTool` | `execute_command("GenerateRoof", ...)` |
| Surface | `CreateSurfaceBoundary` | `BoundaryTool` | `execute_command("CreateSurfaceBoundary", ...)` |
| Interior | `CreateCabinetRun` | `CabinetRunTool` | `execute_command("CreateCabinetRun", ...)` |
| Interior | `PlaceWardrobe` | `WardrobeTool` | `execute_command("PlaceWardrobe", ...)` |
| Drainage | `CreateManhole` | `ManholeTool` | `execute_command("CreateManhole", ...)` |
| Drainage | `CreatePipeRoute` | `PipeTool` | `execute_command("CreatePipeRoute", ...)` |
| Electrical | `CreateDevice` | `DeviceTool` | `execute_command("CreateDevice", ...)` |
| Electrical | `CreateConduitRoute` | `ConduitTool` | `execute_command("CreateConduitRoute", ...)` |
| Costing | `GenerateCostEstimate` | BOQ Button | `execute_command("GenerateCostEstimate", ...)` |

AI actors receive no special backdoor access into raw SketchUp entities. This guarantees that all model changes are validated, undoable, and traceable.
