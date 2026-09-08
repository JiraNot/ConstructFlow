# Product Scope Traceability Matrix

Purpose: prove that the product scope discussed for ConstructFlow is represented in the authoritative documentation and assigned to an owner module/service.

This matrix is not a feature-complete implementation checklist; it is a documentation ownership map.

| Scope | Owner | Primary spec |
|---|---|---|
| Project / units / ID / registries | Core | `architecture/CORE-CONTRACTS.md` |
| Existing / Demolition / New | Core lifecycle | `architecture/PHASE-LEVEL-REVISION.md` |
| Revision / drawing issue status | Revision + Drawing | `architecture/PHASE-LEVEL-REVISION.md`, `architecture/DRAWING-STANDARD.md` |
| Datum / FFL / GL / SSL / TOB / BOB / TOF / BOF / PCL / IL | Core Levels | `architecture/PHASE-LEVEL-REVISION.md` |
| Existing site / boundary / survey / road | Site | `MASTER-BLUEPRINT.md`, `modules/DOMAIN-MODULES-v1.md` |
| Existing house conversion | Architecture + Core Convert | `architecture/INTERACTION-MODEL.md`, `architecture/IMPORT-EXPORT.md` |
| Walls / floor / ceiling / rooms | Architecture | `modules/DOMAIN-MODULES-v1.md` |
| Openings / arch / niche / void | Opening | `modules/DOMAIN-MODULES-v1.md` |
| Doors / windows / swing / slide / fixed / folding | Door & Window | `MASTER-BLUEPRINT.md`, `modules/DOMAIN-MODULES-v1.md` |
| ลูกฟัก / panel / glazed panels | Door & Window | `MASTER-BLUEPRINT.md`, `modules/DOMAIN-MODULES-v1.md` |
| Moulding / cornice / wall panels / façade | Decorative | `MASTER-BLUEPRINT.md`, `modules/DOMAIN-MODULES-v1.md` |
| Glass block / breeze block / ventilation block | Opening + Decorative | `MASTER-BLUEPRINT.md` |
| Kitchen/carport/multipurpose/laundry extension | Extension | `MASTER-BLUEPRINT.md`, `WORKFLOW-REGISTRY.md` |
| Metal/tile roof | Roof | `MASTER-BLUEPRINT.md` |
| Polycarbonate/glass roof | Roof | `MASTER-BLUEPRINT.md` |
| Steel roof framing / rafter / purlin / truss | Roof + Structure capability | `modules/DOMAIN-MODULES-v1.md` |
| Fascia / roof concealment / smartboard | Roof | `MASTER-BLUEPRINT.md`, `modules/DOMAIN-MODULES-v1.md` |
| Soffit / flashing / counter-flashing / waterproof junctions | Roof | `MASTER-BLUEPRINT.md` |
| Gutter / downpipe | Roof + Drainage connector | `architecture/CONNECTOR-STANDARD.md` |
| Fence / slat / screen | Decorative/Landscape | `MASTER-BLUEPRINT.md` |
| Pile / pile group / pile cap / footing | Structure | `MASTER-BLUEPRINT.md`, `modules/DOMAIN-MODULES-v1.md` |
| Ground beam / column / beam / slab | Structure | `modules/DOMAIN-MODULES-v1.md` |
| Structural steel / connections | Structure | `modules/DOMAIN-MODULES-v1.md` |
| Rebar / BBS / optional 3D rebar | Structure | `MASTER-BLUEPRINT.md`, `architecture/LOD-PERFORMANCE.md` |
| Concrete / steel / rebar / formwork takeoff | Structure → Quantity | `architecture/QUANTITY-CONTRACT.md` |
| Arbitrary curved/freeform surfaces | Surface | `MASTER-BLUEPRINT.md`, `modules/DOMAIN-MODULES-v1.md` |
| Tile / paver / stamped concrete / deck | Surface | `MASTER-BLUEPRINT.md` |
| Multiple borders | Surface | `MASTER-BLUEPRINT.md` |
| Grid / running bond / herringbone / fan | Surface | `MASTER-BLUEPRINT.md` |
| Follow curve/path / radial / concentric | Surface | `MASTER-BLUEPRINT.md` |
| Pattern origin / direction / centered layout / min cut | Surface | `MASTER-BLUEPRINT.md` |
| Parking bays / 3-car layouts | Surface | `WORKFLOW-REGISTRY.md`, `modules/DOMAIN-MODULES-v1.md` |
| Spot levels / slope / drain-to | Surface + Levels + Drainage | `MASTER-BLUEPRINT.md`, `architecture/CONNECTOR-STANDARD.md` |
| Cut/fill future earthwork | Site/Surface advanced | `MASTER-BLUEPRINT.md` |
| Trees / shrubs / planter / bench / fountain | Landscape | `MASTER-BLUEPRINT.md` |
| Landscape lighting / water / drainage | Landscape + MEP | `modules/DOMAIN-MODULES-v1.md` |
| Cabinet / wardrobe / kitchen / TV / vanity | Interior | `MASTER-BLUEPRINT.md`, `modules/DOMAIN-MODULES-v1.md` |
| Table / desk / counter / island / bench | Interior | `MASTER-BLUEPRINT.md` |
| Cabinet module / compartment | Interior | `modules/DOMAIN-MODULES-v1.md` |
| Swing/slide/fold/lift fronts | Interior | `modules/DOMAIN-MODULES-v1.md` |
| Solid/glass/aluminum-frame fronts | Interior | `modules/DOMAIN-MODULES-v1.md` |
| Drawer / shelf / internal fitting / hardware | Interior | `modules/DOMAIN-MODULES-v1.md` |
| Countertop / sink-hob cutout | Interior | `MASTER-BLUEPRINT.md` |
| Grain / edge band / joinery parts | Interior Fabrication | `MASTER-BLUEPRINT.md` |
| Cut list / hardware schedule / exploded view | Interior Fabrication | `MASTER-BLUEPRINT.md`, `architecture/DRAWING-STANDARD.md` |
| Board optimization / future DXF/CNC | Interior advanced | `MASTER-BLUEPRINT.md`, `architecture/IMPORT-EXPORT.md` |
| Downlight / light / LED / garden light | Electrical | `MASTER-BLUEPRINT.md` |
| Switch / outlet / dedicated appliance point | Electrical | `modules/DOMAIN-MODULES-v1.md` |
| Logical circuits / controls | Electrical | `architecture/CONNECTOR-STANDARD.md` |
| Cold/hot water / pump / valve | Plumbing | `modules/DOMAIN-MODULES-v1.md` |
| Sink/basin/toilet/shower service requirements | Plumbing + Drainage | `MASTER-BLUEPRINT.md` |
| Waste / soil / floor drain / cleanout | Drainage | `modules/DOMAIN-MODULES-v1.md` |
| Manhole / trench drain / grease trap | Drainage | `modules/DOMAIN-MODULES-v1.md` |
| Pipe route nodes / auto route / manual edit | Drainage | `architecture/CONNECTOR-STANDARD.md`, `architecture/UI-UX-SPEC.md` |
| Diameter / slope / invert levels | Drainage | `architecture/CONNECTOR-STANDARD.md` |
| Relocate existing manhole | Drainage + lifecycle | `architecture/COMMAND-CATALOG.md`, `architecture/ACCEPTANCE-CRITERIA.md` |
| Insert intermediate manhole | Drainage | `architecture/COMMAND-CATALOG.md` |
| Model library folders | Library | `architecture/LIBRARY-CATALOG.md` |
| Fixed / parametric / assembly / detail assets | Library | `architecture/LIBRARY-CATALOG.md` |
| Catalog / manufacturer / SKU / variants | Library | `architecture/LIBRARY-CATALOG.md` |
| Swap Type | Library | `architecture/LIBRARY-CATALOG.md`, `architecture/ACCEPTANCE-CRITERIA.md` |
| Replace Construction | Lifecycle + Library | `architecture/SMART-OBJECT-SCHEMA.md` |
| Project-safe asset versions | Library/Persistence | `architecture/PERSISTENCE-MIGRATION.md` |
| Quantity / BOQ | Quantity | `architecture/QUANTITY-CONTRACT.md` |
| Material / labor rates | Costing | `architecture/QUANTITY-CONTRACT.md` |
| Existing/Demolition/Proposed drawings | Drawing | `architecture/DRAWING-STANDARD.md` |
| Plans / elevations / sections / details | Drawing | `architecture/DRAWING-STANDARD.md` |
| Door/window schedules | Drawing + Door/Window | `architecture/DRAWING-STANDARD.md` |
| Structure drawings / BBS | Drawing + Structure | `architecture/DRAWING-STANDARD.md` |
| Electrical / water / drainage plans | Drawing + MEP | `architecture/DRAWING-STANDARD.md` |
| Paving setting-out | Drawing + Surface | `architecture/DRAWING-STANDARD.md` |
| Furniture shop drawing | Drawing + Interior | `architecture/DRAWING-STANDARD.md` |
| LayOut / PDF | Drawing adapter | `architecture/DRAWING-STANDARD.md` |
| QA / coordination / clash checks | QA + domain validators | `architecture/ACCEPTANCE-CRITERIA.md`, `architecture/TEST-STRATEGY.md` |
| LOD / proxies / lightweight rebar/pipe | Core strategy | `architecture/LOD-PERFORMANCE.md` |
| Import legacy SKP / references | Import/Convert | `architecture/IMPORT-EXPORT.md` |
| AI intent / library search / command orchestration | AI | `architecture/AI-ORCHESTRATION.md` |
| Human and AI same command path | Core/AI | `architecture/COMMAND-CATALOG.md` |
| Modular package growth | Module SDK | `architecture/MODULAR-ARCHITECTURE.md`, `modules/MODULE-SPEC-TEMPLATE.md` |

## Rule for new scope

When a new major requirement is added, update this matrix and at least one authoritative spec in the same change. If no clear owner exists, resolve module ownership before implementation.