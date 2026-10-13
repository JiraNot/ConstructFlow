# Editor Engine Performance Matrix — 2026-10

- **Generated:** 2026-10-13T17:43:50.918Z
- **Runtime:** v24.19.0, win32 x64
- **Method:** 3 warmups, 12 measured runs per operation; nearest-rank p50/p95. All values are milliseconds.

These are synchronous Node engine timings for named project fixtures. They do not measure browser rendering, pointer-to-paint latency, React scheduling, or native CAD. Results are informational; no latency thresholds are defined.

| Fixture | Objects | Operation | p50 ms | p95 ms |
| --- | ---: | --- | ---: | ---: |
| kitchen-proof | 21 | Object summary | 0.004 | 0.005 |
| kitchen-proof | 21 | Plan projection | 0.002 | 0.004 |
| kitchen-proof | 21 | Plan hit test | 0.004 | 0.022 |
| kitchen-proof | 21 | Snap index build | 0.026 | 0.041 |
| kitchen-proof | 21 | Snap candidate query | 0.007 | 0.027 |
| kitchen-proof | 21 | Coordination | 8.224 | 11.163 |
| kitchen-proof | 21 | Takeoff | 0.239 | 0.297 |
| kitchen-proof | 21 | Phased BOQ | 0.333 | 0.412 |
| kitchen-proof | 21 | Drawing set compile | 0.291 | 0.391 |
| reference-house-2storey | 239 | Object summary | 0.032 | 0.060 |
| reference-house-2storey | 239 | Plan projection | 0.008 | 0.016 |
| reference-house-2storey | 239 | Plan hit test | 0.010 | 0.026 |
| reference-house-2storey | 239 | Snap index build | 0.099 | 0.208 |
| reference-house-2storey | 239 | Snap candidate query | 0.012 | 0.022 |
| reference-house-2storey | 239 | Coordination | 153.977 | 170.889 |
| reference-house-2storey | 239 | Takeoff | 3.917 | 5.940 |
| reference-house-2storey | 239 | Phased BOQ | 4.055 | 6.394 |
| reference-house-2storey | 239 | Drawing set compile | 0.747 | 1.244 |
| renovation-house-plus-kitchen | 260 | Object summary | 0.036 | 0.073 |
| renovation-house-plus-kitchen | 260 | Plan projection | 0.016 | 0.031 |
| renovation-house-plus-kitchen | 260 | Plan hit test | 0.010 | 0.010 |
| renovation-house-plus-kitchen | 260 | Snap index build | 0.148 | 0.489 |
| renovation-house-plus-kitchen | 260 | Snap candidate query | 0.020 | 0.021 |
| renovation-house-plus-kitchen | 260 | Coordination | 171.605 | 192.254 |
| renovation-house-plus-kitchen | 260 | Takeoff | 3.937 | 4.697 |
| renovation-house-plus-kitchen | 260 | Phased BOQ | 2.708 | 4.639 |
| renovation-house-plus-kitchen | 260 | Drawing set compile | 0.773 | 1.628 |
| synthetic-house-478 | 478 | Object summary | 0.098 | 0.139 |
| synthetic-house-478 | 478 | Plan projection | 0.028 | 0.058 |
| synthetic-house-478 | 478 | Plan hit test | 0.031 | 0.052 |
| synthetic-house-478 | 478 | Snap index build | 0.204 | 0.377 |
| synthetic-house-478 | 478 | Snap candidate query | 0.032 | 0.061 |
| synthetic-house-956 | 956 | Object summary | 0.125 | 0.149 |
| synthetic-house-956 | 956 | Plan projection | 0.032 | 0.033 |
| synthetic-house-956 | 956 | Plan hit test | 0.059 | 0.069 |
| synthetic-house-956 | 956 | Snap index build | 0.482 | 0.623 |
| synthetic-house-956 | 956 | Snap candidate query | 0.038 | 0.066 |
| synthetic-house-4780 | 4780 | Object summary | 0.877 | 1.448 |
| synthetic-house-4780 | 4780 | Plan projection | 0.265 | 0.614 |
| synthetic-house-4780 | 4780 | Plan hit test | 0.463 | 0.646 |
| synthetic-house-4780 | 4780 | Snap index build | 2.300 | 4.016 |
| synthetic-house-4780 | 4780 | Snap candidate query | 0.138 | 0.205 |

Raw measurements: [EDITOR-PERFORMANCE-MATRIX-2026-10.json](./EDITOR-PERFORMANCE-MATRIX-2026-10.json).
This matrix covers 21-object kitchen, 239-object two-storey house, 260-object combined renovation fixture, and synthetic 478/956/4,780-object geometry tiles for object summary, plan projection/hit-testing, and snap-index/query paths. Synthetic stress fixtures are not residential acceptance models. Stress rows omit coordination, takeoff, BOQ, and drawing compilation to avoid implying those whole-project engines are performance-qualified at that scale. Browser frame time, marquee selection, undo/redo, load/schema validation, and serialization still require separate evidence.
