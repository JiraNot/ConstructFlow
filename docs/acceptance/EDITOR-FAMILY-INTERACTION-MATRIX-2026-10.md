# Editor Family Interaction Acceptance — 2026-10

This matrix distinguishes implementation support from browser acceptance. A unit-level command builder or preview test does not count as a committed browser workflow. `N/A` means the family has no meaningful size grip in its current model contract; `open` means evidence is still missing, not that the command is known to fail.

| Object family | Create: browser | Move: unit / browser | Resize: unit / browser | Delete: browser | Evidence / remaining work |
| --- | --- | --- | --- | --- | --- |
| Wall | Mouse + keyboard | Family-aware / drag, numeric dimensions, group | Endpoint / target length | Multi-family batch / Undo/Redo / reopen | Hosted opening move, split, join and trim preserve UUID/host relationships; single-family and dependent-host cleanup coverage remains open. |
| Beam | Mouse + keyboard | Family-aware / elevation group | Endpoint / target span | Multi-family batch / Undo/Redo / reopen | Continuous support split/join and undo verified; single-family delete and full plan visual review open. |
| Door / window | Hosted placement, mouse + keyboard | Through host wall / window rehost and alignment | Opening width / jamb target width | Multi-family batch / Undo/Redo / reopen | Door-specific resize, single-family deletion and complete host/undo roundtrip open. |
| Column | Point placement, mouse + keyboard | Family-aware / browser group move | Corner W/H / numeric preview, Escape, Undo/Redo | Multi-family batch / Undo/Redo / reopen | Browser verifies creation and dimension edit; single-family delete and all-host dependency cleanup remain open. |
| Foundation | Type picker and catalog command | Family-aware / unit only | Corner W/H / numeric preview, Escape, Undo/Redo | Multi-family batch / Undo/Redo / reopen | Browser resize covered; family-specific move and single-family delete workflows remain open. |
| Structural slab | Polygon placement | Family-aware / unit only | Edge offset and vertex ΔX/ΔY / numeric preview, Escape, Undo/Redo | Multi-family batch / Undo/Redo / reopen | Browser geometry edit covered; single-family deletion remains open. |
| Architectural floor / ceiling | Catalog/workbench commands | Family-aware / unit only | Polygon manipulation / unit only | Open | Ceiling property edit is covered; full placement/resize/delete browser sequence open. |
| Roof | Type picker and catalog command | Family-aware / unit only | Roof grip preview / unit only | Multi-family batch / Undo/Redo / reopen | Visual selection and type edits covered; full roof edit lifecycle open. |
| Stair | Preset/workbench placement | Family-aware / unit only | Width, run and landing / browser preview, UUID, Undo/Redo | Multi-family batch / Undo/Redo / reopen | Straight, L and U grip cases are covered; single-family deletion and complete multi-view visual review open. |
| Room / room separator | Derived room / toolbar | Family-aware / unit only | Separator target length / browser preview and Undo/Redo | Multi-family batch / Undo/Redo / reopen | Room is derived from boundaries; separator is editable. Single-family and separator deletion acceptance is open. |
| Grid / grid system | Grid tools | Family-aware / unit only | Numeric spacing / browser property edit | Multi-family batch / Undo/Redo / reopen | Grid-system placement and ceiling grid spacing are covered; single-family lifecycle matrix remains open. |
| Electrical fixture / circuit / LED | Toolbar or workbench command | Family-aware / unit only | N/A for point/run contracts, except editable run nodes | Open | Circuit phase balance has browser acceptance; point/run create, edit and delete matrix open. |
| Plumbing / drainage routes and devices | Toolbar or workbench command | Family-aware / unit only | Route-node grip / unit only | Open | Pipe endpoint draft/cancel and route geometry tests exist; committed device lifecycle coverage open. |
| Cabinet / moulding | Toolbar or workbench command | Family-aware / unit only | Run endpoints / unit only | Open | Moulding endpoint draft/cancel is browser-tested; edit/delete/placement acceptance open. |
| Foundation details, rebar, panel layouts and other generated/schedule data | Domain command or derived data | Varies by owning domain | N/A where not independently geometric | Varies | Do not count generated schedule records as directly editable canvas objects; domain-specific acceptance is tracked by package tests. |

## Shared workflow evidence

- Tool status, steps, constraints, repeat and Escape behavior are covered by interaction-registry/unit tests for every toolbar tool. Browser workflows exercise mouse/keyboard wall, beam, hosted opening, point and selected route/polygon cases.
- `direct-manipulation.test.mjs` checks family-aware move command construction and ghost preview for 22 plan families. Browser tests cover representative wall, elevation-group, column, foundation, slab, wall endpoint, opening, beam, room-separator and stair edits.
- Browser tests cover preview/cancel/commit, stable UUID and Undo/Redo for representative resize, array, align/offset/mirror/join/split/trim operations. This is not yet a full family-by-operation cross product.
- `Project Browser deletes every reference-house object family with one undoable transaction` selects one object from each of 11 families (grid, column, foundation, beam, wall, door, window, room, slab, stair and roof), checks one batched delete, one Undo/Redo and save/reopen. This is a fixture batch case, not the full family-by-operation matrix; independent deletion, all-host cascades and remaining families still need coverage.

## Close criteria

Add parameterized browser coverage for the families with supported commands, marking only contractually unsupported operations `N/A`. For every supported operation, verify preview where applicable, commit through CommandBus, selected UUIDs, one-step Undo/Redo, and save/reopen. Attach the fixture and browser environment to the run. Keep surveyed-client review separate from this fixture matrix.
