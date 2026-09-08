# Canonical Data Conventions

Status: Accepted foundation contract.

## Units

- Internal canonical length: millimetres.
- User-facing units are project-configurable.
- Quantity providers normalize to declared output units such as m, m², m³, kg, pcs, pair, sheet and set.
- Do not repeatedly round intermediate calculations.

## Identifiers

- Smart object ID: stable ConstructFlow-generated ID, independent from SketchUp entity ID.
- Type IDs are canonical and namespaced by domain.
- Relationship, connector, command and event IDs are independently unique.

## Coordinate meaning

Raw SketchUp coordinates are geometry state. Construction meaning uses semantic datum/level references where applicable.

## Time / revision

Persist timestamps in an unambiguous machine format when required. Construction phase and revision are separate dimensions.

## Unknown values

Unknown construction/site facts are represented explicitly with confidence/status metadata. Do not use zero as a substitute for unknown elevation, slope, thickness or material.

## Boolean/defaults

A missing optional value is not automatically equivalent to `false`. Defaults must be defined by schema/project/module rule and remain inspectable.

## Namespaces

- Core: `constructflow.core`
- Module: `constructflow.<module>`
- Library: `constructflow.library`

## Numeric tolerance

Geometry comparisons must use documented tolerances appropriate to SketchUp/model scale rather than raw floating-point equality. Module-specific tolerances should be configurable or centrally defined where shared.

## Material / catalog references

Construction material semantics use stable material/catalog references. SketchUp display material names alone are not sufficient as BOQ/product identity.

## Collections/order

If element ordering affects construction meaning (door panels, cabinet modules, pipe route nodes), order is explicit and persisted. Do not rely on hash/map iteration order.

## Schema evolution

All persisted domain payloads declare schema version. New optional fields should be additive when possible; breaking semantics require migration and documentation.

## Text and localization

Canonical internal IDs/keys are English ASCII-style identifiers. UI/display names may be Thai/English/localized without changing IDs.

## Currency

Costing defaults may be configured for THB but currency is explicitly stored; do not infer currency solely from locale.