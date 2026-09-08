# AI Orchestration Contract

Status: Accepted foundation contract.

## Principle

AI is an intent, search, planning and orchestration layer. It is not an alternate geometry engine and does not bypass domain rules.

Canonical path:

`User intent → AI interpretation → structured command request → domain validation/execution → events → outputs`

## Allowed AI responsibilities

AI may:

- interpret natural-language design intent;
- ask for genuinely missing information;
- search ConstructFlow catalog/library metadata;
- suggest compatible types/assemblies;
- propose routing/design options;
- compose sequences of registered commands;
- summarize QA/BOQ/drawing consequences;
- explain why a command was rejected;
- propose next workflow steps;
- compare scenarios.

## Prohibited bypasses

AI must not:

- directly mutate raw production SketchUp geometry for smart objects;
- write private module namespaces;
- edit stable object IDs;
- fabricate unknown site measurements/invert levels;
- silently approve structural engineering adequacy;
- bypass connector/host compatibility;
- bypass phase/lifecycle semantics;
- suppress required confirmation on destructive operations;
- mark dirty quantities/drawings clean without successful recalculation.

## Command discovery

Module SDK exposes AI-eligible command descriptors containing:

```yaml
name: RelocateManhole
version: 1
owner: constructflow.drainage
ai_allowed: true
confirmation: required
input_schema: ...
preconditions_summary: ...
```

AI only invokes registered current command versions.

## Structured intent example

User:

> ต่อหลังคา Poly จากผนังนี้ถึงเสาชุดนี้ ให้มีโครงเหล็ก บังใบ รางน้ำ และต่อท่อลงไปบ่อที่ใกล้ที่สุด

Possible orchestration:

1. identify selected wall/columns and active phase/level;
2. search/select compatible polycarbonate roof assembly;
3. `GenerateRoof`;
4. `GenerateRoofFrame` through registered capability;
5. `AddFasciaSystem`;
6. `AddGutter`;
7. discover compatible drainage destinations;
8. present route/destination if ambiguity or constraints exist;
9. `ConnectRoofDrainage`;
10. surface warnings/dirty outputs.

AI does not create arbitrary faces/edges as a shortcut.

## Ambiguity

AI may infer low-risk defaults only when defaults are defined by a company/project preset and are visible/reversible. It must ask or present choices for decisions that materially affect construction, cost or coordination.

Examples likely requiring choice/confirmation:

- unknown structural member size;
- destination of waste/rainwater when multiple systems exist;
- demolition of existing construction;
- moving a manhole;
- choosing a manufacturer product with different dimensions;
- changing FFL/structural levels with many dependents.

## Destructive command confirmation

Commands can declare confirmation policy:

- none;
- confirm if dependencies exist;
- always confirm.

AI cannot override this metadata.

## Engineering and site uncertainty

AI must preserve statements like:

- Assumed;
- Unknown;
- Verify on Site;
- Preliminary structural modeling only.

If requested to design structural reinforcement automatically, AI can assist in creating modeled assumptions/rules only within implemented engineering modules and must not represent results as licensed approval.

## Library search

AI should prefer selecting an existing compatible catalog/assembly over inventing a one-off object when the user's intent matches library content.

Search inputs may include:

- category;
- size/range;
- material;
- style;
- host type;
- connector requirements;
- manufacturer;
- project-approved status.

AI returns alternatives with compatibility context such as `Exact Fit`, `Resize Required`, `Not Compatible`.

## Planning multiple commands

For multi-step operations, AI can create a plan but execution must respect transaction/confirmation boundaries.

Example kitchen extension:

```text
Create Extension Zone
→ Generate architectural shell
→ assign roof
→ generate structure
→ place kitchen preset
→ propose lighting/outlets
→ propose water/waste connections
→ run QA
```

Failure in one step should not encourage AI to bypass rules in later steps.

## Explainability

User-facing AI should be able to report:

- which commands it intends to run;
- important assumptions/defaults;
- warnings/failed validations;
- resulting object IDs/types where useful;
- outputs marked dirty.

This does not require exposing internal chain-of-thought; it requires product-level action traceability.

## AI provider abstraction

AI orchestration must not hard-code one model provider into domain modules. Provider adapters may include OpenAI, Gemini, Claude or future providers. Domain command contracts remain provider-independent.

## Offline/manual survivability

ConstructFlow's deterministic modeling, editing, library, quantity and drawing capabilities must not require AI to function. AI is an enhancement layer, not a mandatory dependency for project integrity.

## Audit

AI-originated commands record actor kind `ai` and, when appropriate, orchestration/session metadata. The persisted semantic model remains readable without AI history.

## Acceptance baseline

AI integration is acceptable when the same operation executed through UI and AI reaches the same command validator/domain mutation path and produces equivalent semantic state.