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

## Drawing

- plan symbols/open direction;
- elevation representation;
- Door Schedule;
- Window Schedule;
- type ID (D01/W01);
- head/jamb/sill detail anchors.

## QA

- opening mismatch;
- invalid panel widths;
- swing collision where geometry context exists;
- missing required glazing/frame metadata;
- host/orientation unresolved;
- duplicate schedule type IDs.

## Acceptance criteria

- AC-DW-001: create fixed/sliding/swing configurations from one parametric family system.
- AC-DW-002: multiple instances of one type update when Type changes.
- AC-DW-003: Make Unique breaks type sharing without losing instance placement.
- AC-DW-004: Swap Type preserves phase/host/stable object ID when compatible.
- AC-DW-005: Replace Existing creates demolition + new object history.
- AC-DW-006: schedules update after type/size/material change.
- AC-DW-007: opening resize required by swap is previewed/confirmed rather than silently cutting host.