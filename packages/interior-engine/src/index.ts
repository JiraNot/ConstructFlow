import type {
  ProjectDocument,
  CabinetModuleData,
} from "@constructflow/project-model";
import { legacyTypeUuid } from "@constructflow/project-model";
import type {
  CommandHandlerContext,
  CommandBusResult,
} from "@constructflow/command-schema";
import { box, type Vec3 } from "@constructflow/geometry-kernel";
import {
  domainCommand,
  placement,
  resolvedData,
  output,
  vec3,
  list,
  positive,
  num,
  integer,
  text,
  choice,
  type DomainOutput,
} from "@constructflow/module-sdk";
export function decodeCabinet(
  d: Record<string, unknown>,
  p: ProjectDocument,
): CabinetModuleData {
  const result: CabinetModuleData = {
    ...placement(d, p),
    location_mm: vec3(d.location_mm, "location"),
    width_mm: positive(d.width_mm, "width"),
    height_mm: positive(d.height_mm, "height"),
    depth_mm: positive(d.depth_mm, "depth"),
    board_mm: positive(d.board_mm, "board thickness"),
    back_mm: positive(d.back_mm, "back thickness"),
    plinth_mm: num(d.plinth_mm, "plinth", 0),
    rotation_deg: num(d.rotation_deg ?? 0, "rotation"),
    modules_mm: list(d.modules_mm, "module widths", (v) =>
      positive(v, "module width"),
    ),
    shelves: integer(d.shelves ?? 0, "shelf count", 0),
    drawers: integer(d.drawers ?? 0, "drawer count", 0),
    front: choice(d.front, ["solid", "glass", "open"], "front"),
    carcass_material: text(d.carcass_material, "carcass material"),
    front_material: text(d.front_material, "front material"),
    back_material: text(d.back_material, "back material"),
    countertop_material: text(d.countertop_material, "countertop material"),
    countertop_mm: num(d.countertop_mm, "countertop thickness", 0),
  };
  if (
    Math.abs(result.modules_mm.reduce((a, b) => a + b, 0) - result.width_mm) >
    1e-6
  )
    throw new Error("Module widths must sum to overall cabinet width");
  if (
    result.height_mm - result.plinth_mm <= 4 * result.board_mm ||
    result.depth_mm <= 2 * result.board_mm + result.back_mm ||
    result.modules_mm.some((v) => v <= 3 * result.board_mm)
  )
    throw new Error("Cabinet boards/plinth exceed available clear dimensions");
  if (
    result.drawers > 0 &&
    (result.modules_mm.some((v) => v <= 5 * result.board_mm) ||
      (result.height_mm - result.plinth_mm - 2 * result.board_mm) /
        (result.shelves > 0 ? 2 : 1) /
        result.drawers <=
        5 * result.board_mm)
  )
    throw new Error("Drawer box has insufficient clear dimensions");
  if (result.modules_mm.length * (result.shelves + result.drawers + 1) > 10000)
    throw new Error("Joinery part count exceeds supported limit");
  return result;
}
export interface JoineryPart {
  id: string;
  name: string;
  material: string;
  size_mm: Vec3;
  origin_mm: Vec3;
  cut_mm: [number, number];
  thickness_mm: number;
  edge_band_m: number;
}
export function generateProjectCutList(project: ProjectDocument) {
  return Object.values(project.objects)
    .filter((o) => o.object_type === "interior.cabinet_run")
    .flatMap((o) =>
      generateJoineryParts(
        decodeCabinet(resolvedData(project, o), project),
        o.id,
      ).map((part) => ({
        ...part,
        object_id: o.id,
        phase: o.removed_phase ?? o.created_phase,
      })),
    )
    .sort(
      (a, b) =>
        a.object_id.localeCompare(b.object_id) || a.name.localeCompare(b.name),
    );
}
export function generateJoineryParts(
  d: CabinetModuleData,
  sourceId: string,
): JoineryPart[] {
  const parts: JoineryPart[] = [],
    b = d.board_mm,
    H = d.height_mm - d.plinth_mm,
    D = d.depth_mm;
  const add = (
    name: string,
    material: string,
    size: Vec3,
    origin: Vec3,
    cut: [number, number],
    thickness: number,
    edgeBand: number,
  ) => {
    if (size.some((v) => v <= 0) || cut.some((v) => v <= 0))
      throw new Error("Generated joinery part has nonpositive dimensions");
    parts.push({
      id: legacyTypeUuid("interior.part", sourceId, name),
      name,
      material,
      size_mm: size,
      origin_mm: origin,
      cut_mm: cut,
      thickness_mm: thickness,
      edge_band_m: edgeBand / 1000,
    });
  };
  add(
    "Left side",
    d.carcass_material,
    [b, D, H],
    [0, 0, d.plinth_mm],
    [D, H],
    b,
    H,
  );
  add(
    "Right side",
    d.carcass_material,
    [b, D, H],
    [d.width_mm - b, 0, d.plinth_mm],
    [D, H],
    b,
    H,
  );
  add(
    "Bottom",
    d.carcass_material,
    [d.width_mm - 2 * b, D, b],
    [b, 0, d.plinth_mm],
    [d.width_mm - 2 * b, D],
    b,
    d.width_mm - 2 * b,
  );
  add(
    "Top",
    d.carcass_material,
    [d.width_mm - 2 * b, D, b],
    [b, 0, d.height_mm - b],
    [d.width_mm - 2 * b, D],
    b,
    d.width_mm - 2 * b,
  );
  add(
    "Back",
    d.back_material,
    [d.width_mm - 2 * b, d.back_mm, H - 2 * b],
    [b, D - d.back_mm, d.plinth_mm + b],
    [d.width_mm - 2 * b, H - 2 * b],
    d.back_mm,
    0,
  );
  if (d.plinth_mm > 0)
    add(
      "Toe kick",
      d.carcass_material,
      [d.width_mm, b, d.plinth_mm],
      [0, 50, 0],
      [d.width_mm, d.plinth_mm],
      b,
      d.width_mm,
    );
  let x = 0;
  d.modules_mm.forEach((w, i) => {
    if (i > 0)
      add(
        "Divider " + i,
        d.carcass_material,
        [b, D - d.back_mm, H - 2 * b],
        [x - b / 2, 0, d.plinth_mm + b],
        [D - d.back_mm, H - 2 * b],
        b,
        H - 2 * b,
      );
    const left = Math.max(x + b / 2, b),
      right = Math.min(x + w - b / 2, d.width_mm - b),
      clear = right - left;
    const drawerHeight =
      d.drawers > 0 ? (H - 2 * b) / (d.shelves > 0 ? 2 : 1) : 0;
    for (let s = 0; s < d.shelves; s++) {
      const z =
        d.plinth_mm +
        b +
        drawerHeight +
        ((s + 1) * (H - 2 * b - drawerHeight - b)) / (d.shelves + 1);
      add(
        "Shelf " + i + "-" + s,
        d.carcass_material,
        [clear, D - d.back_mm, b],
        [left, 0, z],
        [clear, D - d.back_mm],
        b,
        clear,
      );
    }
    if (d.drawers > 0) {
      const dh = drawerHeight / d.drawers;
      for (let j = 0; j < d.drawers; j++) {
        const z = d.plinth_mm + b + j * dh;
        for (const [side, offset] of [
          ["left", 0],
          ["right", clear - b],
        ] as const)
          add(
            `Drawer ${side} ${i}-${j}`,
            d.carcass_material,
            [b, D - d.back_mm - b, dh - 4 * b],
            [left + offset, 0, z + b],
            [D - d.back_mm - b, dh - 4 * b],
            b,
            0,
          );
        add(
          `Drawer back ${i}-${j}`,
          d.carcass_material,
          [clear - 2 * b, b, dh - 4 * b],
          [left + b, D - d.back_mm - 2 * b, z + b],
          [clear - 2 * b, dh - 4 * b],
          b,
          0,
        );
        add(
          "Drawer bottom " + i + "-" + j,
          d.carcass_material,
          [clear - 2 * b, D - d.back_mm - b, b],
          [left + b, 0, z],
          [clear - 2 * b, D - d.back_mm - b],
          b,
          0,
        );
        add(
          "Drawer front " + i + "-" + j,
          d.front_material,
          [w - 4, b, dh - 4],
          [x + 2, -b, z],
          [w - 4, dh - 4],
          b,
          2 * (w + dh - 8),
        );
      }
    } else if (d.front !== "open")
      add(
        "Front " + i,
        d.front_material,
        [w - 4, b, H - 4],
        [x + 2, -b, d.plinth_mm + 2],
        [w - 4, H - 4],
        b,
        2 * (w + H - 8),
      );
    x += w;
  });
  if (d.countertop_mm > 0)
    add(
      "Countertop",
      d.countertop_material,
      [d.width_mm, D + 20, d.countertop_mm],
      [0, -20, d.height_mm],
      [d.width_mm, D + 20],
      d.countertop_mm,
      0,
    );
  return parts;
}
export function executeInteriorCommand(
  c: CommandHandlerContext,
): CommandBusResult | undefined {
  if (["CreateCabinetRun", "UpdateCabinetRun"].includes(c.commandName))
    return domainCommand(
      c,
      "interior.cabinet_run",
      "constructflow.interior",
      decodeCabinet,
      { update: c.commandName === "UpdateCabinetRun" },
    );
  return undefined;
}
export function interiorOutputs(p: ProjectDocument): DomainOutput[] {
  return Object.values(p.objects)
    .filter((o) => o.object_type === "interior.cabinet_run")
    .map((o) => {
      const d = decodeCabinet(resolvedData(p, o), p),
        out = output(o, d),
        parts = generateJoineryParts(d, o.id),
        angle = (d.rotation_deg * Math.PI) / 180,
        [x, y, z] = d.location_mm;
      out.meshes = parts.flatMap((part) => {
        const [a, b, c] = part.origin_mm;
        return box(
          [
            x + a * Math.cos(angle) - b * Math.sin(angle),
            y + a * Math.sin(angle) + b * Math.cos(angle),
            z + c,
          ],
          part.size_mm,
          angle,
        );
      });
      const groups = new Map<string, number>();
      for (const part of parts)
        groups.set(
          `${part.material} | ${part.thickness_mm} mm`,
          (groups.get(`${part.material} | ${part.thickness_mm} mm`) ?? 0) +
            (part.cut_mm[0] * part.cut_mm[1]) / 1e6,
        );
      out.quantities = [...groups.entries()].map(([material, quantity]) => ({
        classification: "joinery.board_area",
        description: d.mark + " " + material,
        quantity,
        unit: "m2" as const,
        formula: "sum traceable part cut width * height / 1e6",
        material,
      }));
      out.quantities.push({
        classification: "joinery.edge_band",
        description: d.mark + " edge band",
        quantity: parts.reduce((s, v) => s + v.edge_band_m, 0),
        unit: "m",
        formula: "sum declared banded part edges / 1000",
        material: "edge band",
      });
      if (d.drawers > 0)
        out.quantities.push({
          classification: "joinery.drawer_slides",
          description: d.mark + " slide pairs",
          quantity: d.drawers * d.modules_mm.length * 2,
          unit: "pcs",
          formula: "two slides per explicit drawer",
          material: "hardware",
        });
      out.schedule = {
        Width_m: d.width_mm / 1000,
        Height_m: d.height_mm / 1000,
        Depth_m: d.depth_mm / 1000,
        Modules: d.modules_mm.length,
        Parts: parts.length,
        Front: d.front,
        Carcass: d.carcass_material,
        Front_material: d.front_material,
        Edge_band_m: parts.reduce((s, v) => s + v.edge_band_m, 0),
      };
      return out;
    });
}
export function validateInterior(p: ProjectDocument): void {
  interiorOutputs(p);
}
