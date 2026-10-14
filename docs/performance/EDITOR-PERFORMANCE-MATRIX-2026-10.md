# Editor Engine Performance Matrix — 2026-10

- **Generated:** 2026-10-14T02:09:31.644Z
- **Runtime:** v24.19.0, win32 x64
- **Method:** 3 warmups, 12 measured runs per operation; nearest-rank p50/p95. All values are milliseconds.

These are synchronous Node engine timings for named project fixtures. They do not measure browser rendering, pointer-to-paint latency, React scheduling, or native CAD. Results are informational; no latency thresholds are defined.

| Fixture | Objects | Operation | p50 ms | p95 ms |
| --- | ---: | --- | ---: | ---: |
| kitchen-proof | 21 | Object summary | 0.004 | 0.005 |
| kitchen-proof | 21 | Plan projection | 0.002 | 0.004 |
| kitchen-proof | 21 | Plan hit test | 0.004 | 0.020 |
| kitchen-proof | 21 | Snap index build | 0.025 | 0.038 |
| kitchen-proof | 21 | Snap candidate query | 0.007 | 0.013 |
| kitchen-proof | 21 | Coordination | 7.651 | 11.150 |
| kitchen-proof | 21 | Takeoff | 0.239 | 0.373 |
| kitchen-proof | 21 | Phased BOQ | 0.321 | 0.362 |
| kitchen-proof | 21 | Drawing set compile | 0.289 | 0.377 |
| reference-house-2storey | 239 | Object summary | 0.031 | 0.059 |
| reference-house-2storey | 239 | Plan projection | 0.007 | 0.015 |
| reference-house-2storey | 239 | Plan hit test | 0.010 | 0.025 |
| reference-house-2storey | 239 | Snap index build | 0.097 | 0.184 |
| reference-house-2storey | 239 | Snap candidate query | 0.011 | 0.021 |
| reference-house-2storey | 239 | Coordination | 142.017 | 150.218 |
| reference-house-2storey | 239 | Takeoff | 3.022 | 4.210 |
| reference-house-2storey | 239 | Phased BOQ | 3.261 | 3.734 |
| reference-house-2storey | 239 | Drawing set compile | 0.451 | 0.591 |
| renovation-house-plus-kitchen | 260 | Object summary | 0.036 | 0.065 |
| renovation-house-plus-kitchen | 260 | Plan projection | 0.008 | 0.009 |
| renovation-house-plus-kitchen | 260 | Plan hit test | 0.010 | 0.010 |
| renovation-house-plus-kitchen | 260 | Snap index build | 0.119 | 0.209 |
| renovation-house-plus-kitchen | 260 | Snap candidate query | 0.020 | 0.020 |
| renovation-house-plus-kitchen | 260 | Coordination | 158.152 | 163.906 |
| renovation-house-plus-kitchen | 260 | Takeoff | 2.363 | 2.987 |
| renovation-house-plus-kitchen | 260 | Phased BOQ | 2.395 | 2.875 |
| renovation-house-plus-kitchen | 260 | Drawing set compile | 0.640 | 0.787 |
| synthetic-house-478 | 478 | Object summary | 0.055 | 0.062 |
| synthetic-house-478 | 478 | Plan projection | 0.014 | 0.015 |
| synthetic-house-478 | 478 | Plan hit test | 0.016 | 0.017 |
| synthetic-house-478 | 478 | Snap index build | 0.201 | 0.268 |
| synthetic-house-478 | 478 | Snap candidate query | 0.032 | 0.046 |
| synthetic-house-956 | 956 | Object summary | 0.122 | 0.177 |
| synthetic-house-956 | 956 | Plan projection | 0.031 | 0.033 |
| synthetic-house-956 | 956 | Plan hit test | 0.030 | 0.043 |
| synthetic-house-956 | 956 | Snap index build | 0.449 | 0.678 |
| synthetic-house-956 | 956 | Snap candidate query | 0.023 | 0.037 |
| synthetic-house-4780 | 4780 | Object summary | 0.874 | 0.951 |
| synthetic-house-4780 | 4780 | Plan projection | 0.265 | 1.412 |
| synthetic-house-4780 | 4780 | Plan hit test | 0.349 | 0.364 |
| synthetic-house-4780 | 4780 | Snap index build | 2.047 | 2.397 |
| synthetic-house-4780 | 4780 | Snap candidate query | 0.135 | 0.153 |

Raw measurements: [EDITOR-PERFORMANCE-MATRIX-2026-10.json](./EDITOR-PERFORMANCE-MATRIX-2026-10.json).
This matrix covers 21-object kitchen, 239-object two-storey house, 260-object combined renovation fixture, and synthetic 478/956/4,780-object geometry tiles for object summary, plan projection/hit-testing, and snap-index/query paths. Synthetic stress fixtures are not residential acceptance models. Stress rows omit coordination, takeoff, BOQ, and drawing compilation to avoid implying those whole-project engines are performance-qualified at that scale. Browser frame time, marquee selection, undo/redo, load/schema validation, and serialization still require separate evidence.
