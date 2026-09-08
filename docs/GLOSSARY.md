# ConstructFlow Glossary

Status: Accepted terminology baseline.

Use these terms consistently in UI, specs, issues and implementation.

## Project / lifecycle

**Existing** — construction present before the project work begins.

**Existing to Remain** — Existing object with no demolition phase.

**Demolition** — project phase in which existing construction is removed/abandoned/modified as documented.

**New Construction** — construction introduced by the project.

**Modify Existing** — existing construction remains as the same broad construction object but a region/feature is altered, e.g. new opening in existing wall. It is not equivalent to replacing the whole object.

**Relocate** — construction operation that moves/rebuilds an existing physical item while preserving old demolition/abandon history and creating new work where appropriate.

**Replace Construction** — demolish/remove an existing construction object and create a new one, with explicit replacement relationship.

**Swap Type** — change a smart object's type/catalog variant while preserving construction identity/lifecycle when compatible. Does not create demolition history.

**Revision** — model/drawing issue history. Revision is independent from Existing/Demolition/New lifecycle.

**Issue Status** — Draft, For Review/Approval, For Construction, As-Built, Superseded etc.

## Model concepts

**Smart Object** — semantic ConstructFlow object with stable ID, owner module, lifecycle, parameters, relationships and optional generated geometry.

**Raw Geometry** — SketchUp edges/faces/groups/components without guaranteed ConstructFlow semantics.

**Host** — semantic object/surface that places/supports another object, e.g. Window → Wall.

**Connector** — typed functional port enabling system relationships, e.g. Sink waste → Drainage pipe.

**Relationship** — explicit semantic link between smart objects, independent from physical intersection.

**Capability** — public module function/interface registered through Module SDK.

**Provider** — module contribution consumed by a platform service, e.g. QuantityProvider or DrawingProvider.

**Command** — validated request to mutate semantic model state.

**Event** — fact published after model/domain state changes.

**Dirty** — derived output or geometry needs recalculation/regeneration after source changes.

## Levels

**Datum / Benchmark** — project vertical reference from which semantic elevations are defined.

**FFL** — Finished Floor Level.

**GL** — Ground Level.

**SSL / TOS** — Structural Slab Level / Top of Slab (project convention must define exact usage).

**TOB / BOB** — Top / Bottom of Beam.

**TOF / BOF** — Top / Bottom of Footing or pile cap as configured.

**PCL** — Pile Cut-off Level.

**IL** — Invert Level, primarily drainage pipe/manhole flow-line elevation.

## LOD

**LOD 100 Concept** — lightweight intent/massing/symbolic representation.

**LOD 200 Design** — coordinated design representation.

**LOD 300 Construction** — construction-detail/quantity/drawing representation.

**LOD 400 Fabrication** — selected fabrication/shop-level representation.

**Proxy** — lightweight visual representation of a semantically complete asset.

## Library

**Fixed Asset** — catalog object with mostly fixed geometry, e.g. chair, sanitary fixture.

**Parametric Asset** — reusable object whose geometry is generated from parameters, e.g. window/cabinet.

**Assembly** — construction system composed of multiple layers/parts, e.g. roof/fascia/wall/paving assembly.

**Detail Asset** — approved construction detail resource.

**Company Library** — reusable organization/user-owned catalog.

**Project Library** — project-used/snapshotted assets and project-specific types.

**Variant** — compatible configuration/product choice under an asset/type family.

## Surface / paving

**Boundary** — closed geometry defining the surface extent; may be rectangular, curved, freeform or contain holes.

**Border** — parametric strip/ring/edge treatment inside or around a paving field.

**Field Pattern** — primary paving/tile layout inside borders.

**Pattern Origin** — reference point from which pattern module positions are calculated.

**Pattern Direction** — angle/reference/path controlling pattern axes.

**Locked Layout** — setting-out state where actual piece/cut calculation is intended to be stable enough for quantity/drawing output.

## Interior / fabrication

**Cabinet Run** — one connected built-in/cabinet arrangement along a host/defined path.

**Module** — primary division of a cabinet/run.

**Compartment** — subdivision within a module.

**Front** — door/drawer/open-face treatment of a compartment.

**Joinery Part** — fabrication-level individual panel/board/glass/component record.

**Cut List** — fabrication list of joinery parts and dimensions.

**Edge Band** — edge finishing requirement recorded by individual part edge.

## Data confidence

**Measured** — recorded from site measurement.

**Confirmed** — verified information suitable for current project use.

**Assumed** — temporary explicit assumption.

**Unknown** — value/condition not known.

**Verify On Site** — unresolved information that requires field confirmation before relying on it.

These states must not be collapsed into false certainty by AI or generators.