# Domain Modules

Domain behavior belongs here. Core remains intentionally small.

Initial module IDs:

```text
constructflow.site
constructflow.architecture
constructflow.opening
constructflow.door_window
constructflow.decorative
constructflow.extension
constructflow.roof
constructflow.structure
constructflow.surface
constructflow.landscape
constructflow.interior
constructflow.electrical
constructflow.plumbing
constructflow.drainage
```

## Standard module structure

```text
<module>/
├─ manifest.yml
├─ domain/
├─ objects/
├─ commands/
├─ geometry/
├─ rules/
├─ connectors/
├─ quantity/
├─ drawing/
├─ validators/
├─ migrations/
├─ ui/
└─ tests/
```

## Rules

- A module owns its domain data and formulas.
- Cross-module changes happen through commands/events/capabilities.
- A module may run without BOQ, Drawing, QA or AI enabled.
- A module publishes normalized provider outputs rather than exposing internal implementation details.
- Expensive physical geometry must respect LOD strategy.
- No module may bypass object lifecycle, level references or transaction rules.

## First implementation slices

The recommended first vertical slices are:

1. Architecture: trace Smart Wall + existing/new phase data.
2. Opening: create a smart opening hosted by wall.
3. Drainage: manhole + pipe network metadata and relocate command.
4. Surface: arbitrary boundary + border/pattern metadata.
5. Interior: cabinet body + module split metadata.

These slices exercise the most important shared contracts before full geometry engines are implemented.
