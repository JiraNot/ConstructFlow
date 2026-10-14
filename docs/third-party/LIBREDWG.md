# LibreDWG WebAssembly dependency

Plan Editor pins `@mlightcad/libredwg-web` 0.7.14 for browser-side DWG underlay decoding. The package is licensed GPL-3.0 and is loaded in a dedicated Web Worker; DXF continues to use ConstructFlow's existing importer. The worker returns normalized SVG underlay data to the editor, which retains the existing calibration and project persistence flow.

The parser is read-only in this integration. LibreDWG's WebAssembly build omits DWG/DXF writing and can skip advanced or unsupported entities; the import status reports the parser's unknown-entity count. A DWG with no usable 2D geometry cannot be imported as a plan underlay.

Upstream source and license:

- [LibreDWG WebAssembly parser](https://github.com/mlightcad/libredwg-web)
- [LibreDWG upstream and GPL-3.0 terms](https://github.com/LibreDWG/libredwg)
- A copy of the upstream GPL-3.0 license is included at [`licenses/LibreDWG-COPYING.txt`](licenses/LibreDWG-COPYING.txt).
- The small end-to-end sample `apps/plan-editor/e2e/fixtures/libredwg-sample-2000.dwg` is sourced from LibreDWG's [`test/test-data/sample_2000.dwg`](https://github.com/LibreDWG/libredwg/blob/master/test/test-data/sample_2000.dwg).
- Exact package version and integrity are recorded in `apps/plan-editor/package-lock.json`.
