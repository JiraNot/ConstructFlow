# Host and Connector Standard

Status: Accepted foundation contract.

## Purpose

ConstructFlow modules must interoperate without hardcoding knowledge of each other's private data. Hosts express placement/dependency; connectors express functional connections between smart objects and systems.

## Host contract

A hosted object declares accepted host capability types, not specific implementation classes.

Examples:

```text
Window        → wall.host_surface
Downlight     → ceiling.host_surface
Gutter        → roof.edge_host
Cabinet       → wall.host_surface + optional floor.support_surface
Faucet        → countertop.host_surface | wall.host_surface
```

Host record:

```yaml
host_relation:
  target_id: cf_wall_001
  capability: wall.host_surface
  anchor:
    local_position: [x, y, z]
    orientation: [...]
  behavior:
    follow_host_move: true
    follow_host_resize: conditional
```

## Connector contract

A connector is a typed semantic port attached to a smart object.

```yaml
connector:
  id: conn_<uuid>
  owner_object_id: cf_sink_001
  type: drainage.waste
  role: outlet
  nominal_size_mm: 50
  position: [x, y, z]
  direction: [x, y, z]
  properties: {}
  state: available|connected|disabled
```

## Connector families

### Drainage

- `drainage.waste`
- `drainage.soil`
- `drainage.rainwater`
- `drainage.floor_drain`
- `drainage.manhole_in`
- `drainage.manhole_out`
- `drainage.trench_out`

Typical properties:

- nominal diameter;
- gravity/pressurized mode;
- invert level;
- allowed slope range;
- flow direction.

### Plumbing

- `plumbing.cold_water`
- `plumbing.hot_water`
- `plumbing.supply`
- `plumbing.valve_port`

### Electrical

- `electrical.power`
- `electrical.control`
- `electrical.data`
- `electrical.tv`
- `electrical.led_power`

Electrical logical control connections do not imply physical conduit geometry.

### Roof / envelope

- `roof.gutter_outlet`
- `roof.downpipe_top`
- `roof.downpipe_bottom`
- `roof.flashing_edge`

### Structural

Structural support relationships generally use capabilities/relationships rather than MEP-style ports, but connector-like interfaces may exist for steel connections:

- `structure.member_end`
- `structure.base_connection`
- `structure.support_point`

## Compatibility

A connection is valid only if both connector types are compatible under a registered rule. Compatibility must not be inferred from proximity alone.

Example:

```text
sink drainage.waste(outlet)
  ↔ pipe drainage.waste(inlet)
```

A roof downpipe bottom may connect to a rainwater drain/manhole connector but should not silently connect to a sanitary-only network.

## Connection record

```yaml
connection:
  id: connection_<uuid>
  from_connector_id: conn_a
  to_connector_id: conn_b
  system: drainage.rainwater
  state: active
  metadata: {}
```

The relationship/network topology is semantic and persisted independently from whether full physical pipe geometry is generated.

## Logical vs physical representation

Connector networks must support lightweight logical design.

Drainage example:

```text
Sink → route centerline Ø50 → Manhole
```

Physical fittings are optional LOD output:

- elbows;
- tees;
- traps;
- couplers;
- actual pipe solids.

Electrical example:

`Switch S01 controls L01-L06` may be sufficient for plan documentation without modeling wires.

## Routing contract

A routable system should expose:

- start connector;
- end connector;
- editable control nodes;
- route strategy (`shortest`, `along_wall`, `external`, `manual` etc.);
- geometric constraints;
- system constraints such as slope/invert;
- generated segments/fittings at requested LOD.

Auto-route is a proposal, not immutable geometry. Users can move route nodes and trigger validation/recalculation.

## Drainage levels

Gravity drainage connectors/segments must support semantic elevation data:

```yaml
cover_level: optional
invert_level: required_when_known
slope: derived_or_explicit
```

Unknown existing invert levels remain `unknown`/`verify_on_site`, not fabricated.

## Relocation

Moving an existing connected object through a construction relocation command does not simply drag connectors. The command must:

- preserve old lifecycle history;
- create the new object/connectors;
- evaluate network reconnection;
- retain/reuse or demolish affected segments explicitly;
- validate slope/level;
- publish topology events.

## Host loss

When a host is deleted/demolished/replaced, hosted objects follow type-specific policy:

- remain hosted to existing-to-remain geometry;
- become orphaned and flagged;
- transfer to compatible replacement host through an explicit command;
- be demolished/replaced as construction scope.

Silent deletion is not the default.

## Connector discovery

Modules register public connector capabilities through Module SDK. UI `Connect` mode queries compatible visible connectors without importing sibling module internals.

## QA baseline

Validators should detect:

- required connector left unconnected;
- incompatible connection;
- multiple connection when cardinality forbids it;
- orphaned connector;
- drainage slope/invert failure;
- route/structure clash;
- rainwater discharge without approved destination;
- hosted object with unresolved host.