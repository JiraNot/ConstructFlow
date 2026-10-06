# ConstructFlow — Smart Object as Source of Truth

## 1. Single Source of Truth (SSOT) Model

In ConstructFlow, the **Smart Object** is the canonical, authoritative definition of an architectural or construction element.

Geometry, 2D plan linework, section graphics, schedule tables, and BOQ quantity items are **derived representations** of the Smart Object state.

```text
                     Smart Object
            (Core Identity, Phase, Parameters)
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   3D Geometry       Plan View        Section / Elevation
        │                │                │
        └────────────────┼────────────────┘
                         ▼
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   BOQ / Costing                    Schedule Tables
```

## 2. Canonical State vs Derived Output

| Dimension | Canonical (Smart Object) | Derived (Representations / Outputs) |
|---|---|---|
| **Identity** | `id: "cf_obj_..."` | Entity persistent ID, Component instance name |
| **Lifecycle** | `created_phase`, `removed_phase` | SketchUp Tag visibility / Section display |
| **Location** | Path points, reference datum, level | 3D Face coordinates, bounding box |
| **Parameters** | Width, height, thickness, layers, type | Formwork area, concrete volume |
| **Relationships** | Host ID, target connections | Physical intersection edges, holes cut in walls |
| **Documentation** | Associated mark, handing, schedule specs | Callout text, LayOut viewport annotations |

## 3. Reconciliation from Native SketchUp Edits

While Smart Objects own authoritative state, users may perform native SketchUp modeling operations (move, copy, pushpull, rotate). ConstructFlow reconciles these native changes back into the Smart Object graph:

1. **Copy / Duplicate**:
   - `NativeCopyIdentityObserver` detects newly created entities bearing duplicate `cf_obj_*` attributes.
   - `NativeCopyIdentityRepair` generates fresh stable IDs and updates relationship references.
2. **Move / Stretch**:
   - Semantic tools reconcile modified geometric positions back into the definition paths (`path_mm`).
3. **Erase / Demolition**:
   - Physical deletion cleans up the runtime index via `SmartObjectManager#erase!`.
   - Architectural demolition preserves the entity with `removed_phase: 'demolition'`.
