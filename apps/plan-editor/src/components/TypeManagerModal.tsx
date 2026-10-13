import React, { useEffect, useMemo, useRef, useState } from "react";
import { DOOR_FACE_DESIGNS, OPENING_DESIGNS } from "@constructflow/project-model";
import type {
  ProjectDocument,
  TypeDefinition,
  TypeParameters,
} from "@constructflow/project-model";
import { validateProjectV2 } from "@constructflow/project-model";
import type {
  CommandRequest,
  CommandBatchResult,
} from "@constructflow/command-schema";
import {
  Search,
  Plus,
  ArrowLeft,
  Star,
  Copy,
  Pencil,
  Check,
  BookmarkPlus,
  Trash2,
  Download,
  Upload,
} from "lucide-react";
import { Dialog } from "./ui/Dialog.js";
import { CatalogField } from "./CatalogField.js";
import {
  CATALOG_FAMILIES,
  TOOL_FAMILIES,
  OPERATION_LABELS,
  TypeThumbnail,
  typeDescription,
  typeSizeLabel,
  type OpeningPreviewPart,
} from "./catalogPresentation.js";
import { OpeningElevationThumbnail } from "./OpeningElevationThumbnail.js";
import { buildOpeningRepresentationShapeFromType } from "@constructflow/representation-engine";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectDocument;
  initialFamily?: string;
  initialTypeId?: string;
  editInitially?: boolean;
  selectionIntent?: "draw" | "assign";
  selectionFamily?: string;
  selectedObjectId?: string;
  onChoose: (type: TypeDefinition) => void;
  onExecute: (commands: CommandRequest[]) => CommandBatchResult;
  onRenamed: (type: TypeDefinition, name: string) => void;
}
type Editor = {
  source: TypeDefinition | null;
  family: string;
  name: string;
  parameters: TypeParameters;
  creating: boolean;
};
type Preferences = { favorites: string[]; recent: string[] };
type PersonalCatalogEntry = {
  id: string;
  sourceTypeId: string;
  name: string;
  object_type: string;
  parameters: TypeParameters;
};
const PERSONAL_CATALOG_KEY = "cf-personal-type-library-v1";
const PERSONAL_CATALOG_FILE_FORMAT = "constructflow-type-library";
const PERSONAL_CATALOG_FILE_VERSION = 1;
const PERSONAL_CATALOG_FILE_LIMIT = 2 * 1024 * 1024;
const PERSONAL_CATALOG_ENTRY_LIMIT = 500;
function loadPersonalCatalog(): PersonalCatalogEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PERSONAL_CATALOG_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is PersonalCatalogEntry =>
      !!entry && typeof entry === "object" &&
      typeof entry.id === "string" && typeof entry.sourceTypeId === "string" &&
      typeof entry.name === "string" && typeof entry.object_type === "string" &&
      !!entry.parameters && typeof entry.parameters === "object" && !Array.isArray(entry.parameters),
    );
  } catch {
    return [];
  }
}
function parsePersonalCatalogFile(raw: string, project: ProjectDocument): PersonalCatalogEntry[] {
  if (raw.length > PERSONAL_CATALOG_FILE_LIMIT)
    throw new Error("ไฟล์คลังชนิดมีขนาดเกิน 2 MB");
  const payload: unknown = JSON.parse(raw);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("โครงสร้างไฟล์คลังชนิดไม่ถูกต้อง");
  const document = payload as Record<string, unknown>;
  if (document.format !== PERSONAL_CATALOG_FILE_FORMAT || document.format_version !== PERSONAL_CATALOG_FILE_VERSION)
    throw new Error("ไม่รองรับรูปแบบหรือเวอร์ชันไฟล์คลังชนิดนี้");
  if (!Array.isArray(document.types) || document.types.length > PERSONAL_CATALOG_ENTRY_LIMIT)
    throw new Error("ไฟล์คลังชนิดต้องมีไม่เกิน 500 รายการ");

  const families = new Set<string>(CATALOG_FAMILIES.map(([family]) => family));
  const keys = new Set<string>();
  const entries: PersonalCatalogEntry[] = [];
  for (const [index, value] of document.types.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`ชนิดลำดับ ${index + 1} มีโครงสร้างไม่ถูกต้อง`);
    const type = value as Record<string, unknown>;
    const name = typeof type.name === "string" ? type.name.trim() : "";
    const object_type = typeof type.object_type === "string" ? type.object_type : "";
    const parameters = type.parameters;
    if (!name || name.length > 100)
      throw new Error(`ชนิดลำดับ ${index + 1} ต้องมีชื่อไม่เกิน 100 ตัวอักษร`);
    if (!families.has(object_type))
      throw new Error(`ชนิด “${name}” ใช้ family ที่ไม่รองรับ`);
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters))
      throw new Error(`พารามิเตอร์ของชนิด “${name}” ไม่ถูกต้อง`);
    const key = `${object_type}\u0000${name.toLocaleLowerCase()}`;
    if (keys.has(key)) throw new Error(`ไฟล์มีชนิด “${name}” ซ้ำใน family เดียวกัน`);
    keys.add(key);
    entries.push({
      id: crypto.randomUUID(),
      sourceTypeId: `import:${crypto.randomUUID()}`,
      name,
      object_type,
      parameters: structuredClone(parameters) as TypeParameters,
    });
  }

  const candidate = structuredClone(project);
  candidate.types.push(...entries.map((entry, index) => ({
    id: crypto.randomUUID(),
    name: `__library_import_validation_${index}`,
    object_type: entry.object_type,
    parameters: entry.parameters,
  })));
  try {
    validateProjectV2(candidate);
  } catch (error) {
    throw new Error(`ไฟล์มีชนิดที่ไม่ผ่านการตรวจสอบ: ${error instanceof Error ? error.message : String(error)}`);
  }
  return entries;
}
function loadPreferences(): Preferences {
  try {
    const p = JSON.parse(
      localStorage.getItem("cf-catalog-preferences") ?? "{}",
    );
    return {
      favorites: Array.isArray(p.favorites)
        ? p.favorites.filter((v: unknown) => typeof v === "string")
        : [],
      recent: Array.isArray(p.recent)
        ? p.recent.filter((v: unknown) => typeof v === "string")
        : [],
    };
  } catch {
    return { favorites: [], recent: [] };
  }
}
const basic: Record<string, string[]> = {
  "structure.column": ["section_mm", "plaster_thickness_mm"],
  "structure.beam": ["section_mm", "plaster_thickness_mm", "drop_mm"],
  "structure.foundation": ["size_mm", "foundation_type"],
  "structure.slab": ["thickness_mm", "topping_mm", "slab_system", "slope_ratio", "drain_direction_deg", "finish_layers", "finish_pattern_mm"],
  "roof.system": ["framing_system", "rafter_spacing_mm", "purlin_spacing_mm", "truss_spacing_mm", "rafter_section_mm", "purlin_section_mm", "truss_chord_section_mm", "truss_web_section_mm", "truss_depth_mm", "framing_material"],
  "architecture.floor": ["thickness_mm", "finish_layers", "finish_pattern_mm", "finish_pattern_origin_mm", "finish_pattern_rotation_deg"],
  "architecture.ceiling": ["thickness_mm", "grid_mm"],
  "architecture.wall": [
    "wall_system",
    "masonry_thickness_mm",
    "plaster_inside_thickness_mm",
    "plaster_outside_thickness_mm",
    "plaster_inside_material",
    "plaster_outside_material",
    "height_mm",
  ],
  "door_window.door": ["width_mm", "height_mm", "frame_depth_mm", "frame_face_width_mm", "sash_face_width_mm", "door_leaf_thickness_mm"],
  "door_window.window": ["width_mm", "height_mm", "sill_height_mm", "frame_depth_mm", "frame_face_width_mm", "sash_face_width_mm"],
};
const defaults: Record<string, TypeParameters> = {
  "structure.column": { section_mm: [200, 200], plaster_thickness_mm: 15 },
  "structure.beam": { section_mm: [200, 400], plaster_thickness_mm: 15, drop_mm: 0 },
  "structure.foundation": {
    size_mm: [800, 800, 300],
    foundation_type: "spread_footing",
  },
  "structure.slab": {
    thickness_mm: 120,
    topping_mm: 0,
    slab_system: "slab_on_ground",
    material: "reinforced_concrete",
    slope_ratio: 0,
    drain_direction_deg: 0,
    finish_layers: [],
    finish_pattern_mm: [600, 600],
  },
  "roof.system": {
    framing_system: "rafter_purlin",
    rafter_spacing_mm: 1000,
    purlin_spacing_mm: 1000,
    truss_spacing_mm: 1200,
    rafter_section_mm: [50, 100],
    purlin_section_mm: [45, 75],
    truss_chord_section_mm: [50, 100],
    truss_web_section_mm: [40, 40],
    truss_depth_mm: 500,
    framing_material: "steel",
  },
  "architecture.floor": {
    thickness_mm: 50,
    finish_layers: [{ mark: "Tile", material: "porcelain_tile", thickness_mm: 10, quantity_unit: "m2" }],
    finish_pattern_mm: [600, 600],
    finish_pattern_origin_mm: [0, 0],
    finish_pattern_rotation_deg: 0,
  },
  "architecture.ceiling": { thickness_mm: 12, material: "gypsum_board", grid_mm: [600, 600] },
  "architecture.wall": {
    wall_system: "masonry",
    masonry_thickness_mm: 70,
    plaster_inside_thickness_mm: 15,
    plaster_outside_thickness_mm: 15,
    plaster_inside_material: "cement_plaster",
    plaster_outside_material: "cement_plaster",
    height_mm: 2800,
  },
  "door_window.door": {
    width_mm: 900,
    height_mm: 2000,
    frame_depth_mm: 100,
    frame_face_width_mm: 50,
    sash_face_width_mm: 50,
    door_leaf_thickness_mm: 50,
    opening_operation: "hinged",
    panel_count: 1,
    panel_layout: ["hinged"],
    panel_width_ratios: [1],
    frame_material: "timber",
    panel_material: "timber",
    door_leaf_style: "raised_2_panel",
    opening_handle_style: "lever",
    opening_hardware_finish: "stainless",
    glazing_material: "none",
    transom_height_mm: 0,
    muntin_rows: 1,
    muntin_columns: 1,
  },
  "door_window.window": {
    width_mm: 1200,
    height_mm: 1200,
    sill_height_mm: 900,
    frame_depth_mm: 100,
    frame_face_width_mm: 50,
    sash_face_width_mm: 50,
    opening_operation: "sliding",
    panel_count: 2,
    panel_layout: ["sliding", "sliding"],
    panel_width_ratios: [0.5, 0.5],
    frame_material: "aluminium",
    opening_handle_style: "recessed_pull",
    opening_hardware_finish: "stainless",
    glazing_material: "clear_glass",
    transom_height_mm: 0,
    bottom_light_height_mm: 0,
    muntin_rows: 1,
    muntin_columns: 1,
  },
};
export function TypeManagerModal(props: Props) {
  return props.isOpen ? <CatalogDialog {...props} /> : null;
}
function CatalogDialog({
  project,
  onClose,
  initialFamily,
  initialTypeId,
  editInitially,
  selectionIntent,
  selectionFamily,
  selectedObjectId,
  onChoose,
  onExecute,
  onRenamed,
}: Props) {
  const personalCatalogFileInput = useRef<HTMLInputElement>(null);
  const displayUnit = project.project.display_unit ?? "m";
  const initial = project.types.find((t) => t.id === initialTypeId);
  const [family, setFamily] = useState(
    initial?.object_type ?? initialFamily ?? "structure.column",
  );
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState(initial?.id ?? "");
  const [collection, setCollection] = useState("all");
  const [personalCatalog, setPersonalCatalog] = useState(loadPersonalCatalog);
  const collections = { modern: "โมเดิร์น", classic: "คลาสสิก", natural: "อบอุ่นลายไม้", utility: "ใช้งานทั่วไป" };
  const designs = OPENING_DESIGNS.filter(d => d.object_type === family
    && (collection === "all" || d.collection === collection)
    && `${d.name} ${d.key} ${d.description} ${collections[d.collection]}`.toLowerCase().includes(query.trim().toLowerCase()));
  const [preferences, setPreferences] = useState(loadPreferences);
  const makeEditor = (type: TypeDefinition, creating = false): Editor => {
    const parameters = structuredClone({
      ...defaults[type.object_type],
      ...type.parameters,
    });
    if (type.object_type === "architecture.wall")
      parameters.masonry_thickness_mm =
        type.parameters.masonry_thickness_mm ??
        type.parameters.thickness_mm ??
        100;
    if (type.object_type.startsWith("door_window.")) {
      const count = parameters.panel_count ?? 1,
        operation = parameters.opening_operation ?? "hinged";
      parameters.panel_layout =
        type.parameters.panel_layout?.length === count
          ? structuredClone(type.parameters.panel_layout)
          : Array.from({ length: count }, () => operation);
      parameters.panel_width_ratios =
        type.parameters.panel_width_ratios?.length === count
          ? [...type.parameters.panel_width_ratios]
          : Array.from({ length: count }, () => 1 / count);
      parameters.opening_handle_style ??= parameters.panel_layout.includes("sliding") ? "recessed_pull" : "lever";
      parameters.opening_hardware_finish ??= "stainless";
      if (type.object_type.endsWith(".door")) parameters.door_leaf_style ??= parameters.panel_layout.includes("louver") ? "louvered" : "raised_2_panel";
    }
    return {
      source: type,
      family: type.object_type,
      name: creating ? `${type.name}-ใหม่` : type.name,
      parameters,
      creating,
    };
  };
  const [editor, setEditor] = useState<Editor | null>(
    initial && editInitially ? makeEditor(initial) : null,
  );
  const [assignNew, setAssignNew] = useState(false);
  const [selectedPart, setSelectedPart] = useState<OpeningPreviewPart>("all");
  const [panelsExpanded, setPanelsExpanded] = useState(false);
  const partFields = useRef<
    Partial<Record<OpeningPreviewPart, HTMLElement | null>>
  >({});
  const selectPart = (part: OpeningPreviewPart) => {
    setSelectedPart(part);
    if (part.startsWith("leaf-")) setPanelsExpanded(true);
    requestAnimationFrame(() => {
      const target = partFields.current[part];
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target
        ?.querySelector<HTMLElement>("input, select")
        ?.focus({ preventScroll: true });
    });
  };
  const [baseline, setBaseline] = useState(
    initial && editInitially ? JSON.stringify(makeEditor(initial)) : "",
  );
  const [pending, setPending] = useState<null | (() => void)>(null),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState("");
  const dirty = editor !== null && JSON.stringify(editor) !== baseline;
  const guard = (action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  };
  useEffect(() => {
    try {
      localStorage.setItem(
        "cf-catalog-preferences",
        JSON.stringify(preferences),
      );
    } catch {
      /* optional UI preferences */
    }
  }, [preferences]);
  useEffect(() => {
    try {
      localStorage.setItem(PERSONAL_CATALOG_KEY, JSON.stringify(personalCatalog));
    } catch {
      setError("บันทึกคลังส่วนตัวไม่ได้ พื้นที่จัดเก็บของเบราว์เซอร์อาจเต็มหรือถูกปิดใช้งาน");
    }
  }, [personalCatalog]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const object of Object.values(project.objects)) {
      const d = object.module_data as Record<string, unknown>;
      const t = project.types.find(
        (t) =>
          t.object_type === object.object_type &&
          (t.id === d.type_id || (!d.type_id && t.name === d.mark)),
      );
      if (t) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    }
    return counts;
  }, [project]);
  const personalTypes: TypeDefinition[] = personalCatalog.map((entry) => ({
    id: `personal:${entry.id}`,
    name: entry.name,
    object_type: entry.object_type,
    parameters: entry.parameters,
  }));
  const catalogSource = filter === "library" ? personalTypes : project.types;
  const items = catalogSource.filter(
    (t) =>
      filter !== "designs" &&
      t.object_type === family &&
      `${t.name} ${typeDescription(t)} ${typeSizeLabel(t, displayUnit)}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (filter === "used"
        ? !!usage.get(t.id)
        : filter === "favorites"
          ? preferences.favorites.includes(t.id)
            : filter === "recent"
            ? preferences.recent.includes(t.id)
            : true),
  );
  if (filter === "recent")
    items.sort(
      (a, b) =>
        preferences.recent.indexOf(a.id) - preferences.recent.indexOf(b.id),
    );
  const chosen = items.find((t) => t.id === selected) ?? items[0];
  const choose = (t: TypeDefinition) => {
    const next = {
      ...preferences,
      recent: [t.id, ...preferences.recent.filter((id) => id !== t.id)].slice(
        0,
        20,
      ),
    };
    try {
      localStorage.setItem("cf-catalog-preferences", JSON.stringify(next));
    } catch {}
    setPreferences(next);
    onChoose(t);
    onClose();
  };
  const saveToPersonalCatalog = (type: TypeDefinition) => {
    const source = project.types.find((entry) => entry.id === type.id);
    if (!source) return;
    setPersonalCatalog((current) => {
      const existing = current.find((entry) => entry.sourceTypeId === source.id);
      const entry: PersonalCatalogEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        sourceTypeId: source.id,
        name: source.name,
        object_type: source.object_type,
        parameters: structuredClone(source.parameters),
      };
      return existing
        ? current.map((candidate) => candidate.id === existing.id ? entry : candidate)
        : [...current, entry];
    });
    setFeedback(`บันทึก ${type.name} ลงคลังส่วนตัวแล้ว`);
    setError("");
  };
  const removeFromPersonalCatalog = (type: TypeDefinition) => {
    const entryId = type.id.replace(/^personal:/, "");
    setPersonalCatalog((current) => current.filter((entry) => entry.id !== entryId));
    setSelected("");
    setFeedback(`ลบ ${type.name} ออกจากคลังส่วนตัวแล้ว`);
  };
  const importPersonalType = (type: TypeDefinition) => {
    const nameBase = type.name;
    let name = nameBase;
    let suffix = 2;
    while (project.types.some((entry) => entry.object_type === type.object_type && entry.name.toLowerCase() === name.toLowerCase()))
      name = `${nameBase}-${suffix++}`;
    const id = crypto.randomUUID();
    const result = onExecute([{
      name: "DefineStructuralType",
      input: { id, name, object_type: type.object_type, parameters: structuredClone(type.parameters) },
    }]);
    if (result.status !== "success") {
      setError((result.errors ?? []).join("\n") || "เพิ่มชนิดจากคลังส่วนตัวไม่สำเร็จ");
      return;
    }
    const imported = result.updatedProject.types.find((entry) => entry.id === id);
    if (imported) choose(imported);
  };
  const exportPersonalCatalog = () => {
    const content = JSON.stringify({
      format: PERSONAL_CATALOG_FILE_FORMAT,
      format_version: PERSONAL_CATALOG_FILE_VERSION,
      exported_at: new Date().toISOString(),
      types: personalCatalog.map(({ name, object_type, parameters }) => ({
        name, object_type, parameters,
      })),
    }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "constructflow-type-library.cflib";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback(`ส่งออกคลังส่วนตัว ${personalCatalog.length} ชนิดแล้ว`);
    setError("");
  };
  const importPersonalCatalog = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > PERSONAL_CATALOG_FILE_LIMIT)
        throw new Error("ไฟล์คลังชนิดมีขนาดเกิน 2 MB");
      const entries = parsePersonalCatalogFile(await file.text(), project);
      if (!entries.length) throw new Error("ไฟล์คลังชนิดไม่มีรายการให้เพิ่ม");
      const merged = [...personalCatalog];
      let added = 0;
      let updated = 0;
      for (const entry of entries) {
        const index = merged.findIndex((existing) =>
          existing.object_type === entry.object_type && existing.name.toLocaleLowerCase() === entry.name.toLocaleLowerCase(),
        );
        if (index >= 0) {
          merged[index] = { ...entry, id: merged[index].id, sourceTypeId: merged[index].sourceTypeId };
          updated++;
        } else {
          merged.push(entry);
          added++;
        }
      }
      setPersonalCatalog(merged);
      setFamily(entries[0].object_type);
      setFilter("library");
      setSelected("");
      setFeedback(`นำเข้าคลังชนิดแล้ว · เพิ่ม ${added} · อัปเดต ${updated}`);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (personalCatalogFileInput.current) personalCatalogFileInput.current.value = "";
    }
  };
  const openEditor = (next: Editor) => {
    setSelectedPart("all");
    setPanelsExpanded(new Set(next.parameters.panel_layout).size > 1);
    setAssignNew(false);
    setEditor(next);
    setBaseline(JSON.stringify(next));
    setError("");
    setFeedback("");
  };
  const change = (key: string, value: unknown) =>
    setEditor((e) =>
      e ? { ...e, parameters: { ...e.parameters, [key]: value } } : e,
    );
  const field = (key: string) => (
    <CatalogField
      key={key}
      name={key}
      value={editor!.parameters[key] ?? defaults[editor!.family]?.[key] ?? 0}
      displayUnit={project.project.display_unit ?? 'm'}
      onChange={(value) => change(key, value)}
    />
  );
  const save = () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      setError("กรุณาระบุรหัสชนิด");
      return;
    }
    const commands: CommandRequest[] = [],
      parameters = { ...editor.parameters };
    // Domain command resolves wall total from the edited layer values.
    if (
      editor.family === "architecture.wall" &&
      parameters.masonry_thickness_mm !== undefined
    )
      delete parameters.thickness_mm;
    if (editor.creating) {
      const id = crypto.randomUUID();
      commands.push({
        name: "DefineStructuralType",
        input: { id, name, object_type: editor.family, parameters },
      });
      if (assignNew && selectedObjectId)
        commands.push({
          name: "AssignInstanceType",
          input: { object_id: selectedObjectId, type_id: id },
        });
    } else {
      if (name !== editor.source!.name)
        commands.push({
          name: "RenameCatalogType",
          input: { type_id: editor.source!.id, name },
        });
      commands.push({
        name: "UpdateStructuralTypeDimensions",
        input: {
          type_id_or_name: editor.source!.id,
          object_type: editor.family,
          parameters,
        },
      });
    }
    try {
      const result = onExecute(commands);
      if (result.status !== "success") {
        const message = (result.errors ?? []).join("\n");
        setError(
          message.includes("fixed lights")
            ? "ช่องแสงบนและล่างสูงเกินไป กรุณาลดขนาดให้เหลือพื้นที่สำหรับบานหลัก"
            : message || "บันทึกไม่สำเร็จ กรุณาตรวจค่าที่กรอก",
        );
        if (message.includes("fixed lights"))
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLInputElement>('[aria-label="ช่องแสงบน (มม.)"]')
              ?.focus();
          });
        return;
      }
      if (!editor.creating && name !== editor.source!.name)
        onRenamed(editor.source!, name);
      setEditor(null);
      setBaseline("");
      setError("");
      setFamily(editor.family);
      setFilter("all");
      setQuery("");
      setFeedback(`บันทึก ${name} แล้ว · ปิดคลังแล้วกด Ctrl+Z เพื่อย้อนกลับ`);
      const t = result.updatedProject.types.find(
        (t) => t.object_type === editor.family && t.name === name,
      );
      if (t) setSelected(t.id);
    } catch (e) {
      setError(String(e));
    }
  };
  const opening = editor?.family.startsWith("door_window."),
    p = editor?.parameters ?? {},
    count = p.panel_count ?? 1;
  const layout =
      p.panel_layout ??
      Array.from({ length: count }, () => p.opening_operation ?? "sliding"),
    ratios =
      p.panel_width_ratios ?? Array.from({ length: count }, () => 1 / count);
  const handled = new Set([
    ...(basic[editor?.family ?? ""] ?? []),
    "opening_operation",
    "panel_count",
    "panel_layout",
    "panel_width_ratios",
    "transom_height_mm",
    "bottom_light_height_mm",
    "muntin_rows",
    "muntin_columns",
    "transom_muntin_rows",
    "transom_muntin_columns",
    "bottom_light_muntin_rows",
    "bottom_light_muntin_columns",
    "door_leaf_style",
    "door_face_components",
    "opening_handle_style",
    "opening_hardware_finish",
  ]);
  const materials = [
    "material",
    "frame_material",
    "panel_material",
    "glazing_material",
    "plaster_inside_material",
    "plaster_outside_material",
    "framing_material",
  ];
  const canChoose = (type: TypeDefinition) =>
    selectionIntent === "assign"
      ? type.object_type === selectionFamily
      : Object.values(TOOL_FAMILIES).includes(type.object_type);
  const preview: TypeDefinition = {
    id: "preview",
    name: editor?.name ?? "",
    object_type: editor?.family ?? "",
    parameters: p,
  };
  return (
    <Dialog
      title={
        editor
          ? editor.creating
            ? "สร้างชนิดใหม่"
            : `แก้ไขชนิด ${editor.source?.name}`
          : "คลังชนิด"
      }
      subtitle={
        editor
          ? "ปรับค่าตัวอย่าง แล้วบันทึกเมื่อพร้อม"
          : "เลือกแบบที่ต้องการ แล้วนำไปวาดหรือปรับรายละเอียด"
      }
      onClose={() => guard(onClose)}
      className="cf-catalog-dialog"
    >
      {pending && (
        <div className="cf-draft-warning" role="alert">
          มีการแก้ไขที่ยังไม่ได้บันทึก
          <button
            className="cf-button cf-button-quiet"
            onClick={() => setPending(null)}
          >
            กลับไปแก้ต่อ
          </button>
          <button
            className="cf-button"
            onClick={() => {
              const action = pending;
              setPending(null);
              action();
            }}
          >
            ทิ้งการแก้ไข
          </button>
        </div>
      )}
      {editor ? (
        <>
          <div className="cf-type-editor">
            <div className="cf-editor-form">
              <button
                className="cf-button"
                onClick={() =>
                  guard(() => {
                    setEditor(null);
                    setError("");
                  })
                }
              >
                <ArrowLeft size={16} /> กลับคลังชนิด
              </button>
              <div className="cf-form-section">
                <h3>ขนาดและรูปแบบ</h3>
                <label className="cf-field">
                  <span>รหัสชนิด</span>
                  <input
                    autoFocus
                    required
                    value={editor.name}
                    onChange={(e) =>
                      setEditor({ ...editor, name: e.target.value })
                    }
                  />
                </label>
                <div className="cf-field-grid">
                  {(basic[editor.family] ?? []).map(field)}
                </div>
              </div>
              {opening && (
                <div className="cf-form-section">
                  <h3>บานหลัก</h3>
                  <p className="cf-help">
                    เลือกวิธีเปิดและจำนวนบานก่อน
                    แล้วเพิ่มช่องแสงหรือลูกฟักแยกได้กับทุกวิธีเปิด
                  </p>
                  <div className="cf-field-grid">
                    <label className="cf-field">
                      <span>วิธีเปิดทุกบาน</span>
                      <select
                        aria-label="วิธีเปิดทุกบาน"
                        value={
                          new Set(layout).size > 1
                            ? "mixed"
                            : (layout[0] ?? p.opening_operation ?? "sliding")
                        }
                        onChange={(e) => {
                          const op = e.target.value as NonNullable<
                            TypeParameters["opening_operation"]
                          >;
                          setEditor({
                            ...editor,
                            parameters: {
                              ...p,
                              opening_operation: op,
                              panel_layout: Array.from(
                                { length: count },
                                () => op,
                              ),
                            },
                          });
                        }}
                      >
                        {new Set(layout).size > 1 && (
                          <option value="mixed" disabled>
                            กำหนดต่างกันรายบาน
                          </option>
                        )}
                        {Object.entries(OPERATION_LABELS)
                          .filter(([id]) => editor.family.endsWith(".door") || !["bifold", "pocket", "surface_sliding"].includes(id))
                          .map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                          ))}
                      </select>
                    </label>
                    <label className="cf-field">
                      <span>จำนวนบาน</span>
                      <select
                        aria-label="จำนวนบาน"
                        value={count}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setEditor({
                            ...editor,
                            parameters: {
                              ...p,
                              panel_count: n,
                              panel_layout: Array.from(
                                { length: n },
                                (_, i) =>
                                  layout[i] ?? p.opening_operation ?? "sliding",
                              ),
                              panel_width_ratios: Array.from(
                                { length: n },
                                () => 1 / n,
                              ),
                            },
                          });
                        }}
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <details
                    className="cf-form-section"
                    open={panelsExpanded}
                    onToggle={(event) =>
                      setPanelsExpanded(event.currentTarget.open)
                    }
                  >
                    <summary>ปรับแต่ละบาน · วิธีเปิดและสัดส่วน</summary>
                    {layout.map((op, i) => (
                      <div
                        className={`cf-panel-row${selectedPart === `leaf-${i}` ? " is-selected" : ""}`}
                        key={i}
                        ref={(element) => {
                          partFields.current[`leaf-${i}`] = element;
                        }}
                      >
                        <strong>บาน {i + 1}</strong>
                        <label className="cf-field">
                          <span>วิธีเปิด</span>
                          <select
                            aria-label={`วิธีเปิดบาน ${i + 1}`}
                            value={op}
                            onChange={(e) => {
                              const next = layout.map((value, index) =>
                                index === i
                                  ? (e.target.value as typeof op)
                                  : value,
                              );
                              setEditor({
                                ...editor,
                                parameters: {
                                  ...p,
                                  panel_layout: next,
                                  ...(count === 1
                                    ? { opening_operation: next[0] }
                                    : {}),
                                },
                              });
                            }}
                          >
                            {Object.entries(OPERATION_LABELS)
                              .filter(([id]) => editor.family.endsWith(".door") || !["bifold", "pocket", "surface_sliding"].includes(id))
                              .map(([id, label]) => (
                                <option key={id} value={id}>
                                  {label}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className="cf-field">
                          <span>สัดส่วนกว้าง (%)</span>
                          <input
                            aria-label={`สัดส่วนบาน ${i + 1}`}
                            type="number"
                            min={10}
                            max={100 - 10 * (count - 1)}
                            disabled={count === 1}
                            value={Math.round((ratios[i] ?? 1 / count) * 100)}
                            onChange={(e) => {
                              const v = Number(e.target.value) / 100;
                              change(
                                "panel_width_ratios",
                                Array.from({ length: count }, (_, j) =>
                                  j === i ? v : (1 - v) / (count - 1),
                                ),
                              );
                            }}
                          />
                        </label>
                      </div>
                    ))}
                    <p className="cf-help">
                      สัดส่วนบานที่เหลือปรับให้รวมเป็น 100% โดยอัตโนมัติ
                    </p>
                  </details>
                  <section className="cf-form-section">
                    <h3>ช่องแสง · เพิ่มได้ทุกวิธีเปิด</h3>
                    <p className="cf-help">
                      กรอกความสูงช่องแสงแยกจากบานหลัก · 0 = ไม่มี ·
                      ปัจจุบันเป็นช่องแสงคงที่
                    </p>
                    <div className="cf-field-grid">
                      {[
                        "transom_height_mm",
                        ...(editor.family.endsWith(".window")
                          ? ["bottom_light_height_mm"]
                          : []),
                      ].map((key) => (
                        <div
                          key={key}
                          className={
                            selectedPart ===
                            (key === "transom_height_mm"
                              ? "transom"
                              : "bottom_light")
                              ? "cf-selected-field"
                              : undefined
                          }
                          ref={(element) => {
                            partFields.current[
                              key === "transom_height_mm"
                                ? "transom"
                                : "bottom_light"
                            ] = element;
                          }}
                        >
                          {field(key)}
                        </div>
                      ))}
                    </div>
                    <p className="cf-help">
                      ความสูงรวมคงเดิม: เพิ่มช่องแสงจะลดความสูงส่วนบาน
                      รวมกรอบของส่วนนั้น
                    </p>
                  </section>
                  {[
                    ["", "ลูกฟักตัวบาน · จำนวนเส้นต่อบาน", true],
                    [
                      "transom_",
                      "ลูกฟักช่องแสงบน · ทั้งช่อง",
                      Number(p.transom_height_mm) > 0,
                    ],
                    [
                      "bottom_light_",
                      "ลูกฟักช่องแสงล่าง · ทั้งช่อง",
                      Number(p.bottom_light_height_mm) > 0,
                    ],
                  ]
                    .filter(([, , visible]) => visible)
                    .map(([prefix, title]) => (
                      <section className="cf-form-section" key={String(prefix)}>
                        <h3>{title}</h3>
                        <div className="cf-field-grid">
                          {(["rows", "columns"] as const).map((axis) => {
                            const key = `${prefix}muntin_${axis}`;
                            const label = `${title} · ${axis === "rows" ? "แนวนอน" : "แนวตั้ง"} (เส้น)`;
                            return (
                              <label className="cf-field" key={key}>
                                <span>
                                  {axis === "rows" ? "แนวนอน" : "แนวตั้ง"}{" "}
                                  (เส้น)
                                </span>
                                <input
                                  aria-label={label}
                                  type="number"
                                  min={0}
                                  max={7}
                                  step={1}
                                  value={Number(p[key] ?? 1) - 1}
                                  onChange={(event) =>
                                    change(key, Number(event.target.value) + 1)
                                  }
                                />
                              </label>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  <p className="cf-help">
                    0 = ไม่มีเส้นลูกฟัก · 1 เส้นแนวตั้ง = แบ่งครึ่งแต่ละบาน
                    ไม่รวมเสากลางหรือวงกบ · ช่องแสงบน/ล่างตั้งค่าแยกจากตัวบาน
                  </p>
                </div>
              )}
              {editor.creating &&
                selectedObjectId &&
                editor.family === selectionFamily && (
                  <label className="cf-field">
                    <span>
                      <input
                        type="checkbox"
                        checked={assignNew}
                        onChange={(e) => setAssignNew(e.target.checked)}
                      />{" "}
                      ใช้ชนิดใหม่กับชิ้นที่เลือกเมื่อบันทึก
                    </span>
                  </label>
                )}
              {opening && <details className="cf-form-section">
                <summary>{editor.family.endsWith(".door") ? "หน้าบานและมือจับ" : "มือจับหน้าต่าง"}</summary>
                <p className="cf-help">แยกเลือกลายหน้าบานจากลูกฟักกระจกและวิธีเปิด · ตัวอย่างมือจับเพื่อแสดงแบบ ไม่ใช่รหัสสินค้า</p>
                <div className="cf-field-grid">
                  {editor.family.endsWith(".door") && p.glazing_material === "none" && layout.some(operation => operation !== "louver") && field("door_leaf_style")}
                  {(p.panel_layout ?? [p.opening_operation]).some((operation) => ["hinged", "sliding", "awning", "louver"].includes(String(operation))) && <>
                    {field("opening_handle_style")}
                    {field("opening_hardware_finish")}
                  </>}
                </div>
                {editor.family.endsWith(".door") && p.glazing_material === "none" && layout.some(operation => operation !== "louver") && <div className="cf-face-designs">
                  <span className="cf-field-label">ชุดลายประกอบหน้าบาน</span>
                  <div className="cf-face-design-grid">
                    {DOOR_FACE_DESIGNS.map(recipe => <button type="button" key={recipe.key} className={`cf-face-design ${p.door_face_components?.some((component) => component.id === recipe.components[0]?.id) ? "is-active" : ""}`} onClick={() => change("door_face_components", structuredClone(recipe.components))}>
                      <span className="cf-face-mini" aria-hidden="true"><span className={`cf-face-mini-shape face-${recipe.key}`} /></span>
                      <strong>{recipe.name}</strong>
                    </button>)}
                  </div>
                  <p className="cf-help">เลือกชุดลายแล้วปรับขนาดบานต่อได้ · คิ้วโค้งและวงรีเป็นรายละเอียดนำเสนอ ยังไม่ใช่ขนาดผลิต</p>
                </div>}
              </details>}
              <details className="cf-form-section" open>
                <summary>วัสดุ</summary>
                <div className="cf-field-grid">
                  {materials
                    .filter(
                      (key) =>
                        p[key] !== undefined ||
                        (opening &&
                          [
                            "frame_material",
                            "glazing_material",
                            ...(editor.family.endsWith(".door")
                              ? ["panel_material"]
                              : []),
                          ].includes(key)),
                    )
                    .map(field)}
                </div>
              </details>
              <details className="cf-form-section">
                <summary>รายละเอียดเพิ่มเติม</summary>
                {editor.family === "structure.beam" && !p.rebar_type && (
                  <button
                    type="button"
                    className="cf-button cf-button-quiet"
                    onClick={() => {
                      const bar = {
                        grade: "SD40",
                        diameter_mm: 12,
                        cover_mm: 30,
                        count: 2,
                        bend_radius_mm: 24,
                        hook_angle_deg: 0,
                        hook_extension_mm: 0,
                        lap_mm: 0,
                        legs_mm: [],
                        spacing_zones: [],
                      };
                      change("rebar_type", {
                        top: { ...bar },
                        bottom: { ...bar },
                        stirrups: {
                          ...bar,
                          grade: "SR24",
                          diameter_mm: 6,
                          bend_radius_mm: 12,
                          hook_angle_deg: 135,
                          hook_extension_mm: 60,
                          spacing_zones: [
                            {
                              start_ratio: 0,
                              end_ratio: 0.25,
                              spacing_mm: 100,
                            },
                            {
                              start_ratio: 0.25,
                              end_ratio: 0.75,
                              spacing_mm: 150,
                            },
                            {
                              start_ratio: 0.75,
                              end_ratio: 1,
                              spacing_mm: 100,
                            },
                          ],
                        },
                      });
                    }}
                  >
                    เพิ่มข้อมูลเหล็กเสริม
                  </button>
                )}
                <div className="cf-field-grid">
                  {Object.keys(p)
                    .filter(
                      (key) =>
                        !handled.has(key) &&
                        !materials.includes(key) &&
                        !(
                          editor.family === "architecture.wall" &&
                          key === "thickness_mm"
                        ),
                    )
                    .map(field)}
                </div>
              </details>
            </div>
            <aside className="cf-editor-preview">
              <span className="cf-eyebrow">ตัวอย่างรูปแบบ 2D</span>
              {opening && (
                <p className="cf-help">
                  คลิกบานหรือช่องแสงในภาพเพื่อไปยังช่องตั้งค่า
                </p>
              )}
              <TypeThumbnail
                type={preview}
                showDimensions={!!opening}
                selectedPart={selectedPart}
                onSelectPart={opening ? selectPart : undefined}
              />
              {opening && (
                <div style={{ marginTop: 8 }}>
                  <span className="cf-eyebrow" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>รูปด้านมาตรฐาน (Elevation Linework)</span>
                  <OpeningElevationThumbnail
                    shape={buildOpeningRepresentationShapeFromType(preview.object_type, preview.parameters)}
                    widthPx={200}
                    heightPx={130}
                  />
                </div>
              )}
              <h3>{typeDescription(preview)}</h3>
              <p>{typeSizeLabel(preview, displayUnit)}</p>
              <p className="cf-help">
                {opening
                  ? "เส้นวัดเป็นขนาดรวมและส่วนแบ่งรวมกรอบ ไม่ใช่ระยะเปิดสุทธิ · ใช้กับโมเดลเมื่อบันทึก"
                  : "ภาพแสดงรูปแบบโดยสังเขป ใช้กับโมเดลเมื่อบันทึก"}
              </p>
            </aside>
          </div>
          <footer className="cf-dialog-footer">
            <div>
              {error ? (
                <p className="cf-error" role="alert">
                  {error}
                </p>
              ) : (
                <p>
                  {editor.creating
                    ? "สร้างชนิดใหม่ · ชิ้นงานเดิมยังใช้ชนิดเดิม"
                    : `ชนิดนี้ใช้กับ ${usage.get(editor.source!.id) ?? 0} ชิ้น — บันทึกแล้วอัปเดตทุกชิ้น`}
                </p>
              )}
            </div>
            <button
              className="cf-button cf-button-quiet"
              onClick={() =>
                guard(() => {
                  setEditor(null);
                  setError("");
                })
              }
            >
              ยกเลิก
            </button>
            <button className="cf-button cf-button-primary" onClick={save}>
              <Check size={16} />
              {editor.creating ? "สร้างชนิด" : "บันทึกชนิด"}
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="cf-catalog-body">
            <nav className="cf-catalog-categories" aria-label="หมวดชนิด">
              {CATALOG_FAMILIES.map(([id, label]) => (
                <button
                  key={id}
                  className={family === id ? "is-active" : ""}
                  onClick={() => {
                    setFamily(id);
                    setSelected("");
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  {label}
                  <span>
                    {project.types.filter((t) => t.object_type === id).length}
                  </span>
                </button>
              ))}
            </nav>
            <div className="cf-catalog-main">
              <div className="cf-catalog-toolbar">
                <input
                  ref={personalCatalogFileInput}
                  type="file"
                  accept=".cflib,.json,application/json"
                  aria-label="เลือกไฟล์คลังชนิด"
                  className="cf-visually-hidden"
                  onChange={(event) => { void importPersonalCatalog(event.currentTarget.files?.[0]); }}
                />
                <label className="cf-search">
                  <Search size={17} />
                  <input
                    autoFocus
                    aria-label="ค้นหาชนิด"
                    placeholder="ค้นหาชื่อ รหัส หรือรูปแบบ…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="cf-catalog-library-tools">
                  <button className="cf-button cf-button-quiet" aria-label="นำเข้าคลังชนิดจากไฟล์" onClick={() => personalCatalogFileInput.current?.click()}>
                    <Upload size={15} /> นำเข้า
                  </button>
                  <button className="cf-button cf-button-quiet" aria-label="ส่งออกคลังส่วนตัว" disabled={!personalCatalog.length} onClick={exportPersonalCatalog}>
                    <Download size={15} /> ส่งออก
                  </button>
                </div>
                <button
                  className="cf-button cf-button-primary"
                  onClick={() =>
                    openEditor({
                      source: null,
                      family,
                      name: "",
                      parameters: structuredClone(defaults[family] ?? {}),
                      creating: true,
                    })
                  }
                >
                  <Plus size={16} />
                  สร้างใหม่
                </button>
              </div>
              <div className="cf-catalog-filters" aria-label="กรองชนิด">
                {[
                  ["all", "ทั้งหมด"],
                  ["used", "ใช้ในโครงการ"],
                  ["recent", "ล่าสุด"],
                  ["favorites", "รายการโปรด"],
                  ["library", `คลังส่วนตัว (${personalCatalog.length})`],
                  ...(family.startsWith("door_window.") ? [["designs", "แบบสำเร็จรูป · เลือกสไตล์"]] : []),
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={filter === id}
                    className={filter === id ? "is-active" : ""}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {feedback && (
                <p role="status" className="cf-success">
                  {feedback}
                </p>
              )}
              {error && (
                <p role="alert" className="cf-error">
                  {error}
                </p>
              )}
              {filter === "designs" && <section className="cf-opening-designs" aria-label="แบบประตูและหน้าต่างสำเร็จรูป">
                <div className="cf-design-intro"><span className="cf-eyebrow">OPENING COLLECTION</span><h3>เลือกแบบที่เข้ากับบ้าน</h3><p>เลือกชุดบาน วงกบ และอุปกรณ์ แล้วปรับขนาดก่อนสร้างชนิดของคุณ</p></div>
                <div className="cf-catalog-filters" aria-label="สไตล์ประตูหน้าต่าง">
                  {[["all", "ทุกสไตล์"], ...Object.entries(collections)].map(([id, label]) => <button key={id} aria-pressed={collection === id} className={collection === id ? "is-active" : ""} onClick={() => setCollection(id)}>{label}</button>)}
                </div>
                <div className="cf-design-grid">{designs.map(design => <button key={design.key} className="cf-design-card" onClick={() => {
                  let name = design.key, suffix = 2;
                  while (project.types.some(t => t.object_type === family && t.name.toLowerCase() === name.toLowerCase())) name = `${design.key}-${suffix++}`;
                  openEditor({ source: null, family: design.object_type, name, parameters: structuredClone(design.parameters), creating: true });
                }}>
                  <div className="cf-design-art"><TypeThumbnail type={{ id: design.key, name: design.name, object_type: design.object_type, parameters: design.parameters }} /></div>
                  <span className="cf-eyebrow">{collections[design.collection]}</span><strong>{design.name}</strong><span>{design.description}</span>
                  <small>{((design.parameters.width_mm ?? 0) / 1000).toFixed(2)} × {((design.parameters.height_mm ?? 0) / 1000).toFixed(2)} ม. <b>ปรับแบบ →</b></small>
                </button>)}</div>
                {!designs.length && <p className="cf-empty-state">ไม่พบแบบในสไตล์หรือคำค้นนี้ ลองเลือกทุกสไตล์หรือล้างคำค้น</p>}
                <p className="cf-help">แบบตั้งต้นสำหรับออกแบบ · ปรับต่อได้ทุกชุด · อุปกรณ์เป็นรูปแบบทั่วไป ยังไม่ผูกกับรุ่นสินค้า</p>
              </section>}
              <div className="cf-type-grid">
                {items.map((type) => (
                  <article
                    key={type.id}
                    className={`cf-type-card ${chosen?.id === type.id ? "is-selected" : ""}`}
                  >
                    <button
                      className="cf-type-card-select"
                      aria-label={`เลือก ${type.name} ${typeDescription(type)}`}
                      aria-pressed={chosen?.id === type.id}
                      onClick={() => setSelected(type.id)}
                      onDoubleClick={() => {
                        if (filter !== "library" && canChoose(type)) choose(type);
                      }}
                    >
                      <TypeThumbnail type={type} />
                      <strong>{typeDescription(type)}</strong>
                      <span>
                        {type.name} · {typeSizeLabel(type, displayUnit)}
                      </span>
                      <small>ใช้ในแบบ {usage.get(type.id) ?? 0} ชิ้น</small>
                    </button>
                    <button
                      className="cf-favorite"
                      aria-label={`รายการโปรด ${type.name}`}
                      aria-pressed={preferences.favorites.includes(type.id)}
                      onClick={() =>
                        setPreferences((p) => ({
                          ...p,
                          favorites: p.favorites.includes(type.id)
                            ? p.favorites.filter((id) => id !== type.id)
                            : [...p.favorites, type.id],
                        }))
                      }
                    >
                      <Star
                        size={16}
                        fill={
                          preferences.favorites.includes(type.id)
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                    {filter === "library" ? (
                      <button className="cf-library-action" aria-label={`ลบ ${type.name} จากคลังส่วนตัว`} onClick={() => removeFromPersonalCatalog(type)}>
                        <Trash2 size={15} />
                      </button>
                    ) : (
                      <button
                        className="cf-library-action"
                        aria-label={`${personalCatalog.some((entry) => entry.sourceTypeId === type.id) ? "อัปเดต" : "บันทึก"} ${type.name} ลงคลังส่วนตัว`}
                        onClick={() => saveToPersonalCatalog(type)}
                      >
                        <BookmarkPlus size={15} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {!items.length && filter !== "designs" && (
                <div className="cf-empty-state">
                  <Search size={25} />
                  <h3>ไม่พบชนิดที่ตรงกัน</h3>
                  <p>ลองเปลี่ยนคำค้นหา ตัวกรอง หรือสร้างชนิดใหม่</p>
                  <button
                    className="cf-button cf-button-quiet"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    แสดงทั้งหมด
                  </button>
                </div>
              )}
            </div>
          </div>
          <footer className="cf-dialog-footer">
            <div>
              {chosen ? (
                <>
                  <strong>{chosen.name}</strong>
                  <p>
                    {typeSizeLabel(chosen, displayUnit)} · {filter === "library" ? "ยังไม่ได้นำเข้าโครงการ" : `ใช้ในแบบ ${usage.get(chosen.id) ?? 0} ชิ้น`}
                  </p>
                </>
              ) : (
                <p>เลือกชนิดเพื่อดูรายละเอียด</p>
              )}
            </div>
            <button
              disabled={!chosen}
              className="cf-button cf-button-quiet"
              onClick={() => chosen && openEditor(makeEditor(chosen, true))}
            >
              <Copy size={16} />
              สร้างจากชนิดนี้
            </button>
            <button
              disabled={!chosen || filter === "library"}
              className="cf-button cf-button-quiet"
              onClick={() => chosen && openEditor(makeEditor(chosen))}
            >
              <Pencil size={16} />
              แก้ไขชนิด
            </button>
            {chosen && filter === "library" && (
              <button className="cf-button cf-button-primary" onClick={() => importPersonalType(chosen)}>
                เพิ่มลงโครงการและเลือก
              </button>
            )}
            {chosen && filter !== "library" && canChoose(chosen) && (
              <button
                className="cf-button cf-button-primary"
                onClick={() => choose(chosen)}
              >
                {selectionIntent === "assign"
                  ? "ใช้กับชิ้นที่เลือก"
                  : "เลือกเพื่อวาด"}
              </button>
            )}
          </footer>
        </>
      )}
    </Dialog>
  );
}
