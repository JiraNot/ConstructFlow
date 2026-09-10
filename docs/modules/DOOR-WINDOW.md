# Door & Window Module

Status: Proposed v1  
Module ID: `constructflow.door_window`

## Mission

Own parametric door/window infill assemblies, type/instance behavior, panel configuration, frames, glazing and schedules.

## Owns

- DoorWindowType
- DoorWindowInstance
- Frame
- Leaf/Panel
- GlazingPanel
- Track
- Threshold/Sill metadata
- HardwareAssignment at architectural level

## Families

Doors/windows must support combinations rather than isolated hard-coded objects:

- single/double swing;
- sliding 2/3/4+ panels;
- fixed;
- casement/awning;
- folding;
- fixed + sliding/opening mixes;
- transom;
- sidelight;
- solid/panel/glazed leaves;
- ลูกฟัก / panel styles.

## Type / instance

Type owns reusable configuration/dimensions/material defaults. Instance owns placement, host/opening relation, phase and allowed overrides.

`Swap Type` preserves identity/placement where compatible. `Replace Construction` creates lifecycle history.

## Commands

- `CreateDoorWindow`
- `AttachDoorWindowToOpening`
- `SwapDoorWindowType`
- `ReplaceExistingDoorWindow`
- `ChangePanelConfiguration`
- `ChangeFrameSystem`
- `AssignGlazing`
- `MakeUniqueType`
- `GenerateOrUpdateDoorWindowFromExtension` — opt-in Extension attachment-infill bridge defined by `EXTENSION-ATTACHMENT-INFILL.md`.

## Extension attachment infill

An Extension attached to an existing building may create a deliberate hosted Opening through the Opening-owned workflow. That Opening still does not imply an infill. Door/Window generation is independently opt-in.

The Extension bridge consumes only the effective Extension Construction Intent and requires the current generated `attachment_opening`. It creates or updates one `door_window.instance` carrying `generated_from` provenance to the source Extension with stable slot `attachment_infill`, plus the normal `host` relationship to the Opening.

The preferred dependency remains:

`Extension → Architecture attachment host → Opening → DoorWindowInstance`

The bridge accepts either a registered `type_id` or explicit `category` + `operation`. A project-local generated type always adopts the current Opening width/height so Door/Window generation cannot silently resize a destructive host cut. Missing frame/panel construction data remains `assumed`; an explicit registered type or fully specified project-local construction data can be `confirmed`.

Re-running type/config intent updates the same generated Smart Object while the Opening identity is unchanged. Rehosting to a different Opening requires explicit `door_window.rehost: true` and normal fit validation. Omitted Door/Window intent is non-destructive; only explicit `door_window.enabled: false` reconciles the generated attachment infill.

Command validation must be side-effect free. Project-local type registration is a command mutation and occurs only inside successful command execution, never merely because validation/preview ran.

## Panel configurator

Panel layout is defined by ordered segments/rows with roles:

- fixed;
- slide-left/right;
- swing-left/right;
- glass;
- solid panel;
- transom;
- sidelight.

Dimensions may be equal, ratio-based or explicit with min/max rules.

## ลูกฟัก / decorative panel

Panel styles:

- flat;
- shaker;
- raised panel;
- routed/grooved;
- mixed glass/panel.

Panel profile/detail can come from Library without embedding product-specific logic in Core.

## Materials

- aluminium;
- wood;
- steel;
- uPVC where cataloged;
- glass types and thickness metadata;
- finish/color.

## Host/opening

Preferred relation:

`DoorWindowInstance → Opening → Wall host`

The module may support direct wall-host placement by creating/owning a compatible Opening through public command orchestration.

Extension attachment generation follows the same host relationship and never bypasses the Opening capability.

## Catalog

Compatibility groups:

- Exact Fit — same required opening;
- Resize Required — host opening can be changed after confirmation;
- Not Compatible — cannot place under current host/clearance rules.

Manufacturer assets can override frame/profile/product metadata while preserving generic semantic family.

## Quantity

- frame length/sets where modeled/formula-defined;
- glazing area;
- panel count/area;
- hardware count where rule-defined;
- unit count for BOQ/schedule.

Generated Extension infills use the same `DoorWindowQuantityProvider`; project-level orchestration may aggregate those items but must not re-derive quantities from raw geometry.

## Drawing

- plan symbols/open direction;
- elevation representation;
- Door Schedule;
- Window Schedule;
- type ID (D01/W01);
- head/jamb/sill detail anchors.

Generated Extension infills use the same plan representation and appear in the selected Extension's Architecture drawing/currentness scope through Smart Object provenance.

## QA

- opening mismatch;
- invalid panel widths;
- swing collision where geometry context exists;
- missing required glazing/frame metadata;
- host/orientation unresolved;
- duplicate schedule type IDs;
- generated Extension infill requested without current generated attachment Opening;
- generated infill rehost attempted without explicit transition intent.

## Acceptance criteria

- AC-DW-001: create fixed/sliding/swing configurations from one parametric family system.
- AC-DW-002: multiple instances of one type update when Type changes.
- AC-DW-003: Make Unique breaks type sharing without losing instance placement.
- AC-DW-004: Swap Type preserves phase/host/stable object ID when compatible.
- AC-DW-005: Replace Existing creates demolition + new object history.
- AC-DW-006: schedules update after type/size/material change.
- AC-DW-007: opening resize required by swap is previewed/confirmed rather than silently cutting host.
- AC-DW-008: Extension attachment infill is opt-in, depends on the generated attachment Opening and carries stable `attachment_infill` provenance.
- AC-DW-009: Extension infill regeneration/type change preserves Smart Object identity while the Opening remains compatible and unchanged.
- AC-DW-010: explicit Extension infill disable detaches and reconciles only generated new-work infill; omission is non-destructive.
- AC-DW-011: generated Extension infill quantity/drawing output is produced by the normal Door/Window providers, not duplicated in Extension logic.
