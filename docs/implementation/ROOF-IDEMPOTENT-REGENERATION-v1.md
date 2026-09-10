# Roof Idempotent Regeneration v1

## Purpose

Add the second production regeneration slice after Structure: a Roof owned by the Roof domain, generated from an Extension and rebuilt in place when the Extension changes.

## Command

`GenerateOrUpdateRoofFromExtension`

Owner: `constructflow.roof`

The Extension module supplies intent. The Roof module remains the only owner allowed to create or rebuild roof geometry.

## Stable Source Relationship

The generated `roof.system` Smart Object stores:

- kind: `generated_from`
- target_id: Extension Smart Object ID
- role: `extension_source`
- metadata.domain: `roof`
- metadata.slot: `primary`

This relationship is the idempotency key. Re-running the same Extension must find the existing roof and rebuild it rather than creating a duplicate.

## Create Path

Extension intent -> RoofDefinition -> validate -> create Roof group -> create Smart Object -> persist RoofDefinition -> add source relationship -> mark quantity/drawing dirty.

## Update Path

Extension intent -> resolve existing roof by source relationship -> RoofDefinition -> validate -> `Geometry#rebuild_roof!` -> persist RoofDefinition -> mark quantity/drawing dirty.

The Smart Object ID and SketchUp group identity remain stable across regeneration.

## Supported Intent v1

- boundary
- base level / base offset
- target height
- roof form (`lean_to` or `flat`)
- slope percent
- slope direction
- covering system
- thickness

Default covering is `metal_sheet`; default slope is 5%.

## Proven Scenario

1. Generate a 6 m x 4 m extension roof.
2. Resize the extension boundary to 7 m x 4 m.
3. Regenerate.
4. Expect one existing roof Smart Object to be updated, zero new roof objects, and plan area to change from 24 m² to 28 m².

## Next Slice

Connect Roof regeneration to rainwater impact: gutter/downpipe/drainage regeneration or dirty propagation, without allowing Roof to mutate Drainage geometry directly.
