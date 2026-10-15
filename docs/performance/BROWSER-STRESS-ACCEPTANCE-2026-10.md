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
| Full 47-test suite after project file action extraction | 1,234.0 ms | 2,035.2 ms | 195.0, 197.5, 179.5 ms | 195.0 / 197.5 ms |

The 600-wall acceptance now samples browser RAF intervals during a middle-button pan and wheel zoom. Before memoizing project-derived plan geometry, one targeted run measured RAF p50/p95 of 18.1/176.6 ms, with 21 of 45 intervals above 50 ms. Three sequential post-cache runs measured p50/p95 of 17.9/53.3 ms (4/46 over 50 ms), 18.0/53.2 ms (4/45), and 18.0/52.3 ms (3/46). Search/select samples also dropped from about 324 ms p50 in the pre-cache run to 190–201 ms p50 across sequential post-cache runs. These are synthetic-project observations on one local environment, not release thresholds; the remaining long RAF intervals and the lack of surveyed-project/browser-frame-time evidence keep the performance gate open.

The latest 2026-10-14 54-test authoring-suite run measured RAF p50/p95 of 17.6/35.3 ms (0 of 45 intervals above 50 ms), and synchronous plan redraw p50/p95 of 9.1/13.9 ms across 21 samples. It measured 170.4/191.1 ms search/select p50/p95 and 1,209.3/1,780.9 ms initial/reload restoration. Three sequential post-change targeted runs measured synchronous plan redraw p50/p95 of 10.8/15.1, 10.1/15.6, and 9.7/17.0 ms. The redraw measurement covers plan render, selection handles and tool overlays; it excludes browser paint/compositing and GPU presentation. These are local synthetic-model observations, not release thresholds or results for an approved residential project.

The synthetic 4,780-wall browser acceptance passed on 2026-10-14. It restores the IndexedDB snapshot, searches and selects a wall by persistent UUID, confirms the same identity in the plan and Properties, verifies all objects in the saved snapshot, and reloads to confirm the object count and UUID remain present. Before the coordination broad-phase index change, first/reload restore measured 53,012/60,886 ms; after the change, the same 4,780-object acceptance measured 4,733/11,965 ms.

The acceptance was raised to 5,000 walls on 2026-10-14. The focused run measured 1,985 ms for first restore, 2,194 ms for reload restore, 231 ms for browser activation, and 256 ms for persisted-snapshot read/assertion. It verified all 5,000 saved and restored object UUIDs and selected one searched wall. The fixture is synthetic and the single run is a local observation, not a release threshold or surveyed-residential evidence. The reload interval still includes app restoration and persisted snapshot work; this test does not measure browser paint/compositing or pointer-to-paint latency.

The snapping-engine benchmark also covers 5,000 walls and confirms that indexed and full-scan snap results are equivalent. In the latest local run, index construction measured 8.126 ms, candidate lookup 0.001 ms median for one nearby candidate, full-scan snap 183.619 ms median, and indexed snap 0.039 ms median. This deterministic Node benchmark is not browser interaction timing. Its method and environment are printed by `npm run bench:snap --prefix packages/snapping-engine`.

## Transform and autosave timings

The latest full-suite observation recorded these single-sample browser timings on the same synthetic 600-wall fixture. `Transform response` ends when the workbench reports the completed numeric move; persistence timings end when IndexedDB contains the expected geometry.

| Measurement | Latest full-suite run |
| --- | ---: |
| Transform start to status response | 923.8 ms |
| Transform start to persisted geometry | 1,456.2 ms |
| Status response to persisted geometry | 532.4 ms |
| Undo start to persisted geometry | 1,145.9 ms |
| Redo start to persisted geometry | 1,155.2 ms |

The focused rerun measured 768.4 ms for transform response, 1,328.4 ms from transform start to persistence, 560.0 ms from response to persistence, 1,216.6 ms from Undo start to persistence, and 1,202.6 ms from Redo start to persistence. These are two individual observations, not representative percentiles or release thresholds. Isolated serializer, geometry-kernel and database write durations still need instrumentation.

The search/select interval starts before filling the Browser search and ends when the primary pane exposes the selected object's persistent UUID. Each p95 comes from only three samples in that run; neither is a stable percentile or pass/fail budget. Transform and persistence values above are single samples, not stable latency distributions. The restore timings also differ because the full-suite run uses different browser state/workload. Repeat on a representative residential project and the supported release environment before setting performance thresholds.

## Evidence source

The executable acceptance is `apps/plan-editor/e2e/authoring-workflows.spec.ts`, test `synthetic 600-wall project supports browser search, persistent selection, cross-view navigation, and reload`. It attaches `synthetic-600-wall-browser-metrics.json` to the Playwright test result and writes a compact `[browser-stress]` record to the test output.

## Browser trace refresh — Linux / Chromium — 2026-10-14

The focused acceptance now wraps pan/zoom and the 5,000-wall reload in Chromium CDP performance tracing. It reports Paint and RasterTask event durations separately from RAF interval and synchronous plan redraw. This is browser trace work duration; it is not end-to-end input-to-display latency. The 600-wall search/select figures contain three samples. Transform, autosave, Undo and Redo timings each contain one sample. Percentiles for those single observations are intentionally not reported.

| Fixture / action | Count | Restore or action timing | Browser Paint p50 / p95 | RasterTask p50 / p95 | CompositeLayers |
| --- | ---: | --- | ---: | ---: | --- |
| Synthetic walls: initial / reload restore | 600 | 3,049 / 5,508 ms | 0.097 / 2.510 ms | 0.266 / 32.336 ms | No events |
| Pan and wheel samples | 600 | RAF 16.67 / 149.99 ms; sync redraw 16.54 / 61.02 ms | Same traced interaction window | Same traced interaction window | No events |
| Search/select (3 samples) | 600 | p50/p95 1,066 / 1,193 ms | Not separately traced | Not separately traced | — |
| Move / autosave | 600 | 1,704 / 3,088 ms | — | — | — |
| Undo / Redo to autosave | 600 | 2,396 / 2,399 ms | — | — | — |
| Initial / reload restore | 5,000 | 6,758 / 8,472 ms | 0.080 / 1.808 ms during reload trace | 0.187 / 5.895 ms during reload trace | No events |
| Browser activation / snapshot verification | 5,000 | 517 / 618 ms | — | — | — |

The run used `/usr/bin/chromium`, headless Playwright, Node v24.19.0 on Linux x64 in the local container. These are single-run fixture values, informational only, with no release thresholds. Trace categories emitted no `CompositeLayers` events, so compositing p50/p95 cannot be inferred from this run. Repeat under the supported release browser and on a real surveyed project before using these results as acceptance targets.

## Prior full authoring-suite trace refresh — Linux / Chromium — 2026-10-15

The latest complete authoring-suite run captured 250 RAF intervals and 84 synchronous redraw samples for the 600-wall fixture, plus Paint and RasterTask trace events for both the 600- and 5,000-wall fixtures. Search/select p50/p95 uses only three samples. Transform, autosave, Undo and Redo remain single observations. The full authoring suite completed 87/91; failures are recorded in residential acceptance and should not be interpreted as passing evidence.

| Fixture / action | Count | Restore or action timing | Browser Paint p50 / p95 | RasterTask p50 / p95 | CompositeLayers |
| --- | ---: | --- | ---: | ---: | --- |
| Synthetic walls: first / reload restore | 600 | 2,842.96 / 9,272.25 ms | 0.107 / 1.238 ms (38 events) | 0.296 / 2.864 ms (40 events) | No events |
| Pan/zoom | 600 | RAF 16.67 / 166.67 ms (250 samples; 78 >50 ms); synchronous redraw 18.49 / 83.27 ms (84 samples) | Same traced interaction window | Same traced interaction window | No events |
| Search/select | 600 | 932.91 / 1,213.82 ms p50/p95 (3 samples) | Not separately traced | Not separately traced | — |
| Move / autosave | 600 | 1,894.42 / 2,075.42 ms; response-to-persistence 181 ms | — | — | — |
| Undo / Redo to autosave | 600 | 2,326.84 / 2,235.62 ms (one sample each) | — | — | — |
| First / reload restore | 5,000 | 7,514 / 8,563 ms | 0.106 / 1.623 ms (11 events) | 0.196 / 3.472 ms (89 events) | No events |
| Activation / snapshot verification / reload-to-verify | 5,000 | 531 / 734 / 9,828 ms | Same reload trace | Same reload trace | No events |

Environment remains headless `/usr/bin/chromium`, Playwright, Node v24.19.0 on Linux x64. Paint/RasterTask duration is browser trace work and does not include end-to-end input-to-presentation latency; absent `CompositeLayers` events mean compositing duration is unknown. This run is a single local fixture observation, not a release threshold or surveyed-project result.

## Full authoring-suite trace refresh — Linux / Chromium — 2026-10-15

After restoring the missing synchronous `CommandBus` import used by preview validation, the complete Playwright authoring file passed 92/92 tests in 13.1 minutes. It recorded one fresh 600-wall and one 5,000-wall browser stress observation; these single-run timings supersede neither earlier measurements nor provide a release threshold.

| Fixture / action | Count | Restore or action timing | Browser Paint p50 / p95 | RasterTask p50 / p95 | CompositeLayers |
| --- | ---: | --- | ---: | ---: | --- |
| Synthetic walls: first / reload restore | 600 | 3,134 / 9,466 ms | 0.111 / 0.623 ms (38 events) | 0.252 / 7.959 ms (40 events) | No events |
| Pan/zoom | 600 | RAF 16.67 / 116.66 ms (233 samples; 55 >50 ms); synchronous redraw 15.36 / 49.90 ms (84 samples) | Same traced interaction window | Same traced interaction window | No events |
| Search/select | 600 | 757.58 / 785.06 ms p50/p95 (3 samples) | Not separately traced | Not separately traced | — |
| Move / autosave | 600 | 3,517 / 3,917 ms; response-to-persistence 400 ms | — | — | — |
| Undo / Redo to autosave | 600 | 3,011 / 2,693 ms (one sample each) | — | — | — |
| First / reload restore | 5,000 | 8,339 / 7,784 ms | 0.053 / 2.688 ms (11 events) | 0.204 / 1.847 ms (95 events) | No events |
| Activation / snapshot verification / reload-to-verify | 5,000 | 567 / 728 / 9,079 ms | Same reload trace | Same reload trace | No events |

Environment: headless `/usr/bin/chromium` 155.0.8059.39 on Ubuntu 26.04.1 LTS, Linux x86_64 kernel 6.8.0-142-generic; Playwright with Node v24.21.0. Paint and RasterTask are browser trace durations, not input-to-presentation latency. Chrome emitted no `CompositeLayers` events, so compositing duration remains unknown. No surveyed client project was available.
