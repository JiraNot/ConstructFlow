# ConstructFlow — Cross-Domain Coordination & Dependency Propagation

## 1. The Coordination Challenge

Real residential construction is intensely inter-disciplinary:
- Moving an architectural wall affects hosted doors, windows, light switches, wall paneling, and electrical sockets.
- Adjusting a structural column or beam impacts ceiling layouts, ducting, and cabinet clearance.
- Raising a roof alters gutter alignments, rainwater downpipes, and drainage invert levels.

ConstructFlow provides automated **Cross-Domain Coordination** powered by explicit relationships and the `Core::DependencyGraph`.

## 2. Cross-Domain Relationship Matrix

```text
┌─────────────────┐       hosts       ┌──────────────────┐
│   Smart Wall    │ ────────────────► │  Hosted Opening  │
└────────┬────────┘                   └────────┬─────────┘
         │                                     │ hosts
         │ hosts                               ▼
         │                            ┌──────────────────┐
         ├──────────────────────────► │  Door / Window   │
         │                            └──────────────────┘
         │ hosts
         ├──────────────────────────► Electrical Socket / Switch
         │
         │ references
         └──────────────────────────► Cabinet Run / Countertop
```

```text
┌─────────────────┐      collects     ┌──────────────────┐
│   Smart Roof    │ ────────────────► │      Gutter      │
└─────────────────┘                   └────────┬─────────┘
                                               │ connects
                                               ▼
┌─────────────────┐      drains to    ┌──────────────────┐
│ Drainage Route  │ ◄──────────────── │     Downpipe     │
└────────┬────────┘                   └──────────────────┘
         │
         ▼
┌─────────────────┐
│     Manhole     │
└─────────────────┘
```

## 3. Dependency Propagation Workflow

When a root object is modified (e.g. `MoveWall`):

```text
Execute MoveWall
       │
       ▼
1. Update Wall path_mm & rebuild wall 3D / 2D
       │
       ▼
2. DependencyGraph#transitive_dependents(wall_id)
   Traverses reverse relationships:
   - hosted openings
   - door/window infills
   - attached electrical sockets
   - referenced cabinet runs
       │
       ▼
3. Reconcile Hosted Geometry
   - Re-project opening voids along updated wall segment
   - Shift doors/windows within reconciled openings
   - Re-evaluate wall-mounted electrical fixture placement
       │
       ▼
4. Invalidate Downstream Outputs
   - mark_dirty: 'dirty_geometry', 'dirty_quantity', 'dirty_drawing'
   - Mark BOQ quantity records stale
   - Mark Plan / Section drawings stale
       │
       ▼
5. Commit Transaction & Emit WallMoved Event
```

## 4. Cross-Domain Clash & Validation Rules

ConstructFlow validators check coordination constraints:
- `downlight_ceiling_fit`: Ensures downlights remain hosted within false ceiling boundaries.
- `door_swing_cabinet_clearance`: Warns if door swings intersect adjacent cabinetry.
- `drainage_foundation_clearance`: Flags pipes routed through structural footings without sleeves.
- `demolition_host_orphaning`: Prohibits demolishing a wall without either demolishing or re-hosting child fixtures.
