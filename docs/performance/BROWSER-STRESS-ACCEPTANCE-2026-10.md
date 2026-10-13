# Browser Stress Acceptance — 2026-10

**Status:** Preliminary interaction evidence; not a release performance gate.

## Fixture and workflow

The Playwright acceptance creates a canonical project containing 600 unhosted walls on one level. It seeds that project into the same IndexedDB autosave store used by the editor, reloads the workbench, opens the Project Browser, filters and selects three objects, checks that the selected UUID reaches the primary view, checks the same identity in Properties and an elevation, moves one wall numerically, verifies Undo and Redo, waits for the serialized autosave to contain the edited endpoints, then reloads and verifies all 600 rows and the edited geometry under the original UUID.

The fixture is synthetic geometry, not a surveyed residential model. It exercises project restoration, a 600-row browser list, search, selection propagation, one representative transform with undo/redo, and local autosave restoration. It does not exercise full-family editing, 3D geometry review, explicit file-handle save, or native CAD output. Browser acceptance records transform/Undo/Redo persistence and requestAnimationFrame intervals while panning and zooming. RAF intervals are a browser scheduling signal, not a direct measurement of canvas paint time. It does not isolate geometry kernel time, JSON serialization time, IndexedDB write time, or explicit file-handle save time.

## Latest local observation

Command: `npx playwright test e2e/authoring-workflows.spec.ts` (the synthetic test passed in the complete 44-test authoring suite). A focused rerun also passed with the same instrumentation.

Environment: Windows, Playwright headless Microsoft Edge using the repository's default browser config. One successful run recorded:

| Run | Initial reload to autosave-recovery status | Second reload to restored 600-row Browser list | Search + select samples | p50 / p95 |
| --- | ---: | ---: | --- | ---: |
| Targeted test | 1,952 ms | 3,459 ms | 316.6, 306.9, 311.5 ms | 311.5 / 316.6 ms |
| Full authoring suite | 1,957 ms | 3,009 ms | 324.4, 314.7, 312.9 ms | 314.7 / 324.4 ms |
| Full authoring suite after type-library exchange change | 1,966 ms | 2,941 ms | 374.2, 311.1, 287.6 ms | 311.1 / 374.2 ms |
| Targeted test with transform + Undo/Redo + autosave reload | 1,968 ms | 3,244 ms | 313.0, 296.4, 308.1 ms | 308.1 / 313.0 ms |
| Full authoring suite with transform + Undo/Redo + autosave reload | 1,952 ms | 3,089 ms | 324.8, 318.2, 293.3 ms | 318.2 / 324.8 ms |
| Full authoring suite with beam repeat acceptance | 1,971 ms | 3,092 ms | 329.5, 328.9, 290.0 ms | 328.9 / 329.5 ms |
| Full authoring suite with beam target-span edit acceptance | 1,908 ms | 3,013 ms | 326.0, 320.8, 293.5 ms | 320.8 / 326.0 ms |
| Full authoring suite with DXF calibration acceptance | 1,960 ms | 3,039 ms | 334.3, 302.7, 316.9 ms | 316.9 / 334.3 ms |
| Full authoring suite with temporary room-separator dimensions | 1,991 ms | 3,002 ms | 337.3, 311.6, 294.8 ms | 311.6 / 337.3 ms |
| Full authoring suite with pipe-route and moulding endpoint dimensions | 1,966 ms | 3,122 ms | 324.9, 301.4, 322.7 ms | 322.7 / 324.9 ms |
| Full authoring suite with pipe/moulding staged Escape acceptance | 1,944 ms | 3,055 ms | 357.2, 330.5, 298.4 ms | 330.5 / 357.2 ms |
| Full authoring suite after Properties action extraction | 1,957 ms | 3,155 ms | 330.2, 313.5, 292.1 ms | 313.5 / 330.2 ms |
| Full authoring suite after Properties type-action extraction | 1,954 ms | 2,990 ms | 326.0, 311.3, 381.7 ms | 326.0 / 381.7 ms |
| Full authoring suite with transform/autosave timings | 1,957 ms | 2,994 ms | 321.2, 314.2, 297.7 ms | 314.2 / 321.2 ms |
| Full authoring suite with stair grip dimensions | 1,950 ms | 2,962 ms | 329.5, 323.2, 358.1 ms | 329.5 / 358.1 ms |
| Before plan-render cache, targeted 600-wall test | 1,936 ms | 2,969 ms | 323.7, 324.1, 288.4 ms | 323.7 / 324.1 ms |
| After plan-render cache, targeted run | 1,302 ms | 2,138 ms | 181.2, 203.3, 171.7 ms | 181.2 / 203.3 ms |
| After plan-render cache, sequential repeat 1 | 1,316 ms | 2,171 ms | 181.2, 201.2, 200.6 ms | 200.6 / 201.2 ms |
| After plan-render cache, sequential repeat 2 | 1,287 ms | 2,147 ms | 189.2, 198.1, 198.4 ms | 198.1 / 198.4 ms |
| After plan-render cache, sequential repeat 3 | 1,293 ms | 2,075 ms | 189.5, 195.8, 170.9 ms | 189.5 / 195.8 ms |
| After wall-opening index + wall culling, sequential repeat 1 | 1,185 ms | 2,059 ms | 188.9, 228.6, 172.3 ms | 188.9 / 228.6 ms |
| After wall-opening index + wall culling, sequential repeat 2 | 1,184 ms | 2,061 ms | 206.4, 191.1, 187.4 ms | 191.1 / 206.4 ms |
| After wall-opening index + wall culling, sequential repeat 3 | 1,182 ms | 2,068 ms | 207.3, 230.4, 175.5 ms | 207.3 / 230.4 ms |
| Full 45-test suite after renderer optimizations | 1,205 ms | 2,069 ms | 194.8, 234.9, 225.9 ms | 225.9 / 234.9 ms |
| Full 45-test suite with post-reload 3D house review | 1,203.5 ms | 1,992.2 ms | 181.0, 190.9, 169.4 ms | 181.0 / 190.9 ms |
| Full 46-test suite after numeric slab-edge dimensions and persistence-hook extraction | 1,202.4 ms | 2,020.5 ms | 180.8, 194.8, 185.3 ms | 185.3 / 194.8 ms |

The 600-wall acceptance now samples browser RAF intervals during a middle-button pan and wheel zoom. Before memoizing project-derived plan geometry, one targeted run measured RAF p50/p95 of 18.1/176.6 ms, with 21 of 45 intervals above 50 ms. Three sequential post-cache runs measured p50/p95 of 17.9/53.3 ms (4/46 over 50 ms), 18.0/53.2 ms (4/45), and 18.0/52.3 ms (3/46). Search/select samples also dropped from about 324 ms p50 in the pre-cache run to 190–201 ms p50 across sequential post-cache runs. These are synthetic-project observations on one local environment, not release thresholds; the remaining long RAF intervals and the lack of surveyed-project/browser-frame-time evidence keep the performance gate open.

The latest 46-test authoring-suite run, including slab-edge numeric editing, local persistence-hook extraction and post-reload 3D review of the 239-object house, measured RAF p50/p95 of 17.7/35.6 ms (1 of 48 intervals above 50 ms), and synchronous plan redraw p50/p95 of 10.8/17.3 ms across 21 samples. It measured 185.3/194.8 ms search/select p50/p95 and 1,202.4/2,020.5 ms initial/reload restoration. Three sequential post-change targeted runs measured synchronous plan redraw p50/p95 of 10.8/15.1, 10.1/15.6, and 9.7/17.0 ms. The redraw measurement covers plan render, selection handles and tool overlays; it excludes browser paint/compositing and GPU presentation. These are local synthetic-model observations, not release thresholds or results for an approved residential project.

## Transform and autosave timings

The latest full-suite observation recorded these single-sample browser timings on the same synthetic 600-wall fixture. `Transform response` ends when the workbench reports the completed numeric move; persistence timings end when IndexedDB contains the expected geometry.

| Measurement | Latest full-suite run |
| --- | ---: |
| Transform start to status response | 1,312.3 ms |
| Transform start to persisted geometry | 1,477.1 ms |
| Status response to persisted geometry | 164.8 ms |
| Undo start to persisted geometry | 1,036.1 ms |
| Redo start to persisted geometry | 1,069.0 ms |

The focused rerun measured 768.4 ms for transform response, 1,328.4 ms from transform start to persistence, 560.0 ms from response to persistence, 1,216.6 ms from Undo start to persistence, and 1,202.6 ms from Redo start to persistence. These are two individual observations, not representative percentiles or release thresholds. Isolated serializer, geometry-kernel and database write durations still need instrumentation.

The search/select interval starts before filling the Browser search and ends when the primary pane exposes the selected object's persistent UUID. Each p95 comes from only three samples in that run; neither is a stable percentile or pass/fail budget. Transform and persistence values above are single samples, not stable latency distributions. The restore timings also differ because the full-suite run uses different browser state/workload. Repeat on a representative residential project and the supported release environment before setting performance thresholds.

## Evidence source

The executable acceptance is `apps/plan-editor/e2e/authoring-workflows.spec.ts`, test `synthetic 600-wall project supports browser search, persistent selection, cross-view navigation, and reload`. It attaches `synthetic-600-wall-browser-metrics.json` to the Playwright test result and writes a compact `[browser-stress]` record to the test output.
