// ConstructFlow IFC 4.3 ADD2 Serializer (ISO 16739-1:2024 / ISO 10303-21 STEP)
// Standalone pure TypeScript implementation

import type { ProjectDocument, SmartObject, Phase } from "@constructflow/project-model";
import { uuidToIfcGuid } from "./ifcGuid.js";

export interface IfcExportOptions {
  projectName?: string;
  authorName?: string;
  organization?: string;
  siteName?: string;
}

export class IfcSerializer {
  private stepId: number = 1;
  private project: ProjectDocument;
  private options: IfcExportOptions;

  constructor(project: ProjectDocument, options: IfcExportOptions = {}) {
    this.project = project;
    this.options = options;
  }

  private nextId(): number {
    return this.stepId++;
  }

  public serialize(): string {
    const lines: string[] = [];
    const timestamp = new Date().toISOString();

    // 1. STEP Header
    lines.push(
      "ISO-10303-21;",
      "HEADER;",
      "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1.0]'),'2;1');",
      `FILE_NAME('${this.project.project.id}.ifc','${timestamp}',('${this.options.authorName ?? "ConstructFlow User"}'),('${this.options.organization ?? "JiraNot ConstructFlow"}'),'ConstructFlow IFC Engine','ConstructFlow IFC4.3 Serializer','');`,
      "FILE_SCHEMA(('IFC4X3_ADD2'));",
      "ENDSEC;",
      "DATA;",
    );

    // 2. Units & System Context
    const idWorldPt = this.nextId();
    lines.push(`#${idWorldPt}=IFCCARTESIANPOINT((0.,0.,0.));`);

    const idAxisZ = this.nextId();
    lines.push(`#${idAxisZ}=IFCDIRECTION((0.,0.,1.));`);

    const idAxisX = this.nextId();
    lines.push(`#${idAxisX}=IFCDIRECTION((1.,0.,0.));`);

    const idWorldAxis = this.nextId();
    lines.push(`#${idWorldAxis}=IFCAXIS2PLACEMENT3D(#${idWorldPt},#${idAxisZ},#${idAxisX});`);

    const idGeomContext = this.nextId();
    lines.push(
      `#${idGeomContext}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${idWorldAxis},#${idAxisZ});`,
    );

    const idSubContext = this.nextId();
    lines.push(
      `#${idSubContext}=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${idGeomContext},$,.MODEL_VIEW.,$);`,
    );

    // SI Units (Length in Metres, Area in Square Metres, Volume in Cubic Metres)
    const idUnitLength = this.nextId();
    lines.push(`#${idUnitLength}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);

    const idUnitArea = this.nextId();
    lines.push(`#${idUnitArea}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);

    const idUnitVolume = this.nextId();
    lines.push(`#${idUnitVolume}=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);`);

    const idUnitAngle = this.nextId();
    lines.push(`#${idUnitAngle}=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);`);

    const idUnitAssign = this.nextId();
    lines.push(
      `#${idUnitAssign}=IFCUNITASSIGNMENT((#${idUnitLength},#${idUnitArea},#${idUnitVolume},#${idUnitAngle}));`,
    );

    // 3. Project & Spatial Structure
    const projGuid = uuidToIfcGuid(this.project.project.id);
    const idProject = this.nextId();
    const projName = this.options.projectName ?? this.project.project.name ?? "ConstructFlow Project";
    lines.push(
      `#${idProject}=IFCPROJECT('${projGuid}',$,'${projName}',$,$,$,$,(#${idGeomContext}),#${idUnitAssign});`,
    );

    // Site
    const siteGuid = uuidToIfcGuid("site-" + this.project.project.id);
    const idSitePlacement = this.createLocalPlacement(lines, idWorldPt, idAxisZ, idAxisX);
    const idSite = this.nextId();
    lines.push(
      `#${idSite}=IFCSITE('${siteGuid}',$,'${this.options.siteName ?? "Bangkok Property Plot"}',$,$,#${idSitePlacement},$,$,.ELEMENT.,(13,45,0),(100,30,0),0.,$,$);`,
    );

    // Building
    const bldgGuid = uuidToIfcGuid("bldg-" + this.project.project.id);
    const idBldgPlacement = this.createLocalPlacement(lines, idWorldPt, idAxisZ, idAxisX, idSitePlacement);
    const idBuilding = this.nextId();
    lines.push(
      `#${idBuilding}=IFCBUILDING('${bldgGuid}',$,'Residential Extension',$,$,#${idBldgPlacement},$,$,.ELEMENT.,$,$,$);`,
    );

    // Building Storeys (Levels)
    const sortedLevels = [...this.project.levels].sort((a, b) => a.elevation_mm - b.elevation_mm);
    const levelMap = new Map<string, { storeyId: number; elevationM: number }>();
    const storeyIds: number[] = [];

    for (const lvl of sortedLevels) {
      const elevM = lvl.elevation_mm / 1000.0;
      const storeyGuid = uuidToIfcGuid(lvl.id);
      const ptElev = this.nextId();
      lines.push(`#${ptElev}=IFCCARTESIANPOINT((0.,0.,${elevM.toFixed(4)}));`);
      const placeStorey = this.createLocalPlacement(lines, ptElev, idAxisZ, idAxisX, idBldgPlacement);
      const idStorey = this.nextId();
      lines.push(
        `#${idStorey}=IFCBUILDINGSTOREY('${storeyGuid}',$,'${lvl.name}',$,$,#${placeStorey},$,$,.ELEMENT.,${elevM.toFixed(4)});`,
      );
      storeyIds.push(idStorey);
      levelMap.set(lvl.id, { storeyId: idStorey, elevationM: elevM });
    }

    // Default ground storey fallback
    const defaultStoreyId = storeyIds[0] ?? idBuilding;

    // RelAggregates Project -> Site
    const idRelProjSite = this.nextId();
    lines.push(`#${idRelProjSite}=IFCRELAGGREGATES('${uuidToIfcGuid("rel-proj-site")}',$,$,$,#${idProject},(#${idSite}));`);

    // RelAggregates Site -> Building
    const idRelSiteBldg = this.nextId();
    lines.push(`#${idRelSiteBldg}=IFCRELAGGREGATES('${uuidToIfcGuid("rel-site-bldg")}',$,$,$,#${idSite},(#${idBuilding}));`);

    // RelAggregates Building -> Storeys
    if (storeyIds.length > 0) {
      const idRelBldgStoreys = this.nextId();
      lines.push(
        `#${idRelBldgStoreys}=IFCRELAGGREGATES('${uuidToIfcGuid("rel-bldg-storeys")}',$,$,$,#${idBuilding},(${storeyIds.map((s) => `#${s}`).join(",")}));`,
      );
    }

    // 4. Smart Objects Conversion
    const storeyElements = new Map<number, number[]>();
    for (const sid of storeyIds) storeyElements.set(sid, []);
    if (!storeyElements.has(defaultStoreyId)) storeyElements.set(defaultStoreyId, []);

    for (const obj of Object.values(this.project.objects)) {
      const elemId = this.serializeSmartObject(lines, obj, idSubContext, idAxisZ, idAxisX);
      if (elemId) {
        const d = obj.module_data as Record<string, any>;
        const lvlId = d.level_id ?? d.base_level_id;
        const targetStorey = (lvlId && levelMap.get(lvlId)?.storeyId) ?? defaultStoreyId;
        const list = storeyElements.get(targetStorey) ?? [];
        list.push(elemId);
        storeyElements.set(targetStorey, list);
      }
    }

    // RelContainedInSpatialStructure per Storey
    for (const [sId, elements] of storeyElements.entries()) {
      if (elements.length > 0) {
        const relContainId = this.nextId();
        lines.push(
          `#${relContainId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${uuidToIfcGuid("rel-contain-" + sId)}',$,'Storey Elements',$,(${elements.map((e) => `#${e}`).join(",")}),#${sId});`,
        );
      }
    }

    lines.push("ENDSEC;", "END-ISO-10303-21;");
    return lines.join("\n") + "\n";
  }

  private serializeSmartObject(
    lines: string[],
    obj: SmartObject,
    subContextId: number,
    axisZ: number,
    axisX: number,
  ): number | null {
    const guid = uuidToIfcGuid(obj.id);
    const type = obj.object_type;
    const phase = obj.created_phase;
    const d = obj.module_data as Record<string, any>;

    // Coordinate conversions: mm -> meters
    const toM = (valMm: number) => (valMm / 1000.0).toFixed(4);

    let ifcClass = "IFCBUILDINGELEMENTPROXY";
    let predefinedType = "USERDEFINED";
    let shapeRepId: number | null = null;
    let placementId: number;

    if (type.startsWith("structure.column")) {
      ifcClass = "IFCCOLUMN";
      predefinedType = ".COLUMN.";
      const loc = d.location_mm ?? [0, 0, 0];
      const sec = d.section_mm ?? [200, 200];
      const hMm = d.height_mm ?? 3000;

      const locPt = this.nextId();
      lines.push(`#${locPt}=IFCCARTESIANPOINT((${toM(loc[0])},${toM(loc[1])},${toM(loc[2])}));`);
      placementId = this.createLocalPlacement(lines, locPt, axisZ, axisX);

      // Rectangular profile extruded solid
      const profileId = this.nextId();
      lines.push(
        `#${profileId}=IFCRECTANGLEPROFILEDEF(.AREA.,'${d.mark ?? "C1"}',$,${toM(sec[0])},${toM(sec[1])});`,
      );
      const solidId = this.nextId();
      lines.push(
        `#${solidId}=IFCEXTRUDEDAREASOLID(#${profileId},$,#${axisZ},${toM(hMm)});`,
      );
      shapeRepId = this.createShapeRepresentation(lines, subContextId, solidId);
    } else if (type.startsWith("structure.beam")) {
      ifcClass = "IFCBEAM";
      predefinedType = ".BEAM.";
      const sp = d.start_point_mm ?? [0, 0, 0];
      const ep = d.end_point_mm ?? [4000, 0, 0];
      const sec = d.section_mm ?? [200, 400];
      const spanMm = d.span_mm ?? Math.hypot(ep[0] - sp[0], ep[1] - sp[1]);

      const locPt = this.nextId();
      lines.push(`#${locPt}=IFCCARTESIANPOINT((${toM(sp[0])},${toM(sp[1])},${toM(sp[2])}));`);
      placementId = this.createLocalPlacement(lines, locPt, axisZ, axisX);

      const profileId = this.nextId();
      lines.push(
        `#${profileId}=IFCRECTANGLEPROFILEDEF(.AREA.,'${d.mark ?? "B1"}',$,${toM(sec[0])},${toM(sec[1])});`,
      );
      const solidId = this.nextId();
      lines.push(
        `#${solidId}=IFCEXTRUDEDAREASOLID(#${profileId},$,#${axisX},${toM(spanMm)});`,
      );
      shapeRepId = this.createShapeRepresentation(lines, subContextId, solidId);
    } else if (type.startsWith("structure.foundation")) {
      ifcClass = "IFCFOOTING";
      predefinedType = d.foundation_type === "pile_cap" ? ".PILE_CAP." : ".PAD_FOOTING.";
      const c = d.center_mm ?? [0, 0, 0];
      const sz = d.size_mm ?? [800, 800, 300];

      const locPt = this.nextId();
      lines.push(`#${locPt}=IFCCARTESIANPOINT((${toM(c[0])},${toM(c[1])},${toM(c[2])}));`);
      placementId = this.createLocalPlacement(lines, locPt, axisZ, axisX);

      const profileId = this.nextId();
      lines.push(
        `#${profileId}=IFCRECTANGLEPROFILEDEF(.AREA.,'${d.mark ?? "F1"}',$,${toM(sz[0])},${toM(sz[1])});`,
      );
      const solidId = this.nextId();
      lines.push(
        `#${solidId}=IFCEXTRUDEDAREASOLID(#${profileId},$,#${axisZ},${toM(sz[2])});`,
      );
      shapeRepId = this.createShapeRepresentation(lines, subContextId, solidId);
    } else if (type.startsWith("structure.slab")) {
      ifcClass = "IFCSLAB";
      predefinedType = ".FLOOR.";
      const thMm = d.thickness_mm ?? 120;
      const originPt = this.nextId();
      lines.push(`#${originPt}=IFCCARTESIANPOINT((0.,0.,0.));`);
      placementId = this.createLocalPlacement(lines, originPt, axisZ, axisX);

      const profileId = this.nextId();
      lines.push(
        `#${profileId}=IFCRECTANGLEPROFILEDEF(.AREA.,'${d.slab_system ?? "S1"}',$,4.0,5.0);`,
      );
      const solidId = this.nextId();
      lines.push(
        `#${solidId}=IFCEXTRUDEDAREASOLID(#${profileId},$,#${axisZ},${toM(thMm)});`,
      );
      shapeRepId = this.createShapeRepresentation(lines, subContextId, solidId);
    } else if (type.startsWith("arch.wall") || type.startsWith("architecture.wall")) {
      ifcClass = "IFCWALL";
      predefinedType = ".SOLIDWALL.";
      const sp = d.start_point_mm ?? [0, 0, 0];
      const ep = d.end_point_mm ?? [4000, 0, 0];
      const thMm = d.thickness_mm ?? 100;
      const hMm = d.height_mm ?? 2800;
      const lenMm = Math.hypot(ep[0] - sp[0], ep[1] - sp[1]) || 1000;

      const locPt = this.nextId();
      lines.push(`#${locPt}=IFCCARTESIANPOINT((${toM(sp[0])},${toM(sp[1])},${toM(sp[2])}));`);
      placementId = this.createLocalPlacement(lines, locPt, axisZ, axisX);

      const profileId = this.nextId();
      lines.push(
        `#${profileId}=IFCRECTANGLEPROFILEDEF(.AREA.,'WallProfile',$,${toM(lenMm)},${toM(thMm)});`,
      );
      const solidId = this.nextId();
      lines.push(
        `#${solidId}=IFCEXTRUDEDAREASOLID(#${profileId},$,#${axisZ},${toM(hMm)});`,
      );
      shapeRepId = this.createShapeRepresentation(lines, subContextId, solidId);
    } else if (type.startsWith("arch.door") || type.startsWith("opening.door")) {
      ifcClass = "IFCDOOR";
      predefinedType = ".DOOR.";
      const loc = d.location_mm ?? [0, 0, 0];
      const locPt = this.nextId();
      lines.push(`#${locPt}=IFCCARTESIANPOINT((${toM(loc[0])},${toM(loc[1])},${toM(loc[2])}));`);
      placementId = this.createLocalPlacement(lines, locPt, axisZ, axisX);
    } else if (type.startsWith("arch.window") || type.startsWith("opening.window")) {
      ifcClass = "IFCWINDOW";
      predefinedType = ".WINDOW.";
      const loc = d.location_mm ?? [0, 0, 0];
      const locPt = this.nextId();
      lines.push(`#${locPt}=IFCCARTESIANPOINT((${toM(loc[0])},${toM(loc[1])},${toM(loc[2])}));`);
      placementId = this.createLocalPlacement(lines, locPt, axisZ, axisX);
    } else if (type.startsWith("plumbing.") || type.startsWith("drainage.")) {
      ifcClass = "IFCPIPESEGMENT";
      predefinedType = ".CULVERT.";
      const originPt = this.nextId();
      lines.push(`#${originPt}=IFCCARTESIANPOINT((0.,0.,0.));`);
      placementId = this.createLocalPlacement(lines, originPt, axisZ, axisX);
    } else if (type.startsWith("structure.rebar")) {
      ifcClass = "IFCREINFORCINGBAR";
      predefinedType = ".MAIN.";
      const originPt = this.nextId();
      lines.push(`#${originPt}=IFCCARTESIANPOINT((0.,0.,0.));`);
      placementId = this.createLocalPlacement(lines, originPt, axisZ, axisX);
    } else if (type.startsWith("interior.") || type.startsWith("cabinet.")) {
      ifcClass = "IFCFURNISHINGELEMENT";
      predefinedType = ".NOTDEFINED.";
      const loc = d.location_mm ?? [0, 0, 0];
      const locPt = this.nextId();
      lines.push(`#${locPt}=IFCCARTESIANPOINT((${toM(loc[0])},${toM(loc[1])},${toM(loc[2])}));`);
      placementId = this.createLocalPlacement(lines, locPt, axisZ, axisX);
    } else {
      const originPt = this.nextId();
      lines.push(`#${originPt}=IFCCARTESIANPOINT((0.,0.,0.));`);
      placementId = this.createLocalPlacement(lines, originPt, axisZ, axisX);
    }

    // Product Definition Shape
    let prodDefShapeId = "$";
    if (shapeRepId) {
      const pdsId = this.nextId();
      lines.push(
        `#${pdsId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`,
      );
      prodDefShapeId = `#${pdsId}`;
    }

    // Primary IFC Element instance
    const elemId = this.nextId();
    lines.push(
      `#${elemId}=${ifcClass}('${guid}',$,'${d.mark ?? obj.object_type}',$,'${obj.object_type}',#${placementId},${prodDefShapeId},'${obj.id}',${predefinedType});`,
    );

    // Renovation Phasing Property Set: Pset_ConstructionPhase
    this.attachPhasePropertySet(lines, elemId, phase);

    return elemId;
  }

  private attachPhasePropertySet(lines: string[], elemId: number, phase: Phase): void {
    const phaseLabel =
      phase === "demolition"
        ? "Demolition"
        : phase === "existing"
          ? "Existing"
          : "New_Construction";
    const jointLabel =
      phase === "new_construction" ? "Chemical_Dowel_Epoxy" : "None";

    const p1 = this.nextId();
    lines.push(`#${p1}=IFCPROPERTYSINGLEVALUE('PhaseCreated',$,IFCLABEL('${phaseLabel}'),$);`);

    const p2 = this.nextId();
    lines.push(`#${p2}=IFCPROPERTYSINGLEVALUE('JointTreatment',$,IFCLABEL('${jointLabel}'),$);`);

    const psetId = this.nextId();
    const psetGuid = uuidToIfcGuid(`pset-${elemId}`);
    lines.push(
      `#${psetId}=IFCPROPERTYSET('${psetGuid}',$,'Pset_ConstructionPhase',$,(#${p1},#${p2}));`,
    );

    const relPropId = this.nextId();
    lines.push(
      `#${relPropId}=IFCRELDEFINESBYPROPERTIES('${uuidToIfcGuid("relprop-" + elemId)}',$,$,$,(#${elemId}),#${psetId});`,
    );
  }

  private createLocalPlacement(
    lines: string[],
    pointId: number,
    axisZ: number,
    axisX: number,
    relPlacementId?: number,
  ): number {
    const axisPlacementId = this.nextId();
    lines.push(`#${axisPlacementId}=IFCAXIS2PLACEMENT3D(#${pointId},#${axisZ},#${axisX});`);
    const placeId = this.nextId();
    const parentRef = relPlacementId ? `#${relPlacementId}` : "$";
    lines.push(`#${placeId}=IFCLOCALPLACEMENT(${parentRef},#${axisPlacementId});`);
    return placeId;
  }

  private createShapeRepresentation(lines: string[], contextId: number, itemSolidId: number): number {
    const repId = this.nextId();
    lines.push(
      `#${repId}=IFCSHAPEREPRESENTATION(#${contextId},'Body','SweptSolid',(#${itemSolidId}));`,
    );
    return repId;
  }
}
