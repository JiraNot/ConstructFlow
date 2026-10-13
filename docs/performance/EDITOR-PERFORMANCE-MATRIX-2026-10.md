# Editor Engine Performance Matrix — 2026-10

- **Generated:** 2026-10-13T10:28:42.229Z
- **Runtime:** v24.19.0, win32 x64
- **Method:** 3 warmups, 12 measured runs per operation; nearest-rank p50/p95. All values are milliseconds.

These are synchronous Node engine timings for named project fixtures. They do not measure browser rendering, pointer-to-paint latency, React scheduling, or native CAD. Results are informational; no latency thresholds are defined.

| Fixture | Objects | Operation | p50 ms | p95 ms |
| --- | ---: | --- | ---: | ---: |
| kitchen-proof | 21 | Object summary | 0.004 | 0.006 |
| kitchen-proof | 21 | Plan projection | 0.002 | 0.017 |
| kitchen-proof | 21 | Plan hit test | 0.004 | 0.025 |
| kitchen-proof | 21 | Snap index build | 0.035 | 0.069 |
| kitchen-proof | 21 | Snap candidate query | 0.006 | 0.020 |
| kitchen-proof | 21 | Coordination | 11.025 | 14.977 |
| kitchen-proof | 21 | Takeoff | 0.268 | 0.319 |
| kitchen-proof | 21 | Phased BOQ | 0.355 | 0.546 |
| kitchen-proof | 21 | Drawing set compile | 0.310 | 0.396 |
| reference-house-2storey | 239 | Object summary | 0.032 | 0.078 |
| reference-house-2storey | 239 | Plan projection | 0.009 | 0.165 |
| reference-house-2storey | 239 | Plan hit test | 0.012 | 0.043 |
| reference-house-2storey | 239 | Snap index build | 0.136 | 0.383 |
| reference-house-2storey | 239 | Snap candidate query | 0.012 | 0.028 |
| reference-house-2storey | 239 | Coordination | 212.836 | 268.240 |
| reference-house-2storey | 239 | Takeoff | 5.890 | 9.307 |
| reference-house-2storey | 239 | Phased BOQ | 6.322 | 8.758 |
| reference-house-2storey | 239 | Drawing set compile | 0.886 | 1.415 |
| renovation-house-plus-kitchen | 260 | Object summary | 0.037 | 0.077 |
| renovation-house-plus-kitchen | 260 | Plan projection | 0.017 | 0.037 |
| renovation-house-plus-kitchen | 260 | Plan hit test | 0.011 | 0.028 |
| renovation-house-plus-kitchen | 260 | Snap index build | 0.226 | 0.722 |
| renovation-house-plus-kitchen | 260 | Snap candidate query | 0.021 | 0.043 |
| renovation-house-plus-kitchen | 260 | Coordination | 243.790 | 328.373 |
| renovation-house-plus-kitchen | 260 | Takeoff | 4.196 | 6.738 |
| renovation-house-plus-kitchen | 260 | Phased BOQ | 4.747 | 6.416 |
| renovation-house-plus-kitchen | 260 | Drawing set compile | 1.213 | 1.873 |

Raw measurements: [EDITOR-PERFORMANCE-MATRIX-2026-10.json](./EDITOR-PERFORMANCE-MATRIX-2026-10.json).
This matrix covers 21-object kitchen, 239-object two-storey house, and 260-object combined renovation fixtures, including plan hit testing. It does not cover 500/1,000/5,000/20,000-object stress projects, load/schema validation, marquee selection, undo/redo, serialization, or canvas frame time.
