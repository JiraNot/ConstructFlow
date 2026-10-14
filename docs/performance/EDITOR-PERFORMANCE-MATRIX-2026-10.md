# Editor Engine Performance Matrix — 2026-10

- **Generated:** 2026-10-14T02:37:15.805Z
- **Runtime:** v24.19.0, win32 x64
- **Method:** 1 warmups, 4 measured runs per operation; nearest-rank p50/p95. All values are milliseconds.

These are synchronous Node engine timings for named project fixtures. They do not measure browser rendering, pointer-to-paint latency, React scheduling, or native CAD. Results are informational; no latency thresholds are defined.

| Fixture | Objects | Operation | p50 ms | p95 ms |
| --- | ---: | --- | ---: | ---: |
| kitchen-proof | 21 | Object summary | 0.004 | 0.023 |
| kitchen-proof | 21 | Plan projection | 0.002 | 0.004 |
| kitchen-proof | 21 | Plan hit test | 0.005 | 0.009 |
| kitchen-proof | 21 | Snap index build | 0.027 | 0.049 |
| kitchen-proof | 21 | Snap candidate query | 0.010 | 0.023 |
| kitchen-proof | 21 | Coordination | 11.100 | 13.764 |
| kitchen-proof | 21 | Takeoff | 0.294 | 0.709 |
| kitchen-proof | 21 | Phased BOQ | 0.770 | 0.958 |
| kitchen-proof | 21 | Drawing set compile | 0.747 | 0.958 |
| reference-house-2storey | 239 | Object summary | 0.068 | 0.073 |
| reference-house-2storey | 239 | Plan projection | 0.017 | 0.021 |
| reference-house-2storey | 239 | Plan hit test | 0.025 | 0.035 |
| reference-house-2storey | 239 | Snap index build | 0.441 | 0.496 |
| reference-house-2storey | 239 | Snap candidate query | 0.030 | 0.072 |
| reference-house-2storey | 239 | Coordination | 128.439 | 142.945 |
| reference-house-2storey | 239 | Takeoff | 4.798 | 5.535 |
| reference-house-2storey | 239 | Phased BOQ | 4.339 | 4.764 |
| reference-house-2storey | 239 | Drawing set compile | 0.637 | 1.016 |
| renovation-house-plus-kitchen | 260 | Object summary | 0.036 | 0.043 |
| renovation-house-plus-kitchen | 260 | Plan projection | 0.007 | 0.008 |
| renovation-house-plus-kitchen | 260 | Plan hit test | 0.012 | 0.041 |
| renovation-house-plus-kitchen | 260 | Snap index build | 0.219 | 0.231 |
| renovation-house-plus-kitchen | 260 | Snap candidate query | 0.021 | 0.030 |
| renovation-house-plus-kitchen | 260 | Coordination | 136.978 | 153.389 |
| renovation-house-plus-kitchen | 260 | Takeoff | 3.554 | 3.594 |
| renovation-house-plus-kitchen | 260 | Phased BOQ | 3.014 | 3.390 |
| renovation-house-plus-kitchen | 260 | Drawing set compile | 0.827 | 0.848 |
| synthetic-house-478 | 478 | Object summary | 0.067 | 0.095 |
| synthetic-house-478 | 478 | Plan projection | 0.013 | 0.036 |
| synthetic-house-478 | 478 | Plan hit test | 0.016 | 0.017 |
| synthetic-house-478 | 478 | Snap index build | 0.214 | 0.217 |
| synthetic-house-478 | 478 | Snap candidate query | 0.038 | 0.039 |
| synthetic-house-478 | 478 | Coordination | 272.290 | 306.420 |
| synthetic-house-956 | 956 | Object summary | 0.141 | 0.146 |
| synthetic-house-956 | 956 | Plan projection | 0.027 | 0.028 |
| synthetic-house-956 | 956 | Plan hit test | 0.029 | 0.030 |
| synthetic-house-956 | 956 | Snap index build | 0.513 | 1.092 |
| synthetic-house-956 | 956 | Snap candidate query | 0.059 | 0.062 |
| synthetic-house-956 | 956 | Coordination | 520.901 | 581.170 |
| synthetic-house-4780 | 4780 | Object summary | 0.958 | 1.154 |
| synthetic-house-4780 | 4780 | Plan projection | 0.293 | 0.340 |
| synthetic-house-4780 | 4780 | Plan hit test | 0.374 | 0.415 |
| synthetic-house-4780 | 4780 | Snap index build | 2.732 | 3.052 |
| synthetic-house-4780 | 4780 | Snap candidate query | 0.167 | 0.174 |
| synthetic-house-4780 | 4780 | Coordination | 2437.018 | 2662.090 |

Raw measurements: [EDITOR-PERFORMANCE-MATRIX-2026-10.json](./EDITOR-PERFORMANCE-MATRIX-2026-10.json).
This matrix covers 21-object kitchen, 239-object two-storey house, 260-object combined renovation fixture, and synthetic 478/956/4,780-object geometry tiles. Synthetic stress fixtures are not residential acceptance models. Stress rows measure object summary, plan projection/hit-testing, snap-index/query, and the coordination engine; takeoff, BOQ, and drawing compilation remain unmeasured at that scale. Browser frame time, marquee selection, undo/redo, load/schema validation, and serialization still require separate evidence.
