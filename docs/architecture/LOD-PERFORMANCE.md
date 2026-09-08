# LOD and Performance Strategy

Status: Accepted foundation contract.

## Principle

ConstructFlow must remain practical inside SketchUp on real renovation/extension projects. Semantic detail and quantity intelligence must not require full physical geometry at all times.

## Canonical LOD model

### LOD 100 — Concept

Purpose: fast design intent.

Examples:

- extension mass/boundary;
- simplified roof plane;
- wall/floor/room volumes;
- centerline pipe network;
- cabinet envelope;
- symbolic/low-poly landscape assets.

### LOD 200 — Design

Purpose: coordinated design.

Examples:

- door/window panels;
- roof covering/framing layout simplified;
- structural member sizes;
- paving pattern preview;
- cabinet module/front layout;
- electrical/plumbing logical systems.

### LOD 300 — Construction

Purpose: construction documentation and detailed quantities.

Examples:

- wall/floor layer assemblies;
- roof flashing/fascia/gutter detail geometry where useful;
- pipe fittings selectively generated;
- structural connections/rebar representations as needed;
- actual paving cut layout;
- joinery parts/hardware assignments.

### LOD 400 — Fabrication

Purpose: shop/fabrication output for selected domains.

Examples:

- full joinery parts/cut list;
- board optimization inputs;
- detailed rebar/BBS or selected physical bars;
- detailed steel connections;
- fabrication/export geometry where supported.

## Semantic data is independent of display LOD

Lower LOD does not mean deleting construction metadata. A RebarSet may contain diameter/count/spacing/shape data while showing no physical bars. A pipe route may hold diameter/slope/invert while displayed as a centerline.

## Proxy strategy

High-complexity assets should support proxy/detail variants:

- trees/shrubs;
- furniture;
- sanitary fixtures;
- appliances;
- decorative components;
- repeated hardware.

Project modeling defaults to lightweight variants. Presentation/render/fabrication mode can switch selected objects to higher detail.

## Repetition strategy

Repeated identical catalog items should prefer component instances rather than duplicated unique geometry when SketchUp semantics permit it.

Parametric type/instance architecture should separate shared type geometry/configuration from instance placement/state when practical.

## Geometry generation

Bulk geometry generation should use efficient SketchUp API patterns. Domain generators should avoid creating thousands of unnecessary edges/faces merely to represent data that can remain semantic.

## Rebar

Default:

- reinforcement set metadata;
- representative drawing lines/symbols;
- optional selected 3D generation.

Never require full 3D rebar for basic BOQ/BBS.

## Pipe networks

Default:

- route centerline;
- diameter/system metadata;
- nodes/connectors;
- invert/slope data.

Optional detailed generation:

- pipe solids;
- elbows;
- tees;
- traps;
- couplers.

## Paving

During early design, large surfaces may display shader/preview pattern instead of one heavy component per physical piece. When setting-out is locked or takeoff requires it, generate/count piece layout using efficient representations.

The semantic layout model should support piece-level calculation without requiring every piece to become a heavyweight unique SketchUp group.

## Joinery

Design mode:

- cabinet envelope;
- modules/compartments/fronts.

Fabrication mode:

- individual boards/parts;
- edge-band data;
- hardware;
- exploded representation.

## Drawing representations

Drawing detail should be generated/represented at required scale rather than forcing model-global LOD 400.

## Dirty/rebuild strategy

When parameters change, regenerate only affected object/subsystem regions where possible. Do not rebuild an entire project because one cabinet divider or manhole moved.

## Caching

Allowed caches include:

- object indexes;
- bounding volumes;
- quantity results;
- drawing representation data;
- tessellation/pattern results;
- catalog thumbnails.

Caches must be invalidatable and rebuildable; they are not the sole semantic source of truth.

## Performance budgets

Initial builds should instrument rather than guess budgets. Track at least:

- boot time;
- object scan/index time;
- command execution time;
- event propagation;
- save/reopen;
- paving generation/counting;
- large library browsing;
- memory usage by representative project size.

Once baseline data exists, establish regression thresholds in CI/developer diagnostics.

## Graceful degradation

If a requested physical representation is too heavy, the application may warn and offer:

- generate selected area only;
- lower LOD;
- use proxy;
- calculate quantities without full geometry;
- batch/freeze generated detail.

It should not silently freeze SketchUp while generating avoidable geometry.

## Performance acceptance principle

A feature is incomplete if its only correct implementation makes normal project editing impractical. Domain specs must state both semantic representation and physical/LOD strategy.