# Family Studio, editable CAD and portable assets

Date: 2026-10-18

## What is delivered

Open **▱ Family / CAD** in the workbench. One Family definition contains plan, front and side linework, editable layers, line styles, hatches, parameter expressions, Types, extrusions and imported meshes. The same W/D/H values drive both 2D and 3D.

- Create a Family, draw/select/move lines and vertices, add an extrusion from a closed profile, and make holes by assigning another closed outline as a void. Front and side previews use upward height coordinates.
- Set Type or Instance parameters, limits and dependent arithmetic formulas. Expressions support `+ - * /`, parentheses, `min`, `max`, `abs`; they do not execute JavaScript. Formula constants and coordinate expressions use canonical mm. W/D/H value inputs and placement coordinates default to metres and accept explicit mm/cm suffixes.
- Save and place, edit Instance values in Properties, update all linked Instances by saving a Family, Undo/Redo, and save/reopen the project. Native door/window Instances retain their wall host and wall cutouts. Changing dimensions through existing opening tools also updates Family parameters; native door handing mirrors the bound graphics (including captured original handing), and Family saves refresh associated placement catalog dimensions; Type/formula dimensions must be edited in the Family.
- Imported GLB/OBJ and SketchUp parts keep editable part names. Each mesh part has X/Y/Z scale and offset formulas using W/D/H: use `1` to keep a part's physical dimension on an axis while the offset follows the overall Family size (for example `W-80`). SketchUp Group/Component names are carried through to the Family parts so a frame, leaf and handle can be adjusted separately.
- Mesh parts now have visual resizing rules per axis: **stretch**, **fixed size**, **keep proportions**, or **repeat with spacing**. Repeat lays out whole motif parts evenly and centered in the available W/D/H span; GLB/OBJ imports keep a reference envelope so fixed/repeated parts retain their physical size as the Family changes. Existing Families keep legacy stretch behavior unless a rule is selected. This supports patterns built from separate components (for example circles, panels or grille bars); a fused mesh is still one component and cannot be separated into design intent automatically.
- Family Studio includes an in-context modeling guide with axis and grouping instructions. Common resizing rules are selected directly on each mesh part; Scale/Offset formulas remain available under advanced controls. It warns when imported geometry is one combined mesh or has unnamed parts; formulas and bounds are checked before save.
- The ten existing furniture styles now use editable Family graphs for their 2D/3D graphics. Existing doors, windows and cabinet runs can be captured using **สร้าง Family จากวัตถุ** or **แก้ Family**; the Instance UUID stays intact. Captured/imported meshes scale with W/D/H; construction constraints are authored explicitly rather than inferred from a mesh.
- Open DWG/DXF into editable vectors; change layer, colour, lineweight, text, vertices and hatch. This is a separate route from the existing calibrated underlay workflow. Attach CAD linework to the plan/front/side of an existing Family without discarding its 3D geometry. The side symbol binds to D/H; front binds to W/H.
- Import PAT definitions and CAD hatch definition lines (including origin, dashes and block transforms), keep custom hatch line families with the asset, and edit hatch scale, rotation, colour and voids. Export edited vectors as mm DXF; patterned hatches become editable linework, solid hatches retain their boundary loops and voids.
- Attach GLB or OBJ, preserve supported base colours, GLB embedded base-colour textures/UVs and roughness/metalness. Generate editable plan feature edges from a mesh. Export/import `.cffamily` for reuse and keep a browser-local personal library as a convenience; project files and exported assets are the portable copies.
- Plan rendering, picking, snapping, placement preview, 3D and elevations consume the Family geometry. Native providers retain their own takeoff quantities when their graphics are replaced; generic model Families count once and 2D detail Families do not add model quantities. Generated drawing paths include vector hatch geometry.
- Desktop Studio has library, editor and inspector columns; the mobile layout stacks those sections and contains table scrolling. Escape cancels an active canvas draft before closing the Studio; shared modal focus handling restores the launcher when it closes.

## SketchUp workflow

1. Install the packaged `output/constructflow.rbz`.
2. Select a Component or Group in SketchUp.
3. Use **ConstructFlow → ส่งออกสิ่งที่เลือกเป็น Family (.cffamily)...**.
4. In ConstructFlow, open **Family / CAD → นำเข้า Family**.
5. Edit the 2D symbol, add parameter-bound extrusion parts if needed, save and place.

The adapter reads selected meshes/edges in mm and transfers supported face colours and textures. Group-inherited textures may fall back to colour with a source note. It does not modify the SKP. Packaging succeeds; an actual SketchUp runtime smoke test remains outstanding because this environment has no SketchUp/Ruby runtime.

## Contracts and boundaries

- Canonical definitions/bindings live in `packages/project-model/src/family.ts`; `ProjectDocument.families` is optional and old projects remain readable without a schema-version bump.
- Commands are defined in `packages/command-schema/src/familyCommands.ts`; mutations run through CommandBus/ProjectCommandSession. Family saves and dependent Instance refreshes participate in the existing atomic history/persistence flow.
- Family, Type and Instance identities are persistent UUIDs. Graph-part IDs are local definition keys. Instances keep universal phase metadata. Saving/capturing a Family does not replace an existing Instance identity.
- Formula resolution, family evaluation, cascading edits, DXF export and quantities belong to `packages/family-engine`; triangulation and hatch clipping belong to `packages/geometry-kernel`. React orchestrates drafts and command dispatch.
- Parser and geometry limits reject oversized assets. GLB must be self-contained; external resource URLs are not fetched. Development/production CSP allow embedded texture decoding and the existing DWG WASM parser.

## Supported formats and remaining limits

This is a ConstructFlow parametric Family system, not full Revit/AutoCAD feature parity.

- **DWG:** decode/import a supported model-space entity subset using the bundled LibreDWG worker. **No binary DWG writer** is included; keep edits in `.cfproj`/`.cffamily` or export DXF.
- **CAD entities:** common lines, polylines, block instances, circles/arcs, ellipses, splines, text and hatch boundaries. Curves become sampled editable paths; blocks are expanded. Unsupported entities are reported as skipped. Native dimension associations, paper-space layouts, Xrefs, proxy objects and all specialised CAD semantics are not preserved by this asset editor. Opening a file is not a lossless CAD document roundtrip.
- **Mesh assets:** GLB static triangle geometry with the supported material subset; OBJ geometry from a single file, without external MTL/texture folders. Skinning, animation, full PBR texture channels and mesh topology editing are outside this implementation. Direct browser `.skp` parsing is not implemented; use the SketchUp exporter or GLB/OBJ.
- **Family authoring:** arithmetic parameters, Types, 2D view symbols, extrusions, profile voids and per-part parameter-driven meshes with stretch/fixed/fit/repeat behavior. The engine applies rules to separate components; arbitrary imported geometry is not automatically recognized as semantic constraints, so keep meaningful SketchUp Groups/Components separate and choose the resizing behavior for each part. Nested Families, a general-purpose reference-plane solver, sweeps/revolves and arbitrary solid Boolean operations are not implemented. Walls/structural families remain native BIM systems; the first editable asset categories are furniture, door, window, generic and 2D detail.
- **Library storage:** the personal browser library can hit localStorage quota; the UI reports that and still saves the Family into the project. Export `.cffamily` to transfer assets between devices.

## Verification

Executed in Linux with Node 24.21.0, TypeScript/Vite and Chromium. Browser tests use a real DWG fixture, generated textured GLB, OBJ and DXF/PAT inputs; no live external CAD host is involved.

- `npm run build:standalone` — passed, all packages and editor. Subsequent focused builds of family-engine, representation-engine and editor also passed after hatch/picking/unit corrections. Existing bundle-size and LibreDWG browser externalisation warnings remain.
- The last complete `npm run test:standalone` run passed after refreshing stale sheet-count and file-I/O expectations: **26 build targets, 620 Node tests across 19 suites, 19 Python tests, and 6 integration verifiers**. After the follow-up per-part scale controls and in-context guide, `npm run build` passed for project-model, family-engine and Plan Editor; Family Engine passed 3/3 and the updated browser GLB Family workflow passed 1/1. The full-run record is in [BUILD-STATUS.md](../generated/BUILD-STATUS.md).
- `node --test packages/family-engine/test/*.test.mjs packages/geometry-kernel/test/*.test.mjs packages/project-model/test/*.test.mjs packages/command-runtime/test/*.test.mjs packages/representation-engine/test/*.test.mjs packages/snapping-engine/test/*.test.mjs apps/plan-editor/test/*.test.mjs` — **429 passed, 0 failed**.
- `npm run package:sketchup` — passed; generated the RBZ including the new asset exporter.
- `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test family-studio.spec.ts --workers=1` — 6 workflows passed: create/parametric placement/history/reopen, real DWG edit/export/OBJ, mobile/focus, textured GLB plus CAD, plan/elevation selection and Instance parameters, and capture an existing door/attach/place a second hosted Instance with one-step Undo/Redo. The final run also checks Escape draft cancellation. An additional 11-case regression run passed, covering the first five plus native wall/beam/opening/point placement, opening grips, grid dragging and dimensions.

### Principal changed files

- Model/contracts/runtime: `packages/project-model/src/family.ts`, `project.ts`, `smartObject.ts`, `types.ts`, `migrations.ts`; `packages/command-schema/src/familyCommands.ts`; `packages/family-engine/src/{index,templates,hatch}.ts` (with its own two pure geometry/template tests); `packages/command-runtime/src/index.ts`.
- Shared geometry/render integration: `packages/geometry-kernel/src/{extrudeWithVoids,materialPattern}.ts`; `packages/domain-providers/src/index.ts`; `packages/representation-engine/src/{index,planPicking}.ts`; `packages/snapping-engine/src/index.ts`; `packages/catalog-engine/src/index.ts`; `packages/module-sdk/src/index.ts`.
- UI: `apps/plan-editor/src/components/{FamilyWorkbench,FamilyCanvasEditor,FamilyInstanceProperties,FamilyThumbnail,ElevationCanvas,Model3DViewport,SelectedObjectProperties}.tsx`; `familyWorkbench.css`; `apps/plan-editor/src/app/{useFamilyWorkbenchSession,usePlanAuthoringCommands}.ts`; `App.tsx`; `rendering/{familyRenderer,planRenderer}.ts`; canvas prop/orchestration/viewport modules; `directManipulation.mjs`; `elevationManipulationCommands.ts`; `components/useLegacyModalAccessibility.ts`. Old `FurniturePropertiesSection.tsx` is replaced by Family properties.
- Import/transfer: `apps/plan-editor/src/cad/{importEditableDrawing,importFamilyModel,captureObjectFamily,libreDwgParser.worker}.ts`, `dwgDatabaseToDxf.mjs`, `importDxfUnderlay.mjs` and declarations; `apps/sketchup-extension/constructflow/core/{family_asset_export,ui_entry}.rb`.
- Build/security/tests: package manifests/lockfiles, `scripts/package_order.mjs`, `apps/plan-editor/vite.config.ts`, `docker/nginx/default.conf.template`; `packages/command-runtime/test/family.test.mjs`; `packages/geometry-kernel/test/family-geometry.test.mjs`; `apps/plan-editor/test/editable-cad.test.mjs`; `apps/plan-editor/test/tool-session.test.mjs`; `apps/plan-editor/e2e/family-studio.spec.ts`; `packages/representation-engine/test/family.test.mjs`; `packages/family-engine/test/family.test.mjs`; `scripts/test_standalone.mjs`. Existing stale expectations were corrected in `packages/cad-adapter/test/dxf.test.mjs` (the already-present A-01 compliance continuation) and `apps/mcp-server/test_server.py` (explicit API gateway mode for bearer-token/provider tests).

Next validation milestone: run the exporter in an installed SketchUp host and collect representative production CAD/asset files, including their unsupported-entity reports, before claiming broader CAD/Revit compatibility.

### Format references

CAD hatch definitions use explicit pattern line data rather than applying the header angle/scale twice. See Autodesk's [Pattern Data DXF reference](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-7C05C0EC-B0FB-4A86-A164-B9E5C6C03990.htm) and [Hatch pattern and DXF codes](https://blog.autodesk.io/hatch-pattern-and-dxf-codes/). SketchUp transfer uses the [TextureWriter](https://ruby.sketchup.com/Sketchup/TextureWriter.html), [PolygonMesh](https://ruby.sketchup.com/Geom/PolygonMesh.html) and [Face](https://ruby.sketchup.com/Sketchup/Face) APIs.

### Exact changed-file inventory

```text
apps/mcp-server/test_server.py
apps/plan-editor/e2e/family-studio.spec.ts
apps/plan-editor/package-lock.json
apps/plan-editor/package.json
apps/plan-editor/src/App.tsx
apps/plan-editor/src/app/useFamilyWorkbenchSession.ts
apps/plan-editor/src/app/usePlanAuthoringCommands.ts
apps/plan-editor/src/cad/captureObjectFamily.ts
apps/plan-editor/src/cad/dwgDatabaseToDxf.d.mts
apps/plan-editor/src/cad/dwgDatabaseToDxf.mjs
apps/plan-editor/src/cad/importDxfUnderlay.d.mts
apps/plan-editor/src/cad/importDxfUnderlay.mjs
apps/plan-editor/src/cad/importEditableDrawing.ts
apps/plan-editor/src/cad/importFamilyModel.ts
apps/plan-editor/src/cad/libreDwgParser.worker.ts
apps/plan-editor/src/components/ElevationCanvas.tsx
apps/plan-editor/src/components/FamilyCanvasEditor.tsx
apps/plan-editor/src/components/FamilyInstanceProperties.tsx
apps/plan-editor/src/components/FamilyModelGuide.tsx
apps/plan-editor/src/components/FamilyThumbnail.tsx
apps/plan-editor/src/components/FamilyWorkbench.tsx
apps/plan-editor/src/components/FurniturePropertiesSection.tsx
apps/plan-editor/src/components/LaserBleHudPill.tsx
apps/plan-editor/src/components/Model3DViewport.tsx
apps/plan-editor/src/components/PhotoDimensionModal.tsx
apps/plan-editor/src/components/PlanCanvas.types.ts
apps/plan-editor/src/components/PlanCanvasAuthoringControls.tsx
apps/plan-editor/src/components/PlanCanvasGeometry.ts
apps/plan-editor/src/components/PropertiesPanel.types.ts
apps/plan-editor/src/components/SelectedObjectProperties.tsx
apps/plan-editor/src/components/drawPlanCanvasToolOverlays.ts
apps/plan-editor/src/components/familyWorkbench.css
apps/plan-editor/src/components/objectDisplayNames.ts
apps/plan-editor/src/components/useLegacyModalAccessibility.ts
apps/plan-editor/src/components/usePlanCanvasDrawing.ts
apps/plan-editor/src/components/usePlanCanvasSceneController.ts
apps/plan-editor/src/components/usePlanCanvasSurfaceOverlays.ts
apps/plan-editor/src/components/usePlanCanvasViewport.ts
apps/plan-editor/src/directManipulation.mjs
apps/plan-editor/src/elevationManipulationCommands.ts
apps/plan-editor/src/projectFileIO.js
apps/plan-editor/src/rendering/familyRenderer.ts
apps/plan-editor/src/rendering/planRenderer.ts
apps/plan-editor/test/editable-cad.test.mjs
apps/plan-editor/test/tool-session.test.mjs
apps/plan-editor/tsconfig.json
apps/plan-editor/vite.config.ts
apps/sketchup-extension/constructflow/core/family_asset_export.rb
apps/sketchup-extension/constructflow/core/ui_entry.rb
docker/nginx/default.conf.template
docs/generated/BUILD-STATUS.md
docs/implementation/FAMILY-STUDIO-2026-10-18.md
packages/cad-adapter/test/dxf.test.mjs
packages/catalog-engine/src/index.ts
packages/command-runtime/package-lock.json
packages/command-runtime/package.json
packages/command-runtime/src/index.ts
packages/command-runtime/test/family.test.mjs
packages/command-schema/src/familyCommands.ts
packages/command-schema/src/index.ts
packages/domain-providers/package-lock.json
packages/domain-providers/package.json
packages/domain-providers/src/index.ts
packages/family-engine/package-lock.json
packages/family-engine/package.json
packages/family-engine/src/hatch.ts
packages/family-engine/src/index.ts
packages/family-engine/src/templates.ts
packages/family-engine/test/family.test.mjs
packages/family-engine/tsconfig.json
packages/geometry-kernel/package-lock.json
packages/geometry-kernel/package.json
packages/geometry-kernel/src/extrudeWithVoids.ts
packages/geometry-kernel/src/index.ts
packages/geometry-kernel/src/materialPattern.ts
packages/geometry-kernel/test/family-geometry.test.mjs
packages/laser-survey/module-manifest.json
packages/laser-survey/package.json
packages/laser-survey/src/ble/LaserPacketParser.ts
packages/laser-survey/src/ble/LaserTtsService.ts
packages/laser-survey/src/ble/XiaomiLaserBleDriver.ts
packages/laser-survey/src/index.ts
packages/laser-survey/src/photo/PhotoCanvasRenderer.ts
packages/laser-survey/src/photo/PhotoMarkupModel.ts
packages/laser-survey/src/renovation/RenovationPhasingMapper.ts
packages/laser-survey/src/tolerance/AsBuiltToleranceChecker.ts
packages/laser-survey/test/laserSurvey.test.mjs
packages/laser-survey/tsconfig.json
packages/module-sdk/src/index.ts
packages/project-model/src/family.ts
packages/project-model/src/index.ts
packages/project-model/src/migrations.ts
packages/project-model/src/project.ts
packages/project-model/src/smartObject.ts
packages/project-model/src/types.ts
packages/representation-engine/package-lock.json
packages/representation-engine/package.json
packages/representation-engine/src/index.ts
packages/representation-engine/src/planPicking.ts
packages/representation-engine/test/family.test.mjs
packages/snapping-engine/package-lock.json
packages/snapping-engine/package.json
packages/snapping-engine/src/index.ts
scripts/package_order.mjs
scripts/test_standalone.mjs
scripts/verify_phase_proof.mjs
```
