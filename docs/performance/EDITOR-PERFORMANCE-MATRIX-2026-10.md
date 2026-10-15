# Editor Engine Performance Matrix — 2026-10

- **Generated:** 2026-10-14T16:52:49.873Z
- **Runtime:** v24.19.0, linux x64
- **Method:** 3 warmups, 12 measured runs per operation; nearest-rank p50/p95. All values are milliseconds.

These are synchronous Node engine timings for named project fixtures. They do not measure browser rendering, pointer-to-paint latency, React scheduling, or native CAD. Results are informational; no latency thresholds are defined.

| Fixture | Objects | Operation | p50 ms | p95 ms |
| --- | ---: | --- | ---: | ---: |
| kitchen-proof | 21 | Object summary | 0.006 | 0.009 |
| kitchen-proof | 21 | Plan projection | 0.003 | 0.007 |
| kitchen-proof | 21 | Plan hit test | 0.007 | 0.051 |
| kitchen-proof | 21 | Snap index build | 0.046 | 2.268 |
| kitchen-proof | 21 | Snap candidate query | 0.011 | 0.410 |
| kitchen-proof | 21 | Coordination | 19.241 | 41.355 |
| kitchen-proof | 21 | Takeoff | 0.640 | 2.281 |
| kitchen-proof | 21 | Phased BOQ | 0.685 | 0.810 |
| kitchen-proof | 21 | Drawing set compile | 0.676 | 0.903 |
| reference-house-2storey | 239 | Object summary | 0.051 | 0.091 |
| reference-house-2storey | 239 | Plan projection | 0.012 | 0.023 |
| reference-house-2storey | 239 | Plan hit test | 0.017 | 0.043 |
| reference-house-2storey | 239 | Snap index build | 0.252 | 0.436 |
| reference-house-2storey | 239 | Snap candidate query | 0.038 | 0.088 |
| reference-house-2storey | 239 | Coordination | 266.020 | 456.533 |
| reference-house-2storey | 239 | Takeoff | 8.539 | 13.070 |
| reference-house-2storey | 239 | Phased BOQ | 9.037 | 16.875 |
| reference-house-2storey | 239 | Drawing set compile | 0.966 | 2.183 |
| renovation-house-plus-kitchen | 260 | Object summary | 0.058 | 0.094 |
| renovation-house-plus-kitchen | 260 | Plan projection | 0.013 | 0.023 |
| renovation-house-plus-kitchen | 260 | Plan hit test | 0.018 | 3.033 |
| renovation-house-plus-kitchen | 260 | Snap index build | 0.298 | 0.502 |
| renovation-house-plus-kitchen | 260 | Snap candidate query | 0.039 | 0.086 |
| renovation-house-plus-kitchen | 260 | Coordination | 274.349 | 371.753 |
| renovation-house-plus-kitchen | 260 | Takeoff | 5.106 | 10.844 |
| renovation-house-plus-kitchen | 260 | Phased BOQ | 5.410 | 8.327 |
| renovation-house-plus-kitchen | 260 | Drawing set compile | 2.123 | 4.625 |
| synthetic-house-717 | 717 | Object summary | 0.196 | 1.345 |
| synthetic-house-717 | 717 | Plan projection | 0.037 | 0.111 |
| synthetic-house-717 | 717 | Plan hit test | 0.064 | 0.407 |
| synthetic-house-717 | 717 | Snap index build | 0.759 | 7.478 |
| synthetic-house-717 | 717 | Snap candidate query | 0.085 | 0.116 |
| synthetic-house-717 | 717 | Coordination | 824.493 | 916.594 |
| synthetic-house-478 | 478 | Object summary | 0.101 | 0.293 |
| synthetic-house-478 | 478 | Plan projection | 0.024 | 0.027 |
| synthetic-house-478 | 478 | Plan hit test | 0.032 | 1.477 |
| synthetic-house-478 | 478 | Snap index build | 0.419 | 3.115 |
| synthetic-house-478 | 478 | Snap candidate query | 0.058 | 3.699 |
| synthetic-house-478 | 478 | Coordination | 542.977 | 888.921 |
| synthetic-house-956 | 956 | Object summary | 0.219 | 0.320 |
| synthetic-house-956 | 956 | Plan projection | 0.052 | 0.118 |
| synthetic-house-956 | 956 | Plan hit test | 0.036 | 0.077 |
| synthetic-house-956 | 956 | Snap index build | 0.733 | 2.016 |
| synthetic-house-956 | 956 | Snap candidate query | 0.054 | 0.147 |
| synthetic-house-956 | 956 | Coordination | 1134.809 | 1275.413 |
| synthetic-house-4780 | 4780 | Object summary | 1.860 | 2.037 |
| synthetic-house-4780 | 4780 | Plan projection | 0.514 | 1.340 |
| synthetic-house-4780 | 4780 | Plan hit test | 0.811 | 1.643 |
| synthetic-house-4780 | 4780 | Snap index build | 5.407 | 8.988 |
| synthetic-house-4780 | 4780 | Snap candidate query | 0.335 | 0.898 |
| synthetic-house-4780 | 4780 | Coordination | 6625.881 | 7909.707 |
| synthetic-house-5019 | 5019 | Object summary | 1.907 | 9.488 |
| synthetic-house-5019 | 5019 | Plan projection | 0.530 | 3.578 |
| synthetic-house-5019 | 5019 | Plan hit test | 0.803 | 4.935 |
| synthetic-house-5019 | 5019 | Snap index build | 5.428 | 8.940 |
| synthetic-house-5019 | 5019 | Snap candidate query | 0.297 | 0.491 |
| synthetic-house-5019 | 5019 | Coordination | 6975.831 | 8148.782 |

Raw measurements: [EDITOR-PERFORMANCE-MATRIX-2026-10.json](./EDITOR-PERFORMANCE-MATRIX-2026-10.json).
This matrix covers 21-object kitchen, 239-object two-storey house, 260-object combined renovation fixture, and synthetic 478/717/956/4,780/5,019-object geometry tiles. Synthetic stress fixtures are not residential acceptance models. Stress rows measure object summary, plan projection/hit-testing, snap-index/query, and the coordination engine; takeoff, BOQ, and drawing compilation remain unmeasured at that scale. Browser paint/compositing, undo/redo, load/schema validation, and serialization are measured separately by Playwright browser stress acceptance; these local traces do not define release thresholds.
