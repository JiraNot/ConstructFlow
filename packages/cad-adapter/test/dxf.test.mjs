import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEmptyProjectDocument, deserializeProject } from "@constructflow/project-model";
import { compilePermitDrawingSet } from "@constructflow/sheet-engine";
import {
  exportProjectToDxf,
  LAYOUT_DEFS,
  CAD_STANDARD_LAYERS,
  resolveCadLayer,
} from "../dist/index.js";

function parseDxfRecords(dxf) {
  const records = [];
  const pairs = dxf.split(/\r?\n/);
  for (let index = 0; index + 1 < pairs.length;) {
    if (pairs[index].trim() !== "0") { index += 2; continue; }
    const type = pairs[index + 1].trim();
    index += 2;
    const fields = new Map();
    while (index + 1 < pairs.length && pairs[index].trim() !== "0") {
      const key = pairs[index].trim();
      const value = pairs[index + 1].trim();
      if (!fields.has(key)) fields.set(key, []);
      fields.get(key).push(value);
      index += 2;
    }
    records.push({ type, fields });
  }
  return records;
}

test("cad-adapter: generates compliant AutoCAD R2018 DXF with 20 PaperSpace layouts", () => {
  const project = createEmptyProjectDocument("CAD-TEST", "บ้านพักอาศัย 2 ชั้น");

  // Add sample smart objects across disciplines
  project.objects["col-1"] = {
    id: "col-1",
    object_type: "structure.column",
    created_phase: "new_construction",
    level_refs: [],
    relationships: [],
    module_data: {
      location_mm: [2000, 3000, 0],
      section_mm: [200, 200],
      mark: "C1",
    },
  };

  project.objects["wall-1"] = {
    id: "wall-1",
    object_type: "arch.wall",
    created_phase: "existing",
    level_refs: [],
    relationships: [],
    module_data: {
      start_point_mm: [0, 0, 0],
      end_point_mm: [4000, 0, 0],
      thickness_mm: 100,
    },
  };

  project.objects["wall-2"] = {
    id: "wall-2",
    object_type: "arch.wall",
    created_phase: "demolition",
    level_refs: [],
    relationships: [],
    module_data: {
      start_point_mm: [0, 0, 0],
      end_point_mm: [0, 3000, 0],
      thickness_mm: 100,
    },
  };

  const result = exportProjectToDxf(project, {
    projectName: "บ้านพักอาศัยคุณสมชาย",
    architectName: "นายช่างใหญ่ สถาปัตย์",
    engineerLicense: "วส. 12345",
  });

  assert.ok(result.dxfContent.length > 5000);
  assert.equal(result.layoutsCount, 20);

  // 1. Verify Header section
  assert.ok(result.dxfContent.includes("$ACADVER\n  1\nAC1032"));
  assert.ok(result.dxfContent.includes("$INSUNITS\n 70\n4")); // Millimeters

  // 2. Verify all 20 layout definitions are present
  for (const layout of LAYOUT_DEFS) {
    assert.ok(
      result.dxfContent.includes(layout.name),
      `DXF missing layout: ${layout.name}`,
    );
    assert.ok(
      result.dxfContent.includes(layout.id),
      `DXF missing sheet ID: ${layout.id}`,
    );
  }

  // 3. Verify standard layers exist
  assert.ok(result.dxfContent.includes("S-COLN-NEWW"));
  assert.ok(result.dxfContent.includes("A-WALL-EXST"));
  assert.ok(result.dxfContent.includes("A-WALL-DEMO"));
  assert.ok(result.dxfContent.includes("ANNO-TTLB"));
  assert.ok(result.dxfContent.includes("\n  3\ntahoma.ttf\n"), "the standard text style uses a Thai-capable Windows font");

  // 4. PaperSpace must contain the compiled page vectors, not a generic
  // top-plan viewport repeated on every sheet.
  assert.ok(result.dxfContent.includes("A-VIEW"));
  assert.ok(result.dxfContent.includes("410\nA-05_Elevations_NE"));
  assert.ok(result.dxfContent.includes("410\nA-06_Elevations_SW"));
  assert.equal((result.dxfContent.match(/\nVIEWPORT\n/g) ?? []).length, 0,
    "compiled vector sheets must not overlay a generic modelspace plan viewport");

  // 5. Verify batch plot script
  assert.ok(result.publishScriptContent.includes("-PLOT"));
  assert.ok(result.publishScriptContent.includes("A-01_Site_Plan"));
  assert.ok(result.publishScriptContent.includes("E-02_Power_Panel"));
  assert.ok(result.publishScriptContent.includes("ISO_full_bleed_A3"));
});

test("DXF PaperSpace entities and layouts reference their owning block records", () => {
  const project = createEmptyProjectDocument("DXF-OWNERSHIP", "Layout ownership");
  project.objects.wall = {
    id: "wall", object_type: "architecture.wall", created_phase: "new_construction",
    level_refs: [], host_refs: [], connector_refs: [], relationships: [], status: "active",
    module_data: { start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], height_mm: 2800, thickness_mm: 100 },
  };
  const dxf = exportProjectToDxf(project).dxfContent;
  const records = parseDxfRecords(dxf);
  const layoutObjects = records.filter(record => record.type === "LAYOUT");
  const blockRecords = records.filter(record => record.type === "BLOCK_RECORD");
  const entities = records.filter(record => ["LINE", "LWPOLYLINE", "SOLID", "TEXT"].includes(record.type));

  assert.equal(layoutObjects.length, LAYOUT_DEFS.length);
  for (const [index, layout] of LAYOUT_DEFS.entries()) {
    const layoutObject = layoutObjects.find(record => record.fields.get("1")?.includes(layout.name));
    assert.ok(layoutObject, `${layout.name} has a LAYOUT object`);
    const layoutHandle = layoutObject.fields.get("5")?.[0];
    const blockName = index === 0 ? "*PAPER_SPACE" : `*PAPER_SPACE${index - 1}`;
    const blockRecord = blockRecords.find(record => record.fields.get("2")?.includes(blockName));
    assert.ok(blockRecord, `${layout.name} has a dedicated ${blockName} block record`);
    const blockHandle = blockRecord.fields.get("5")?.[0];
    assert.ok(blockRecord.fields.get("340")?.includes(layoutHandle), `${blockName} points back to its LAYOUT object`);
    assert.ok(layoutObject.fields.get("330")?.includes(blockHandle), `${layout.name} points to its PaperSpace block record`);
    assert.ok(layoutObject.fields.get("2")?.includes("DWG To PDF.pc3"), `${layout.name} uses the installed PDF plotter configuration`);
    assert.ok(layoutObject.fields.get("4")?.includes("ISO_full_bleed_A3_(420.00_x_297.00_MM)"), `${layout.name} selects the A3 landscape media`);
    assert.ok(layoutObject.fields.get("72")?.includes("1") && layoutObject.fields.get("73")?.includes("0"), `${layout.name} plots in millimeters without rotation`);
    assert.ok(layoutObject.fields.get("74")?.includes("5") && layoutObject.fields.get("75")?.includes("16"), `${layout.name} plots the layout at 1:1 paper scale`);
    assert.ok(layoutObject.fields.get("142")?.includes("1.0") && layoutObject.fields.get("143")?.includes("1.0"), `${layout.name} stores a 1:1 custom plot ratio`);
    const pageEntities = entities.filter(record => record.fields.get("410")?.includes(layout.name));
    assert.ok(pageEntities.length > 0, `${layout.name} has compiled page geometry`);
    assert.ok(pageEntities.every(record => record.fields.get("330")?.includes(blockHandle)), `${layout.name} entities belong to its own PaperSpace block record`);
  }
  assert.equal(blockRecords.length, LAYOUT_DEFS.length + 1, "only ModelSpace and one record per layout are emitted");
  const entitiesSection = dxf.split("  2\nENTITIES\n")[1]?.split("  0\nENDSEC")[0] ?? "";
  const blocksSection = dxf.split("  2\nBLOCKS\n")[1]?.split("  0\nENDSEC")[0] ?? "";
  const paperEntityIndex = entitiesSection.search(/\n 67\n1\n/);
  const modelEntityIndex = entitiesSection.search(/\n 67\n0\n/);
  assert.ok(paperEntityIndex >= 0 && modelEntityIndex > paperEntityIndex,
    "DXF ENTITIES section emits every PaperSpace entity before ModelSpace entities");
  assert.ok(entitiesSection.includes("410\nA-01_Site_Plan"), "the active layout's entities are stored in ENTITIES");
  assert.ok(blocksSection.includes("410\nA-02_Ground_Plan"), "inactive layout entities are stored within their PaperSpace BLOCK definitions");
  assert.ok(!entitiesSection.includes("410\nA-02_Ground_Plan"), "inactive layout entities are not misplaced in ENTITIES");
});

test("DXF elevation layouts contain the same facade vectors as the PDF sheet compiler", async () => {
  const { compilePermitDrawingSet } = await import("@constructflow/sheet-engine");
  const project = createEmptyProjectDocument("CAD-ELEVATION-PARITY", "Elevation parity");
  project.levels = [
    { id: "GF", name: "Ground", elevation_mm: 0, storey_index: 1, height_mm: 3000 },
    { id: "L1", name: "First Floor", elevation_mm: 3000, storey_index: 2, height_mm: 3000 },
  ];
  project.objects.facade = {
    id: "facade", object_type: "architecture.wall", created_phase: "new_construction",
    level_refs: [{ level_id: "GF", role: "base_level" }, { level_id: "L1", role: "top_level" }],
    host_refs: [], connector_refs: [], relationships: [], status: "active",
    module_data: { start_point_mm: [0, 5000, 0], end_point_mm: [4000, 5000, 0], thickness_mm: 100,
      height_mm: 3000, base_level_id: "GF", top_level_id: "L1", inside_finish_mark: "W1", outside_finish_mark: "W2", mark: "AAC" },
  };
  project.objects.demoFacade = {
    id: "demoFacade", object_type: "architecture.wall", created_phase: "demolition",
    level_refs: [{ level_id: "GF", role: "base_level" }, { level_id: "L1", role: "top_level" }],
    host_refs: [], connector_refs: [], relationships: [], status: "active",
    module_data: { start_point_mm: [6000, 5000, 0], end_point_mm: [8000, 5000, 0], thickness_mm: 100,
      height_mm: 3000, base_level_id: "GF", top_level_id: "L1", mark: "DEMO-FACADE-WALL-LABEL-TOO-LONG" },
  };
  project.objects.existingFacade = {
    id: "existingFacade", object_type: "architecture.wall", created_phase: "existing",
    level_refs: [{ level_id: "GF", role: "base_level" }, { level_id: "L1", role: "top_level" }],
    host_refs: [], connector_refs: [], relationships: [], status: "active",
    module_data: { start_point_mm: [9000, 5000, 0], end_point_mm: [11000, 5000, 0], thickness_mm: 100,
      height_mm: 3000, base_level_id: "GF", top_level_id: "L1", mark: "EXISTING-FACADE" },
  };
  const set = compilePermitDrawingSet(project);
  const elevations = set.sheets.filter(sheet => sheet.id === "A-05" || sheet.id === "A-06");
  const a05 = elevations.find(sheet => sheet.id === "A-05");
  assert.ok(a05 && a05.primitives.some(primitive => primitive.kind === "path"));
  const dxf = exportProjectToDxf(project).dxfContent;
  const records = [];
  const pairs = dxf.split(/\r?\n/);
  for (let index = 0; index + 1 < pairs.length;) {
    if (pairs[index].trim() !== "0") { index += 2; continue; }
    const type = pairs[index + 1].trim();
    index += 2;
    const fields = new Map();
    while (index + 1 < pairs.length && pairs[index].trim() !== "0") {
      const key = pairs[index].trim();
      const value = pairs[index + 1].trim();
      if (!fields.has(key)) fields.set(key, []);
      fields.get(key).push(value);
      index += 2;
    }
    records.push({ type, fields });
  }
  const a05Entities = records.filter(record => record.fields.get("410")?.includes("A-05_Elevations_NE"));
  assert.ok(a05Entities.length >= a05.primitives.length,
    `A-05 should contain the compiled sheet primitives (DXF entities ${a05Entities.length}, source primitives ${a05.primitives.length})`);
  assert.ok(a05Entities.some(record => record.type === "TEXT"), "A-05 retains level and facade annotations");
  const paperTextY = (text) => Number(a05Entities.find(record => record.type === "TEXT" && record.fields.get("1")?.includes(text))?.fields.get("20")?.[0]);
  assert.ok(paperTextY("+0.00 Ground") < paperTextY("+3.00 First Floor"), "DXF converts top-down sheet Y to PaperSpace Y-up so higher levels plot higher");
  assert.ok(a05Entities.some(record => record.type === "LWPOLYLINE"), "A-05 contains projected wall/roof edges");
  assert.ok(a05Entities.some(record => record.type === "SOLID" && record.fields.get("420")?.includes("16777215")), "white facade masks keep true white when plotted on a white sheet");
  assert.ok(a05Entities.some(record => record.type === "SOLID" && record.fields.get("420")?.some(color => color !== "16777215")), "light-gray facade fills retain their source truecolor instead of mapping to black ACI 7");
  assert.ok(a05Entities.some(record => record.type === "TEXT" && record.fields.get("1")?.some(text => text.includes("\\U+0E"))), "Thai sheet annotations use DXF Unicode escapes");
  assert.ok(a05Entities.some(record => record.type === "TEXT" && Number(record.fields.get("41")?.[0] ?? 1) < 1), "DXF preserves compiled text max-width constraints with the TEXT width factor");
  assert.ok(a05Entities.some(record => record.fields.get("6")?.includes("DASHED2")), "demolition facade linework retains a dashed linetype");
  assert.ok(!a05Entities.some(record => record.type === "VIEWPORT"), "A-05 is not a top-down plan viewport");

  const aciFor = (color) => ({ "#ef4444": 1, "#94a3b8": 8, "#64748b": 8, "#808080": 8, "#cbd5e1": 9, "#087cf0": 5, "#0284c7": 5, "#0000ff": 5, "#22c55e": 3, "#008000": 3, "#0f172a": 7, "#000000": 7, "#ffffff": 7, white: 7 })[String(color).toLowerCase()] ?? 7;
  const coordinate = (value) => Number(value).toFixed(3);
  for (const sheet of elevations) {
    const layout = LAYOUT_DEFS.find(item => item.id === sheet.id).name;
    const actual = records.filter(record => record.type === "LWPOLYLINE" && record.fields.get("410")?.includes(layout) && record.fields.get("8")?.includes("A-VIEW"));
    const signature = (points, closed, color, width, dashed) => JSON.stringify({
      points: points.map(([x, y]) => [coordinate(x), coordinate(y)]),
      closed: Boolean(closed), color: Number(color), width: Number(width), linetype: Boolean(dashed) ? "DASHED2" : "",
    });
    const expected = sheet.primitives.filter(primitive => primitive.kind === "path" && primitive.points.length >= 2 && primitive.width > 0
      && !(String(primitive.color).toLowerCase() === "#ffffff" && primitive.fill === "#ffffff"))
      .map(primitive => signature(primitive.points.map(([x, y]) => [x, 297 - y]), primitive.closed, aciFor(primitive.color), Math.max(0, Math.min(211, Math.round(primitive.width * 100))), primitive.dash?.length));
    const exported = actual.map(record => {
      const xs = record.fields.get("10") ?? [], ys = record.fields.get("20") ?? [];
      return signature(xs.map((x, index) => [Number(x), Number(ys[index])]), Number(record.fields.get("70")?.[0] ?? 0) & 1,
        record.fields.get("62")?.[0] ?? 7, record.fields.get("370")?.[0] ?? 0, record.fields.get("6")?.[0] === "DASHED2");
    });
    const counts = values => values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
    assert.deepEqual(counts(exported), counts(expected), `${sheet.id} PaperSpace paths must exactly match PDF source vectors after Y-up conversion, including phase styles`);

    const fillPrimitives = sheet.primitives.filter(primitive => primitive.kind === "path" && primitive.closed && primitive.points.length >= 3 && primitive.fill && primitive.fill !== "none");
    const expectedSolids = fillPrimitives.flatMap(primitive => Array.from({ length: primitive.points.length - 2 }, (_, index) => {
      const points = [primitive.points[0], primitive.points[index + 1], primitive.points[index + 2], primitive.points[index + 2]]
        .map(([x, y]) => [x, 297 - y]);
      const color = /^#[0-9a-f]{6}$/i.test(primitive.fill) ? Number.parseInt(primitive.fill.slice(1), 16) : aciFor(primitive.fill);
      return JSON.stringify({ points: points.map(([x, y]) => [coordinate(x), coordinate(y)]), color });
    }));
    const exportedSolids = records.filter(record => record.type === "SOLID" && record.fields.get("410")?.includes(layout) && record.fields.get("8")?.includes("A-VIEW"))
      .map(record => {
        const points = [10, 11, 12, 13].map(code => [Number(record.fields.get(String(code))?.[0]), Number(record.fields.get(String(code + 10))?.[0])]);
        return JSON.stringify({ points: points.map(([x, y]) => [coordinate(x), coordinate(y)]), color: Number(record.fields.get("420")?.[0] ?? record.fields.get("62")?.[0] ?? 7) });
      });
    assert.deepEqual(counts(exportedSolids), counts(expectedSolids), `${sheet.id} PaperSpace fill triangles must preserve PDF path geometry and phase fill colors`);
  }
});

test("DXF A-02 PaperSpace preserves new masonry hatch geometry and phase styling", () => {
  const project = createEmptyProjectDocument("CAD-MASONRY-HATCH-PHASE");
  const levelId = project.levels[0]?.id ?? "GF";
  project.levels = [{ id: levelId, name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 }];
  project.project.active_level_id = levelId;
  const object = (id, object_type, module_data, created_phase = "new_construction") => ({
    id, object_type, created_phase, removed_phase: null,
    owner_module: "constructflow.architecture", schema_version: 1, status: "active",
    level_refs: [{ role: "base_level", level_id: levelId }], host_refs: [], connector_refs: [], relationships: [],
    module_data, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  });
  project.objects.wall = object("wall", "architecture.wall", {
    start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100,
    height_mm: 2800, level_id: levelId, mark: "W1", material: "brick_masonry",
  });
  project.objects.window = object("window", "door_window.window", {
    wall_id: "wall", offset_along_wall_mm: 2000, width_mm: 1000,
    height_mm: 1200, sill_height_mm: 900, level_id: levelId, mark: "W1",
  });

  const sheet = compilePermitDrawingSet(project).sheets.find(candidate => candidate.id === "A-02");
  const expected = sheet.primitives.filter(primitive => primitive.kind === "path" && primitive.color === "#9aa6b4" && primitive.width === 0.15 && primitive.points.length === 2);
  assert.ok(expected.length > 10, "the source plan contains clipped, editable masonry hatch vectors");
  const records = parseDxfRecords(exportProjectToDxf(project).dxfContent);
  const layout = LAYOUT_DEFS.find(candidate => candidate.id === "A-02").name;
  const actual = records.filter(record => record.type === "LWPOLYLINE" && record.fields.get("410")?.includes(layout)
    && record.fields.get("8")?.includes("A-VIEW") && record.fields.get("62")?.includes("8")
    && record.fields.get("370")?.includes("15") && !record.fields.get("6")?.includes("DASHED2"));
  const coordinate = value => Number(value).toFixed(3);
  const signature = points => JSON.stringify(points.map(([x, y]) => [coordinate(x), coordinate(y)]).sort());
  const expectedSignatures = expected.map(primitive => signature(primitive.points.map(([x, y]) => [x, 297 - y])));
  const actualSignatures = actual.map(record => {
    const xs = record.fields.get("10") ?? [], ys = record.fields.get("20") ?? [];
    return signature(xs.map((x, index) => [Number(x), Number(ys[index])]));
  });
  const counts = values => values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
  assert.deepEqual(counts(actualSignatures), counts(expectedSignatures), "PaperSpace keeps the PDF hatch coordinates, ACI 8 gray, and 0.15 mm lineweight");
});

test("DXF A-02 exports shared staggered wood-floor seams with the permit-vector geometry", () => {
  const project = createEmptyProjectDocument("WOOD-FLOOR-DXF");
  project.levels = [{ id: "GF", name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 }];
  project.project.active_level_id = "GF";
  project.objects.floor = {
    id: "floor", object_type: "architecture.floor", owner_module: "constructflow.architecture", schema_version: 1,
    created_phase: "new_construction", removed_phase: null, status: "active",
    level_refs: [{ role: "base_level", level_id: "GF" }], host_refs: [], connector_refs: [], relationships: [],
    module_data: {
      mark: "AF1", level_id: "GF", elevation_reference: "level", elevation_mm: 0, elevation_offset_mm: 0,
      boundary_mm: [[0, 0], [4000, 0], [4000, 2000], [0, 2000]],
      voids_mm: [[[1000, 500], [1500, 500], [1500, 900], [1000, 900]]], thickness_mm: 50,
      finish_layers: [{ mark: "Timber", material: "engineered_wood", thickness_mm: 15 }],
      finish_pattern_mm: [1200, 200], finish_pattern_origin_mm: [0, 0], finish_pattern_rotation_deg: 0,
    },
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };

  const sheet = compilePermitDrawingSet(project).sheets.find(candidate => candidate.id === "A-02");
  const expected = sheet.primitives.filter(primitive => primitive.kind === "path" && primitive.color === "#cbd5e1" && primitive.width === 0.1 && primitive.points.length === 2);
  assert.ok(expected.length > 0, "the source plan contains timber seams and staggered end joints");
  const layout = LAYOUT_DEFS.find(candidate => candidate.id === "A-02").name;
  const actual = parseDxfRecords(exportProjectToDxf(project).dxfContent).filter(record =>
    record.type === "LWPOLYLINE" && record.fields.get("410")?.includes(layout)
      && record.fields.get("8")?.includes("A-VIEW") && record.fields.get("62")?.includes("9")
      && record.fields.get("370")?.includes("10"),
  );
  const coordinate = value => Number(value).toFixed(3);
  const signature = points => JSON.stringify(points.map(([x, y]) => [coordinate(x), coordinate(y)]).sort());
  const expectedSignatures = expected.map(primitive => signature(primitive.points.map(([x, y]) => [x, 297 - y])));
  const actualSignatures = actual.map(record => {
    const xs = record.fields.get("10") ?? [], ys = record.fields.get("20") ?? [];
    return signature(xs.map((x, index) => [Number(x), Number(ys[index])]));
  });
  const counts = values => values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
  assert.deepEqual(counts(actualSignatures), counts(expectedSignatures), "DXF PaperSpace keeps the clipped PDF timber geometry, ACI 9 color, and 0.1 mm lineweight");
});

test("DXF A-10 ceiling grids preserve phase color, dash and lineweight from the permit vectors", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const ceilings = Object.values(project.objects).filter(object =>
    object.object_type === "architecture.ceiling" && (!object.module_data.level_id || object.module_data.level_id === project.project.active_level_id),
  );
  assert.ok(ceilings.length >= 3, "the fixture supplies ceilings for all three phase styles");
  ceilings[0].created_phase = "existing";
  ceilings[1].removed_phase = "demolition";

  const sheet = compilePermitDrawingSet(project).sheets.find(item => item.id === "A-10");
  assert.ok(sheet);
  const layoutName = LAYOUT_DEFS.find(layout => layout.id === "A-10").name;
  const records = parseDxfRecords(exportProjectToDxf(project).dxfContent)
    .filter(record => record.type === "LWPOLYLINE" && record.fields.get("410")?.includes(layoutName));
  const phaseStyles = [
    { color: "#94a3b8", aci: "8", linetype: undefined },
    { color: "#cbd5e1", aci: "9", linetype: undefined },
    { color: "#ef4444", aci: "1", linetype: "DASHED2" },
  ];
  for (const style of phaseStyles) {
    const sourceCount = sheet.primitives.filter(item =>
      item.kind === "path" && item.width === 0.12 && item.color === style.color && (item.dash?.length ? "DASHED2" : undefined) === style.linetype,
    ).length;
    const exported = records.filter(record =>
      record.fields.get("62")?.includes(style.aci) && record.fields.get("370")?.includes("12") &&
      (record.fields.get("6")?.[0] ?? undefined) === style.linetype,
    );
    assert.ok(sourceCount > 0, `${style.color} has compiled RCP grid vectors`);
    assert.equal(exported.length, sourceCount, `${style.color} RCP grids preserve color, linetype and 0.12 mm lineweight in DXF`);
  }
});

test("second-project A-10 compiles a voided ceiling at 1:50 and exports its same RCP grids to DXF", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/kitchen-extension-proof.cfproj", import.meta.url), "utf8"));
  const ceilingId = "d527a848-181e-4a7c-b388-2eb24d174f54";
  project.objects[ceilingId] = {
    id: ceilingId,
    object_type: "architecture.ceiling",
    owner_module: "constructflow.architecture",
    schema_version: 1,
    created_phase: "new_construction",
    removed_phase: null,
    level_refs: [{ role: "base_level", level_id: "GF" }],
    host_refs: [],
    connector_refs: [],
    relationships: [],
    status: "active",
    module_data: {
      mark: "CL1", level_id: "GF", elevation_reference: "level", elevation_offset_mm: 2700,
      elevation_mm: 2700, thickness_mm: 12, material: "gypsum_board", grid_mm: [600, 600],
      boundary_mm: [[0, 0], [4000, 0], [4000, 2500], [0, 2500]],
      voids_mm: [[[1500, 800], [2200, 800], [2200, 1200], [1500, 1200]]],
    },
    created_at: "2026-10-09T00:00:00.000Z",
    updated_at: "2026-10-09T00:00:00.000Z",
  };

  const sheet = compilePermitDrawingSet(project).sheets.find(item => item.id === "A-10");
  assert.ok(sheet);
  assert.equal(sheet.scale, "1:50", "the second-project reflected ceiling plan fits at 1:50");
  assert.ok(sheet.source_object_ids.includes(ceilingId));
  assert.ok(sheet.primitives.some(item => item.kind === "text" && item.text.includes("CL1:") && item.text.includes("+2.700 m")));
  const sourceGridCount = sheet.primitives.filter(item => item.kind === "path" && item.width === 0.12 && item.color === "#94a3b8" && !item.dash?.length).length;
  assert.ok(sourceGridCount > 0, "the RCP contains compiled grid segments around the ceiling void");

  const layoutName = LAYOUT_DEFS.find(layout => layout.id === "A-10").name;
  const gridEntities = parseDxfRecords(exportProjectToDxf(project).dxfContent).filter(record =>
    record.type === "LWPOLYLINE" && record.fields.get("410")?.includes(layoutName) &&
    record.fields.get("62")?.includes("8") && record.fields.get("370")?.includes("12") && !record.fields.has("6"),
  );
  assert.equal(gridEntities.length, sourceGridCount, "DXF exports the same 1:50 RCP grid vectors with the new-construction phase style");
  assert.ok(!sheet.warnings.some(warning => warning.includes("no modeled ceiling objects")));
});

test("saved upper-storey RCP selection exports the same void-clipped grid vectors to DXF", () => {
  const project = createEmptyProjectDocument("DXF-UPPER-RCP-PROOF", "Upper-storey RCP parity");
  project.levels = [
    { id: "GF", name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 },
    { id: "L2", name: "Level 2", elevation_mm: 3000, storey_index: 1, height_mm: 3000 },
  ];
  project.project.active_level_id = "GF";
  project.drawing_settings = { viewports: {
    "A-10": { scale_denominator: 50, level_id: "L2", center_mm: [2000, 1500] },
  } };
  const makeCeiling = (id, levelId, elevation, grid, phase = "new_construction") => ({
    id, object_type: "architecture.ceiling", owner_module: "constructflow.architecture", schema_version: 1,
    created_phase: phase, removed_phase: null, status: "active",
    level_refs: [{ role: "base_level", level_id: levelId }], host_refs: [], connector_refs: [], relationships: [],
    module_data: {
      mark: id, level_id: levelId, elevation_reference: "level",
      elevation_offset_mm: elevation - project.levels.find(level => level.id === levelId).elevation_mm,
      elevation_mm: elevation, thickness_mm: 12, material: "gypsum_board", grid_mm: grid,
      boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
      voids_mm: [[[1500, 1000], [2200, 1000], [2200, 1600], [1500, 1600]]],
    },
    created_at: "2026-10-09T00:00:00.000Z", updated_at: "2026-10-09T00:00:00.000Z",
  });
  project.objects["ceiling-gf"] = makeCeiling("ceiling-gf", "GF", 2700, [600, 600], "existing");
  project.objects["ceiling-l2"] = makeCeiling("ceiling-l2", "L2", 5700, [300, 600]);

  const sheet = compilePermitDrawingSet(project).sheets.find(item => item.id === "A-10");
  assert.ok(sheet);
  assert.equal(sheet.scale, "1:50");
  assert.deepEqual(sheet.source_object_ids, ["ceiling-l2"], "saved A-10 viewport selects the upper ceiling while excluding ground-storey work");
  assert.ok(sheet.primitives.some(item => item.kind === "text" && item.text.includes("ceiling-l2") && item.text.includes("+5.700 m")));
  const sourceGrid = sheet.primitives.filter(item => item.kind === "path" && item.width === 0.12 && item.color === "#94a3b8" && !item.dash?.length);
  assert.ok(sourceGrid.length > 0);

  const layoutName = LAYOUT_DEFS.find(layout => layout.id === "A-10").name;
  const exportedGrid = parseDxfRecords(exportProjectToDxf(project).dxfContent).filter(record =>
    record.type === "LWPOLYLINE" && record.fields.get("410")?.includes(layoutName) &&
    record.fields.get("62")?.includes("8") && record.fields.get("370")?.includes("12") && !record.fields.has("6"),
  );
  const expectedGeometry = sourceGrid.map(item => item.points.map(([x, y]) => [Number(x.toFixed(3)), Number((297 - y).toFixed(3))]));
  const actualGeometry = exportedGrid.map(record => record.fields.get("10").map((x, index) => [Number(x), Number(record.fields.get("20")[index]) ]));
  const canonical = values => values.map(value => JSON.stringify(value)).sort();
  assert.deepEqual(canonical(actualGeometry), canonical(expectedGeometry), "upper-storey RCP grid vectors preserve exact PDF geometry after DXF Y-up conversion");
});

test("DXF includes per-storey PaperSpace layouts and vectors from the compiled multi-storey set", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const compiled = compilePermitDrawingSet(project);
  const dynamicSheets = compiled.sheets.filter(sheet => sheet.id === "A-02-L3" || sheet.id === "S-02-L3");
  assert.equal(dynamicSheets.length, 2, "the fixture has a third level requiring additional plan and framing sheets");

  const result = exportProjectToDxf(project);
  assert.equal(result.layoutsCount, compiled.sheets.length, "every compiled PDF page must have a DXF PaperSpace layout");
  for (const sheet of dynamicSheets) {
    const layoutName = `${sheet.id}_Level_3`;
    assert.ok(result.dxfContent.includes(`\n  3\n${layoutName}\n`), `${layoutName} must appear in the DXF layout dictionary`);
    const entityCount = (result.dxfContent.match(new RegExp(`\\n410\\n${layoutName}\\n`, "g")) ?? []).length;
    assert.ok(entityCount >= sheet.primitives.length, `${layoutName} must preserve all compiled vectors (${entityCount} entities for ${sheet.primitives.length} primitives)`);
    assert.ok(result.publishScriptContent.includes(`-LAYOUT Set ${layoutName}`), `${layoutName} must be included in batch publishing`);
  }
});

test("kitchen-extension permit sheets preserve auto-fitted scales and matching DXF PaperSpace vectors", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/kitchen-extension-proof.cfproj", import.meta.url), "utf8"));
  const compiled = compilePermitDrawingSet(project);
  const result = exportProjectToDxf(project);
  assert.equal(compiled.sheets.length, 20);
  assert.equal(result.layoutsCount, compiled.sheets.length);
  assert.deepEqual(Object.fromEntries(["A-02", "A-05", "A-06", "A-10"].map(id => [id, compiled.sheets.find(sheet => sheet.id === id)?.scale])), {
    "A-02": "1:25", "A-05": "1:50", "A-06": "1:50", "A-10": "1:50",
  });
  assert.ok(compiled.sheets.every(sheet => !sheet.warnings.some(warning => warning.startsWith("Viewport clips model"))));
  for (const sheetId of ["A-02", "A-05", "A-06", "A-10"]) {
    const sheet = compiled.sheets.find(candidate => candidate.id === sheetId);
    const layout = LAYOUT_DEFS.find(candidate => candidate.id === sheetId)?.name;
    assert.ok(layout, `${sheetId} must map to its standard PaperSpace layout`);
    const entities = (result.dxfContent.match(new RegExp(`\\n410\\n${layout}\\n`, "g")) ?? []).length;
    assert.ok(entities >= sheet.primitives.length, `${sheetId} should retain its compiled PDF vectors in DXF (${entities} entities for ${sheet.primitives.length} primitives)`);
  }
});

test("cad-adapter: layer resolver correctly assigns AIA/วสท. phase layers", () => {
  const colNew = resolveCadLayer("structure.column", "new_construction");
  assert.equal(colNew.name, "S-COLN-NEWW");
  assert.equal(colNew.colorNumber, 7);

  const colExst = resolveCadLayer("structure.column", "existing");
  assert.equal(colExst.name, "S-COLN-EXST");
  assert.equal(colExst.colorNumber, 8);

  const wallDemo = resolveCadLayer("arch.wall", "demolition");
  assert.equal(wallDemo.name, "A-WALL-DEMO");
  assert.equal(wallDemo.colorNumber, 1);
  assert.equal(wallDemo.lineType, "DASHED2");

  for (const [objectType, layerName] of [
    ["structure.column", "S-COLN-DEMO"], ["structure.beam", "S-BEAM-DEMO"],
    ["structure.foundation", "S-FNDN-DEMO"], ["structure.slab", "S-SLAB-DEMO"],
    ["door_window.door", "A-DOOR-DEMO"], ["door_window.window", "A-WIND-DEMO"],
    ["architecture.floor", "A-FINS-DEMO"], ["architecture.ceiling", "A-FINS-DEMO"],
  ]) assert.equal(resolveCadLayer(objectType, "demolition").name, layerName);
  for (const objectType of ["structure.column", "structure.beam", "structure.foundation", "structure.slab", "door_window.door", "door_window.window", "architecture.floor", "architecture.ceiling"])
    assert.equal(resolveCadLayer(objectType, "new_construction").colorNumber, 7, `${objectType} new work uses the shared dark phase palette`);
});

test("DXF ModelSpace uses the removal phase for architectural and structural objects", () => {
  const project = createEmptyProjectDocument("CAD-REMOVAL-PHASE");
  project.objects.wall = {
    id: "wall", object_type: "architecture.wall", created_phase: "existing",
    removed_phase: "demolition", level_refs: [], host_refs: [], connector_refs: [],
    relationships: [], status: "active",
    module_data: { start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100 },
  };
  const removedObject = (id, object_type, module_data) => ({
    id, object_type, created_phase: "existing", removed_phase: "demolition",
    level_refs: [], host_refs: [], connector_refs: [], relationships: [], status: "active", module_data,
  });
  project.objects.column = removedObject("column", "structure.column", { location_mm: [1000, 1000, 0], section_mm: [200, 200] });
  project.objects.beam = removedObject("beam", "structure.beam", { start_point_mm: [0, 1000, 0], end_point_mm: [3000, 1000, 0], section_mm: [200, 400] });
  project.objects.foundation = removedObject("foundation", "structure.foundation", { center_mm: [1000, 1000, 0], size_mm: [800, 800, 300] });
  project.objects.slab = removedObject("slab", "structure.slab", { boundary_mm: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]], voids_mm: [], thickness_mm: 120, topping_mm: 0, slab_system: "slab_on_ground", material: "reinforced_concrete", mark: "S1" });
  project.objects.door = removedObject("door", "door_window.door", { location_mm: [1000, 0, 0], width_mm: 900 });
  project.objects.window = removedObject("window", "door_window.window", { location_mm: [2000, 0, 0], width_mm: 1200 });

  const dxf = exportProjectToDxf(project).dxfContent;
  const modelSpace = dxf.split("  2\nENTITIES\n")[1]?.split("  0\nENDSEC")[0] ?? "";
  assert.ok(modelSpace.includes("  8\nA-WALL-DEMO"), "removed existing walls must use the demolition layer");
  assert.ok(!modelSpace.includes("  8\nA-WALL-EXST"), "removed walls must not retain their original existing layer");
  assert.match(modelSpace, /  0\nLINE\n  5\n[^\n]+\n330\n[^\n]+\n100\nAcDbEntity\n  8\nA-WALL-DEMO/, "demolition hatch strokes use the demolition layer in ModelSpace");
  for (const layerName of ["S-COLN-DEMO", "S-BEAM-DEMO", "S-FNDN-DEMO", "S-SLAB-DEMO", "A-DOOR-DEMO", "A-WIND-DEMO"])
    assert.ok(modelSpace.includes(`  8\n${layerName}`), `removed objects must use ${layerName}`);
});

test("DXF exports hosted openings, both wall finish marks, and floor cutout rings", () => {
  const project = createEmptyProjectDocument("CAD-VERTICAL-PLAN");
  project.levels = [{ id: "GF", name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 }];
  const object = (id, object_type, module_data) => ({
    id, object_type, created_phase: "new_construction", removed_phase: null,
    owner_module: "constructflow.architecture", schema_version: 1, status: "active",
    level_refs: [], host_refs: [], connector_refs: [], relationships: [],
    module_data, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  });
  project.objects.wall = object("wall", "architecture.wall", {
    start_point_mm: [0, 0, 0], end_point_mm: [5000, 0, 0], thickness_mm: 100,
    mark: "W1", inside_finish_mark: "W2", outside_finish_mark: "W1",
  });
  project.objects.existingWall = { ...object("existingWall", "architecture.wall", {
    start_point_mm: [0, 5000, 0], end_point_mm: [4000, 5000, 0], thickness_mm: 150, mark: "W0",
  }), created_phase: "existing" };
  project.objects.door = object("door", "door_window.door", {
    wall_id: "wall", mark: "D1", offset_along_wall_mm: 1500, width_mm: 900,
    handing: "left_in",
  });
  project.objects.window = object("window", "door_window.window", {
    wall_id: "wall", mark: "W1", offset_along_wall_mm: 3700, width_mm: 1200, panel_count: 2,
  });
  project.types.push({
    id: "catalog-wall-type", object_type: "architecture.wall", name: "Catalog Wall",
    parameters: { inside_finish_mark: "IF-CAT", outside_finish_mark: "OF-CAT" },
  });
  project.objects.catalogWall = object("catalogWall", "architecture.wall", {
    start_point_mm: [0, 6000, 0], end_point_mm: [3000, 6000, 0], thickness_mm: 100,
    mark: "Catalog Wall", type_id: "catalog-wall-type",
  });
  project.objects.slab = object("slab", "structure.slab", {
    boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
    voids_mm: [[[1500, 1000], [2500, 1000], [2500, 2000], [1500, 2000]]],
    thickness_mm: 120, topping_mm: 0, mark: "S1", level_id: "GF", elevation_mm: 0,
    slab_system: "slab_on_ground", material: "reinforced_concrete",
  });
  project.objects.archFloor = object("archFloor", "architecture.floor", {
    boundary_mm: [[0,0],[4000,0],[4000,3000],[0,3000]],
    voids_mm: [[[1000,1000],[2000,1000],[2000,2000],[1000,2000]]], mark: "AF1", level_id: "GF",
    finish_layers: [{ material: "porcelain_tile", thickness_mm: 10 }], finish_pattern_mm: [1000, 1000],
  });
  project.objects.room = object("room", "architecture.room", {
    boundary_mm: [[0,0],[4000,0],[4000,3000],[0,3000]], area_mm2: 12000000,
    mark: "R1", number: "1", name: "ห้องนั่งเล่น",
  });
  const dxf = exportProjectToDxf(project).dxfContent;
  const a02 = compilePermitDrawingSet(project).sheets.find(sheet => sheet.id === "A-02");
  const tileLineCount = a02.primitives.filter(primitive => primitive.kind === "path" && primitive.color === "#0f172a").length;
  assert.ok(tileLineCount > 0, "A-02 compiles tile finish as clipped vector paths");
  assert.ok(dxf.includes("W2") && dxf.includes("W1"));
  assert.ok(dxf.includes("SOLID\n  5"), "existing walls use a plot-background-aware solid poche");
  assert.ok(dxf.includes(" 62\n7\n100\nAcDbTrace"), "existing wall poche uses color 7 for black/white background contrast");
  const newWallEntities = dxf.match(/  0\nLINE\n  5\n[^\n]+\n330\n[^\n]+\n100\nAcDbEntity\n  8\nA-WALL-NEWW/g) ?? [];
  assert.ok(newWallEntities.length > 20, "new walls include model-space masonry hatch lines in addition to outlines");
  assert.ok(dxf.includes("D1"));
  assert.ok(dxf.includes("IF-CAT") && dxf.includes("OF-CAT"), "DXF wall-face tags resolve inside/outside marks from the assigned catalog type");
  assert.ok((dxf.match(/LWPOLYLINE/g) ?? []).length >= 5, "door leaf, structural slab rings and architectural floor rings are vector outlines");
  const records = [];
  const pairs = dxf.split(/\r?\n/);
  for (let index = 0; index + 1 < pairs.length;) {
    if (pairs[index].trim() !== "0") { index += 2; continue; }
    const type = pairs[index + 1].trim(); index += 2; const fields = new Map();
    while (index + 1 < pairs.length && pairs[index].trim() !== "0") { const key = pairs[index].trim(), value = pairs[index + 1].trim(); if (!fields.has(key)) fields.set(key, []); fields.get(key).push(value); index += 2; }
    records.push({ type, fields });
  }
  const a02ViewLines = records.filter(record => record.type === "LWPOLYLINE" && record.fields.get("410")?.includes("A-02_Ground_Plan") && record.fields.get("8")?.includes("A-VIEW"));
  assert.ok(a02ViewLines.length >= tileLineCount, `DXF A-02 PaperSpace should contain the ${tileLineCount} compiled tile paths (found ${a02ViewLines.length} view lines)`);
  assert.ok(dxf.includes("\\U+0E2B") && dxf.includes("12.00 m2"), "Thai room annotation uses DXF Unicode escapes and keeps its area");
});
