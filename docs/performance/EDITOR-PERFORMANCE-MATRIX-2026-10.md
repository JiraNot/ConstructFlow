# Editor Engine Performance Matrix — 2026-10

**Generated:** 2026-10-13T09:52:17.108Z  
**Runtime:** v24.19.0, win32 x64  
**Method:** 3 warmups, 12 measured runs per operation; nearest-rank p50/p95. All values are milliseconds.

These are synchronous Node engine timings for named project fixtures. They do not measure browser rendering, pointer-to-paint latency, React scheduling, or native CAD. Results are informational; no latency thresholds are defined.

| Fixture | Objects | Operation | p50 ms | p95 ms |
| --- | ---: | --- | ---: | ---: |
| kitchen-proof | 21 | Object summary | 0.004 | 0.006 |
| kitchen-proof | 21 | Plan projection | 0.002 | 0.005 |
| kitchen-proof | 21 | Snap index build | 0.025 | 0.045 |
| kitchen-proof | 21 | Snap candidate query | 0.006 | 0.009 |
| kitchen-proof | 21 | Coordination | 9.258 | 13.864 |
| kitchen-proof | 21 | Takeoff | 0.256 | 0.327 |
| kitchen-proof | 21 | Phased BOQ | 0.378 | 0.405 |
| kitchen-proof | 21 | Drawing set compile | 0.407 | 0.508 |
| reference-house-2storey | 239 | Object summary | 0.033 | 0.080 |
| reference-house-2storey | 239 | Plan projection | 0.008 | 0.107 |
| reference-house-2storey | 239 | Snap index build | 0.140 | 0.733 |
| reference-house-2storey | 239 | Snap candidate query | 0.028 | 0.043 |
| reference-house-2storey | 239 | Coordination | 164.994 | 170.058 |
| reference-house-2storey | 239 | Takeoff | 4.119 | 6.569 |
| reference-house-2storey | 239 | Phased BOQ | 4.491 | 6.807 |
| reference-house-2storey | 239 | Drawing set compile | 0.551 | 0.842 |
| renovation-house-plus-kitchen | 260 | Object summary | 0.042 | 0.096 |
| renovation-house-plus-kitchen | 260 | Plan projection | 0.015 | 0.023 |
| renovation-house-plus-kitchen | 260 | Snap index build | 0.101 | 0.405 |
| renovation-house-plus-kitchen | 260 | Snap candidate query | 0.010 | 0.011 |
| renovation-house-plus-kitchen | 260 | Coordination | 184.887 | 212.060 |
| renovation-house-plus-kitchen | 260 | Takeoff | 4.146 | 5.703 |
| renovation-house-plus-kitchen | 260 | Phased BOQ | 2.649 | 4.836 |
| renovation-house-plus-kitchen | 260 | Drawing set compile | 0.758 | 1.244 |

Raw measurements: [EDITOR-PERFORMANCE-MATRIX-2026-10.json](./EDITOR-PERFORMANCE-MATRIX-2026-10.json).
This matrix covers 21-object kitchen, 239-object two-storey house, and 260-object combined renovation fixtures. It does not cover 500/1,000/5,000/20,000-object stress projects, load/schema validation, hit testing, marquee selection, undo/redo, serialization, or canvas frame time.
