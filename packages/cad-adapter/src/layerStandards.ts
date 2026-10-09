// AutoCAD AIA / วสท. CAD Standard Layers and ACI Colors

import type { Phase } from "@constructflow/project-model";

export interface CadLayerDefinition {
  name: string;
  colorNumber: number; // ACI Color Index (1-255)
  lineType: string;
  lineWeightHundredthsMm: number; // e.g. 50 = 0.50mm, 25 = 0.25mm
  description: string;
}

export const CAD_STANDARD_LAYERS: Record<string, CadLayerDefinition> = {
  // Structure Discipline (S-)
  "S-COLN-NEWW": {
    name: "S-COLN-NEWW",
    colorNumber: 7, // New construction palette: black/white
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 50,
    description: "Structural Columns (New)",
  },
  "S-COLN-EXST": {
    name: "S-COLN-EXST",
    colorNumber: 8, // Gray 8
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 25,
    description: "Structural Columns (Existing)",
  },
  "S-COLN-DEMO": {
    name: "S-COLN-DEMO",
    colorNumber: 1,
    lineType: "DASHED2",
    lineWeightHundredthsMm: 35,
    description: "Structural Columns (Demolition)",
  },
  "S-BEAM-NEWW": {
    name: "S-BEAM-NEWW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 40,
    description: "Structural Beams (New)",
  },
  "S-BEAM-EXST": {
    name: "S-BEAM-EXST",
    colorNumber: 8,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 25,
    description: "Structural Beams (Existing)",
  },
  "S-BEAM-DEMO": {
    name: "S-BEAM-DEMO",
    colorNumber: 1,
    lineType: "DASHED2",
    lineWeightHundredthsMm: 35,
    description: "Structural Beams (Demolition)",
  },
  "S-FNDN-NEWW": {
    name: "S-FNDN-NEWW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 50,
    description: "Foundations & Footings (New)",
  },
  "S-FNDN-EXST": { name: "S-FNDN-EXST", colorNumber: 8, lineType: "CONTINUOUS", lineWeightHundredthsMm: 25, description: "Foundations & Footings (Existing)" },
  "S-FNDN-DEMO": { name: "S-FNDN-DEMO", colorNumber: 1, lineType: "DASHED2", lineWeightHundredthsMm: 35, description: "Foundations & Footings (Demolition)" },
  "S-SLAB-NEWW": {
    name: "S-SLAB-NEWW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 35,
    description: "Structural Slabs (New)",
  },
  "S-SLAB-EXST": { name: "S-SLAB-EXST", colorNumber: 8, lineType: "CONTINUOUS", lineWeightHundredthsMm: 25, description: "Structural Slabs (Existing)" },
  "S-SLAB-DEMO": { name: "S-SLAB-DEMO", colorNumber: 1, lineType: "DASHED2", lineWeightHundredthsMm: 35, description: "Structural Slabs (Demolition)" },
  "S-REBR-NEWW": {
    name: "S-REBR-NEWW",
    colorNumber: 1, // Red
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 35,
    description: "Reinforcement Rebars & Stirrups",
  },

  // Architecture Discipline (A-)
  "A-WALL-NEWW": {
    name: "A-WALL-NEWW",
    colorNumber: 7, // White/Black
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 50,
    description: "Architectural Walls (New Construction)",
  },
  "A-WALL-EXST": {
    name: "A-WALL-EXST",
    colorNumber: 8, // Gray 8
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 25,
    description: "Architectural Walls (Existing)",
  },
  "A-WALL-DEMO": {
    name: "A-WALL-DEMO",
    colorNumber: 1, // Red
    lineType: "DASHED2",
    lineWeightHundredthsMm: 35,
    description: "Architectural Walls (Demolition)",
  },
  "A-DOOR-NEWW": {
    name: "A-DOOR-NEWW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 30,
    description: "Doors and Swings",
  },
  "A-DOOR-EXST": { name: "A-DOOR-EXST", colorNumber: 8, lineType: "CONTINUOUS", lineWeightHundredthsMm: 25, description: "Doors and Swings (Existing)" },
  "A-DOOR-DEMO": { name: "A-DOOR-DEMO", colorNumber: 1, lineType: "DASHED2", lineWeightHundredthsMm: 35, description: "Doors and Swings (Demolition)" },
  "A-WIND-NEWW": {
    name: "A-WIND-NEWW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 30,
    description: "Windows and Glazing",
  },
  "A-WIND-EXST": { name: "A-WIND-EXST", colorNumber: 8, lineType: "CONTINUOUS", lineWeightHundredthsMm: 25, description: "Windows and Glazing (Existing)" },
  "A-WIND-DEMO": { name: "A-WIND-DEMO", colorNumber: 1, lineType: "DASHED2", lineWeightHundredthsMm: 35, description: "Windows and Glazing (Demolition)" },
  "A-ROOF-NEWW": {
    name: "A-ROOF-NEWW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 35,
    description: "Roof Perimeter & Ridges",
  },
  "A-FINS-NEWW": {
    name: "A-FINS-NEWW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 25,
    description: "Moldings, Wainscot & Finish",
  },
  "A-FINS-EXST": { name: "A-FINS-EXST", colorNumber: 8, lineType: "CONTINUOUS", lineWeightHundredthsMm: 25, description: "Architectural Finishes (Existing)" },
  "A-FINS-DEMO": { name: "A-FINS-DEMO", colorNumber: 1, lineType: "DASHED2", lineWeightHundredthsMm: 35, description: "Architectural Finishes (Demolition)" },

  // MEP Discipline (M- & E-)
  "M-PLMB-COLD": {
    name: "M-PLMB-COLD",
    colorNumber: 5, // Blue
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 35,
    description: "Cold Water Supply",
  },
  "M-PLMB-SOIL": {
    name: "M-PLMB-SOIL",
    colorNumber: 14, // Dark Brown/Red
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 40,
    description: "Soil & Blackwater Pipe",
  },
  "M-PLMB-WAST": {
    name: "M-PLMB-WAST",
    colorNumber: 8, // Slate
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 35,
    description: "Waste & Graywater Pipe",
  },
  "M-DRAN-MANH": {
    name: "M-DRAN-MANH",
    colorNumber: 6, // Magenta
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 40,
    description: "Drainage Manholes & Catch Basins",
  },
  "E-LGHT-NEWW": {
    name: "E-LGHT-NEWW",
    colorNumber: 2, // Yellow
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 30,
    description: "Lighting Fixtures & Switching",
  },
  "E-POWR-NEWW": {
    name: "E-POWR-NEWW",
    colorNumber: 1, // Red
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 30,
    description: "Power Outlets & Distribution Panels",
  },
  "E-CIRC-NEWW": {
    name: "E-CIRC-NEWW",
    colorNumber: 30, // Orange
    lineType: "DASHED",
    lineWeightHundredthsMm: 25,
    description: "Electrical Conduit & Home Runs",
  },

  // Interior Millwork (ID-)
  "ID-CABN-NEWW": {
    name: "ID-CABN-NEWW",
    colorNumber: 210, // Purple
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 35,
    description: "Interior Built-in Cabinetry",
  },

  // General & Annotations (ANNO-)
  "ANNO-DIMS": {
    name: "ANNO-DIMS",
    colorNumber: 1, // Red
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 18,
    description: "Dimension Strings",
  },
  "ANNO-TEXT": {
    name: "ANNO-TEXT",
    colorNumber: 7, // White
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 25,
    description: "General Text & Notes",
  },
  "ANNO-TTLB": {
    name: "ANNO-TTLB",
    colorNumber: 7, // White
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 50,
    description: "Title Block & Borders",
  },
  "A-VIEW": {
    name: "A-VIEW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 25,
    description: "Compiled architectural sheet vectors",
  },
  "S-VIEW": {
    name: "S-VIEW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 25,
    description: "Compiled structural sheet vectors",
  },
  "M-VIEW": {
    name: "M-VIEW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 25,
    description: "Compiled mechanical and plumbing sheet vectors",
  },
  "E-VIEW": {
    name: "E-VIEW",
    colorNumber: 7,
    lineType: "CONTINUOUS",
    lineWeightHundredthsMm: 25,
    description: "Compiled electrical sheet vectors",
  },
  "SITE-BNDY": {
    name: "SITE-BNDY",
    colorNumber: 1, // Red
    lineType: "CENTER",
    lineWeightHundredthsMm: 50,
    description: "Property Boundary & Pegs",
  },
};

export function resolveCadLayer(
  objectType: string,
  phase: Phase = "new_construction",
  subType?: string,
): CadLayerDefinition {
  const suffix =
    phase === "demolition"
      ? "DEMO"
      : phase === "existing"
        ? "EXST"
        : "NEWW";
  const phaseLayer = (prefix: string) =>
    CAD_STANDARD_LAYERS[`${prefix}-${suffix}`] ?? CAD_STANDARD_LAYERS[`${prefix}-NEWW`];

  if (objectType.startsWith("structure.column")) {
    return phaseLayer("S-COLN");
  }
  if (objectType.startsWith("structure.beam")) {
    return phaseLayer("S-BEAM");
  }
  if (objectType.startsWith("structure.foundation")) {
    return phaseLayer("S-FNDN");
  }
  if (objectType.startsWith("structure.slab")) {
    return phaseLayer("S-SLAB");
  }
  if (objectType.startsWith("structure.rebar")) {
    return CAD_STANDARD_LAYERS["S-REBR-NEWW"];
  }
  if (objectType.startsWith("arch.wall") || objectType.startsWith("architecture.wall")) {
    return phaseLayer("A-WALL");
  }
  if (objectType === "door_window.door" || objectType.startsWith("arch.door") || objectType.startsWith("opening.door")) {
    return phaseLayer("A-DOOR");
  }
  if (objectType === "door_window.window" || objectType.startsWith("arch.window") || objectType.startsWith("opening.window")) {
    return phaseLayer("A-WIND");
  }
  if (objectType.startsWith("roof.")) {
    return CAD_STANDARD_LAYERS["A-ROOF-NEWW"];
  }
  if (objectType.startsWith("decorative.") || objectType.startsWith("arch.molding")) {
    return phaseLayer("A-FINS");
  }
  if (objectType === "architecture.floor" || objectType === "architecture.ceiling") {
    return phaseLayer("A-FINS");
  }
  if (objectType === "architecture.room" || objectType === "architecture.room_separator") {
    return CAD_STANDARD_LAYERS["ANNO-TEXT"];
  }
  if (objectType.startsWith("plumbing.") || objectType.startsWith("drainage.")) {
    if (subType === "soil") return CAD_STANDARD_LAYERS["M-PLMB-SOIL"];
    if (subType === "waste") return CAD_STANDARD_LAYERS["M-PLMB-WAST"];
    if (subType === "manhole") return CAD_STANDARD_LAYERS["M-DRAN-MANH"];
    return CAD_STANDARD_LAYERS["M-PLMB-COLD"];
  }
  if (objectType.startsWith("electrical.")) {
    if (subType === "light") return CAD_STANDARD_LAYERS["E-LGHT-NEWW"];
    if (subType === "circuit") return CAD_STANDARD_LAYERS["E-CIRC-NEWW"];
    return CAD_STANDARD_LAYERS["E-POWR-NEWW"];
  }
  if (objectType.startsWith("interior.") || objectType.startsWith("cabinet.")) {
    return CAD_STANDARD_LAYERS["ID-CABN-NEWW"];
  }
  if (objectType.startsWith("site.") || objectType.startsWith("land.")) {
    return CAD_STANDARD_LAYERS["SITE-BNDY"];
  }

  return CAD_STANDARD_LAYERS["A-WALL-NEWW"];
}
