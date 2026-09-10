# SketchUp Scene Presentation

Status: Accepted v1 foundation contract.

## Purpose

ConstructFlow drawing presets generate multiple plan outputs from the same Smart Object model. SketchUp Scene presentation must isolate the active generated drawing without requiring users to manually manage ConstructFlow tags.

## Ownership rule

The Drawing platform owns scene composition and visibility. Domain modules own semantic representation content. Scene presentation must not infer domain meaning from raw geometry.

## Managed tag boundary

ConstructFlow may change visibility only for tags it owns:

- `CF-DRAWING-*` — managed drawing-output groups;
- `CF-STYLE-*` — generated native graphic-style tags.

Unrelated user/project tags must remain untouched.

## Presentation behavior

When a drawing scene is refreshed:

1. the scene's active `CF-DRAWING-*` tag is visible;
2. other ConstructFlow drawing-output tags are hidden;
3. `CF-STYLE-*` tags needed by generated children remain visible;
4. unrelated user tags retain their current visibility;
5. the Scene/Page is updated after visibility and camera configuration.

This uses parent drawing-group isolation rather than duplicating domain objects or creating a separate 2D model.

## Example

```text
Plumbing Plan - Simple
  CF-DRAWING-SIMPLE          visible
  CF-DRAWING-CONSTRUCTION    hidden
  CF-DRAWING-COORDINATION    hidden
  CF-STYLE-*                 visible as required

Plumbing Plan - Construction
  CF-DRAWING-SIMPLE          hidden
  CF-DRAWING-CONSTRUCTION    visible
  CF-DRAWING-COORDINATION    hidden
  CF-STYLE-*                 visible as required
```

## Phase and discipline

Phase filtering occurs before representation generation. Scene presentation is a display/composition concern and must not replace semantic lifecycle filtering.

Future discipline/background controls may extend the presentation contract, but they must use explicit managed-tag rules rather than blanket changes to project visibility.

## Safety

Scene presentation must be best-effort when SketchUp APIs are unavailable and must never mutate arbitrary user tags. Refresh remains inside the existing ConstructFlow transaction boundary.

## Acceptance criteria

1. Refreshing one managed plan scene hides other `CF-DRAWING-*` outputs.
2. The active drawing tag remains visible.
3. `CF-STYLE-*` tags remain visible so child line styles can render.
4. Non-ConstructFlow tags are not modified.
5. Presentation result reports the active drawing tag and managed tag set for traceability/testing.
6. Repeated refresh remains idempotent and does not create duplicate drawing identities.
