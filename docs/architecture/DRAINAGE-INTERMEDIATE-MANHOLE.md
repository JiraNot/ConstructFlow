# Drainage Intermediate Manhole Split

Status: Accepted v1 foundation contract.

## Purpose

`InsertIntermediateManhole` inserts a semantic manhole into an existing drainage route and splits the route while preserving network continuity. It is not a decorative symbol insertion and it must not leave the original connector topology silently disconnected.

## Split input

The command identifies:

- an existing `drainage.pipe_route` Smart Object;
- a semantic route segment index;
- a ratio within that segment (`0 < ratio < 1`);
- optional manhole size, cover level, type and display name.

The split location is interpolated on the semantic route. When both route endpoint inverts are known, split invert is interpolated by travelled horizontal route distance. If either endpoint invert is unknown, the split invert remains unknown/Verify On Site.

## Lifecycle behavior

### Existing route

An Existing route represents installed construction. Inserting a new manhole is replacement work:

1. mark the original Existing route Demolition;
2. disconnect its old connector connection;
3. create a New Construction manhole;
4. create New Construction upstream and downstream route Smart Objects;
5. add `replaces/replaced_by` relationships from the two new segments to the old route;
6. preserve system, diameter and material unless the command explicitly changes them.

### Proposed/New Construction route

For a route already in proposed work, the original Smart Object identity is retained as the upstream segment. Its endpoint is reconnected to the new manhole inlet and its definition/geometry are regenerated. A new downstream route is created from the manhole outlet to the original destination.

This avoids inventing demolition history for construction that has not yet existed.

## Connector continuity

The resulting topology is always:

`old upstream endpoint -> upstream route -> new manhole inlet -> new manhole outlet -> downstream route -> old downstream endpoint`

No route segment may be considered complete if its connector connection is missing.

## Propagation

Insertion emits topology and insertion events and marks affected Smart Objects Quantity/Drawing dirty. Validation warnings from both resulting route segments remain visible.

## Acceptance criteria

- AC-DRN-021: a route can be split at a deterministic semantic segment/ratio and the two resulting route definitions share the same split point.
- AC-DRN-022: known endpoint inverts produce a deterministic split invert by travelled horizontal distance; unknown endpoint data remains Verify On Site.
- AC-DRN-023: inserting into Existing construction creates demolition history plus two New Construction route segments and replacement relationships.
- AC-DRN-024: inserting into proposed/New Construction retains the original route identity for one segment and creates only the additional downstream route.
- AC-DRN-025: resulting connector topology remains continuous through the inserted manhole and all affected Quantity/Drawing outputs are dirtied.
