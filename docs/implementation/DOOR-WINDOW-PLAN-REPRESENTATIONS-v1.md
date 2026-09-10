# Door / Window Plan Representations v1

Status: Implemented slice aligned with Door/Window drawing requirements.

## Scope

`door_window.instance` exposes an on-demand semantic `plan` representation driven by:

- `InstanceDefinition`;
- referenced `DoorWindowType`;
- referenced semantic Opening and Wall definitions.

## Profiles

- Simple: opening span and schedule mark.
- Construction: operation graphics, type, size and operation annotation.
- Coordination: opening host, frame material and handing traceability.

## Operation graphics

- Swing uses a semantic leaf line plus quarter-circle swing arc.
- Sliding uses a semantic motion arrow along the hosted opening span.
- Fixed uses a fixed-panel symbol.

The provider does not rediscover host geometry from raw SketchUp edges. Swap Type therefore changes the plan representation from the same instance identity and same opening host.
