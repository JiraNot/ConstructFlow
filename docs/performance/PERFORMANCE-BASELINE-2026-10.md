# Performance Baseline — 2026-10

**Run date:** 2026-10-13  
**Runtime:** Node v24.19.0, win32 x64  
**CPU:** 11th Gen Intel(R) Core(TM) i7-11800H @ 2.30GHz

This is a deterministic Node benchmark, not a browser FPS claim. The fixture contains parallel residential wall runs, one local snap candidate and distant distractors. Snap tolerance is 16 screen pixels at zoom 1. Results compare the existing full-project `snapPoint` scan with the new `SnapSpatialIndex` broad phase followed by the same exact snap resolver.

Run with:

```bash
npm --prefix packages/snapping-engine run build
npm --prefix packages/snapping-engine run bench:snap
```

## Snap lookup

Index construction is measured once for each project snapshot. Candidate query uses the median of 11 samples. Full and indexed snap resolution use the median of 7 paired samples. Values are milliseconds.

| Objects | Index build | Candidate query median | Local candidates | Full scan median | Indexed snap median | Same result |
| ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| 500 | 0.927 | 0.003 | 1 | 3.102 | 0.044 | Yes |
| 1,000 | 0.871 | 0.001 | 1 | 6.704 | 0.080 | Yes |
| 5,000 | 6.511 | 0.001 | 1 | 173.499 | 0.032 | Yes |

The indexed path rebuilds the plan index when the memoized plan-project snapshot changes. The benchmark does not measure React scheduling, pointer event frequency, drawing, browser layout, or project mutation cost. It establishes that for this sparse fixture, broad-phase pruning preserves the full-scan snap result and avoids the full scan's segment-pair growth.

## Remaining measurements

The sprint's full performance matrix is still open. The following operations have not yet been benchmarked at 500, 1,000 and 5,000 objects: project load and validation, plan representation generation/render preparation, hit testing, marquee selection, coordination broad/narrow phase, takeoff, sheet compilation, Undo/Redo and serialization. The 20,000-object stretch target is also unmeasured. Do not infer those results from the snap benchmark.
