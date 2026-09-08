# Specification ID Convention

Status: Accepted process contract.

Use stable IDs so implementation, tests and docs can reference the same requirement.

## Prefixes

- `OBJ-<DOMAIN>-###` — smart-object/type requirement
- `CMD-<DOMAIN>-###` — command
- `EVT-<DOMAIN>-###` — event
- `AC-<DOMAIN>-###` — acceptance criterion
- `WF-###` — workflow (existing workflow registry IDs may be retained)
- `ADR-####` — architecture decision

## Domain codes

Recommended short codes:

- CORE
- SITE
- ARCH
- OPEN
- DW
- DEC
- EXT
- ROOF
- STR
- SURF
- LAND
- INT
- ELEC
- PLB
- DRN
- LIB
- QTY
- DRAW
- QA
- REV
- AI

IDs are persistent references. Do not renumber old IDs simply to make lists visually sequential; deprecate/supersede with notes instead.

Tests and PR descriptions should cite relevant AC/CMD/OBJ IDs once detailed registries assign them.