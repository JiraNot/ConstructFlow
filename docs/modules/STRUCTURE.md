# Structure Module

Status: Proposed v1  
Module ID: `constructflow.structure`

## Mission

Own structural-modeling semantics used for renovation and extension documentation: piles, pile caps, footings, ground beams, columns, beams, slabs, structural steel, connections and reinforcement metadata.

ConstructFlow provides modeling, coordination and takeoff assistance. It does not represent generated sizes/reinforcement as licensed engineering approval.

## Owns

- StructuralGridReference where domain-specific
- Pile
- PileGroup
- PileCap
- Footing
- GroundBeam
- Column
- Beam
- Slab
- SteelMember
- SteelConnection
- BasePlate
- AnchorBoltSet
- RebarSet
- RebarShape / BBS row metadata

## Dependencies

Required:

- Core Project/Units/Levels/Phase.

Optional capabilities:

- Site ground references;
- Architecture host/room references;
- Roof frame intent;
- Drainage/MEP geometry for coordination;
- Quantity/Drawings/QA.

## Level semantics

Use semantic level roles where appropriate:

- PCL — pile cut-off;
- TOF / BOF — footing/pile cap;
- TOB / BOB — beams;
- SSL/TOS — structural slab;
- column base/top references.

Raw geometry must not be the only source of vertical meaning.

## Foundation objects

Pile:

- type/profile;
- nominal dimensions;
- cut-off level;
- length/depth;
- phase;
- source/engineering status.

PileGroup:

- pattern;
- pile count;
- spacing;
- host pile-cap reference.

Footing/PileCap:

- width/length/thickness;
- level/depth;
- supported column/wall relation;
- rebar set references.

## Beams / columns / slabs

Common parameters:

- section/type;
- start/end/support references;
- level/offsets;
- material;
- reinforcement metadata;
- structural status/assumption.

Slabs distinguish at least:

- slab-on-ground;
- suspended slab.

Architectural finish belongs to Architecture/Surface; structural slab belongs here.

## Structural steel

Profiles:

- Box/RHS/SHS;
- Pipe;
- H/I;
- C channel;
- Angle;
- generic catalog profile.

Steel connection objects can include:

- base plate;
- anchor bolt;
- end plate;
- gusset;
- bolt/weld metadata.

## Rebar strategy

Default semantic RebarSet supports:

- bar grade/type;
- diameter;
- count/spacing;
- top/bottom/side role;
- shape/bend/lap metadata;
- cover;
- host member.

LOD behavior:

- LOD 200/quantity: metadata only or representative lines;
- LOD 300: drawing representation;
- LOD 400: selected/full physical bars on demand.

Full 3D bars are not required for BBS/weight takeoff.

## Commands

- `CreateColumn`
- `CreateBeam`
- `CreateSlab`
- `CreatePileGroup`
- `GenerateFoundation`
- `ConnectGroundBeam`
- `CreateSteelMember`
- `ApplySteelConnection`
- `AssignRebarSet`
- `ModifyRebarSet`
- `GeneratePhysicalRebar`
- `ConvertSelectionToStructuralMember`

## Phase behavior

Existing structural objects may be modeled as Existing/Remain/Modify/Demolish. New foundations/frames are New. Structural replacement must preserve old/new lifecycle rather than geometry overwrite.

## Existing uncertainty

Unknown existing reinforcement, footing depth or hidden sizes remain Unknown/Verify On Site. The module must not infer hidden reinforcement as fact.

## Quantity

Provider outputs can include:

- concrete m3;
- formwork m2;
- rebar kg/m/count;
- steel member length/kg/pieces;
- pile count/length;
- plates/bolts where defined.

Formula/version traceability is required.

## Drawing

- pile/foundation plan;
- footing/pile-cap schedule;
- ground beam/column/beam/slab plan;
- roof framing plan for structural members;
- steel connection details;
- RC sections/details;
- reinforcement drawings;
- BBS.

## QA / Coordination

Modeling/coordination checks:

- unsupported/floating beam or column;
- missing foundation support relation;
- footing/pile-cap collision with known existing drain/manhole;
- beam/pipe conflict;
- duplicate/overlapping structural members;
- unresolved level;
- RebarSet missing required host/diameter/count;
- member profile missing catalog/section properties required for takeoff.

Engineering checks, if ever implemented, must be clearly separated from licensed design approval.

## Acceptance criteria

- AC-STR-001: create column with semantic base/top level and persist/reopen.
- AC-STR-002: generate footing or pile-cap from selected column using a chosen preset without losing domain ownership.
- AC-STR-003: Connect Ground Beam creates support relationships and level-aware beams.
- AC-STR-004: clash with known existing drain/manhole is reportable by QA through public geometry/capability interfaces.
- AC-STR-005: RebarSet produces BBS/weight without physical 3D bars.
- AC-STR-006: physical rebar generation can be removed/regenerated without changing semantic reinforcement identity.
- AC-STR-007: steel profile swap updates quantity and drawing dirty states.
- AC-STR-008: structural outputs visibly state preliminary/modeling status where engineering approval is not provided.

## Deferred

- automatic code-compliant structural sizing/analysis;
- finite-element analysis;
- licensed engineering certification;
- full fabrication connection design in foundation releases.