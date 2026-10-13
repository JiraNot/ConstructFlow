# Residential Production Acceptance — 2026-10

**Review date:** 2026-10-13  
**Status:** PARTIAL — the current evidence is split between the 239-object two-storey reference house and smaller command-generated Kitchen Proof acceptance projects. A single awkward-geometry renovation-extension project has not yet been assembled and reviewed end to end.

## Evidence used

- `examples/constructflow-reference-house-2storey.cfproj` is validated by `verify:house-demo`: datums, storey-specific plans/framing, hosted openings, stairs, level/layer/slope edits, Undo/Redo, save/reopen, representations and supported clash checks.
- `verify:kitchen` checks the kitchen extension vertical slice through model, phase, takeoff, serialization and A-02/S-01/A-08 output.
- `verify:coordination` checks a 21-object project and 47 coordination assertions. It is not broad full-house MEP acceptance.
- `verify:phases` checks a 44-object phase proof, 21 domain outputs, 22 A3 pages and 62 takeoff rows; it reports 14 missing-data warnings.
- `docs/generated/BUILD-STATUS.md` records the most recent complete automated build/test/verifier run. These checks do not replace live editor, visual sheet or native CAD acceptance.

## Workflow results

| Workflow | Status | Evidence and remaining gap |
| --- | --- | --- |
| Existing two-storey house and levels | PASS | Reference-house verifier covers stable IDs, level datums, floor build-ups, stair, representations and storey visibility. Boundary survey and real company project provenance are absent. |
| Existing / demolition lifecycle | PARTIAL | Phases and phase-aware outputs exist and are covered separately. A demolition plan tied to a remodeled existing host has not been exercised in the reference house workflow. |
| Kitchen extension attached to existing house | PARTIAL | Kitchen preset/fixture passes its standalone slice. It has not been reconciled against the two-storey house's irregular existing wall or opened/visually reviewed as one combined project. |
| Carport extension | PARTIAL | Preset validation covers editable structural/slab/roof objects and non-zero datums. Attachment, awkward parcel geometry and full downstream outputs are not part of an integrated acceptance project. |
| Structural frame and foundations | PARTIAL | Commands, levels, reinforcement and schedules have package-level coverage; whole-project design coordination and engineering review remain open. |
| Roof and rainwater | PARTIAL | Roof topology, openings, overhang, gutters/downpipes and saved rainwater settings have targeted tests. Family catalog cascade and live cross-view acceptance remain open. |
| Architecture, openings and interior | PARTIAL | Hosted openings, walls, floors, ceilings, stairs and some cabinet behavior have automated coverage. Long interactive editing, cabinet/worktop completeness and family-accurate elevation preview remain unreviewed. |
| Electrical and plumbing | PARTIAL | Fixture/circuit assignment, load validation, pipe-route editing and gravity-grade logic have targeted tests. Visible circuit paths, conduit, fittings and broad MEP coverage remain open. |
| Drainage / roof discharge | PARTIAL | Coordination verifier and roof/rainwater regressions pass on limited fixtures. End-to-end roof-to-destination routing on the combined renovation project remains unverified. |
| Coordination | PARTIAL | 47 checks pass for the configured 21-object fixture. The listed real interactions across all target families have not all been accepted on a large residential project. |
| Sheets, takeoff and BOQ | PARTIAL | Deterministic sheet/takeoff verifiers pass. Visual review across a representative combined project and publication readiness remain open; `issue_ready` is not legal or engineering approval. |
| Save, reopen, undo and redo | PASS for tested slices | File-I/O, command-runtime and reference-house tests verify tested objects and relationships. A single combined full-workflow project roundtrip remains to be run. |

## Production project still required

Build one command-driven `.cfproj` from the reference house and a selected extension workflow. Use a surveyed/approved source if available; do not invent parcel, structural or hydraulic design inputs. The acceptance model should capture the existing host's actual offset, explicit demolition intent, wet area, roof discharge, cabinets, devices, pipe routes and structural coordination. Record all missing inputs rather than filling them with assumed values.

Then run and record create/edit/move/resize/delete, undo/redo and save/reopen for supported families, followed by plan/elevation/3D review, coordination, sheet, takeoff and BOQ checks. Update each PARTIAL row only when that evidence exists.

No permit readiness, legal compliance conclusion, or engineering design approval is claimed by this report.
