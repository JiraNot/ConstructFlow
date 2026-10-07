// ConstructFlow Canonical Schema Mapping Utility (F02)
// Provides unified mappings between canonical SmartObjects and external CAD/BIM formats.

import type { Phase, RemovalPhase } from './types.js'
import type { SmartObject } from './smartObject.js'

export interface TargetFormatMapping {
  family: string
  cadLayerPrefix: string // e.g. "S-COLN", "A-WALL"
  ifcEntity: string // e.g. "IfcColumn", "IfcWallStandardCase"
  revitCategory: string // e.g. "OST_Columns", "OST_Walls"
  rubyDefinitionClass: string // e.g. "Structure::ColumnDefinition"
}

export const CANONICAL_FAMILY_MAPPINGS: Record<string, TargetFormatMapping> = {
  // Structure
  column: {
    family: 'column',
    cadLayerPrefix: 'S-COLN',
    ifcEntity: 'IfcColumn',
    revitCategory: 'OST_Columns',
    rubyDefinitionClass: 'Structure::ColumnDefinition',
  },
  beam: {
    family: 'beam',
    cadLayerPrefix: 'S-BEAM',
    ifcEntity: 'IfcBeam',
    revitCategory: 'OST_StructuralFraming',
    rubyDefinitionClass: 'Structure::BeamDefinition',
  },
  foundation: {
    family: 'foundation',
    cadLayerPrefix: 'S-FNDN',
    ifcEntity: 'IfcFooting',
    revitCategory: 'OST_StructuralFoundation',
    rubyDefinitionClass: 'Structure::FoundationDefinition',
  },
  pile: {
    family: 'pile',
    cadLayerPrefix: 'S-FNDN',
    ifcEntity: 'IfcPile',
    revitCategory: 'OST_StructuralFoundation',
    rubyDefinitionClass: 'Structure::PileDefinition',
  },
  slab: {
    family: 'slab',
    cadLayerPrefix: 'S-SLAB',
    ifcEntity: 'IfcSlab',
    revitCategory: 'OST_Floors',
    rubyDefinitionClass: 'Structure::SlabDefinition',
  },
  grid: {
    family: 'grid',
    cadLayerPrefix: 'S-GRID',
    ifcEntity: 'IfcGrid',
    revitCategory: 'OST_Grids',
    rubyDefinitionClass: 'Structure::GridDefinition',
  },
  rebar_set: {
    family: 'rebar_set',
    cadLayerPrefix: 'S-REBR',
    ifcEntity: 'IfcReinforcingBar',
    revitCategory: 'OST_Rebar',
    rubyDefinitionClass: 'Structure::RebarSetDefinition',
  },

  // Architecture
  wall: {
    family: 'wall',
    cadLayerPrefix: 'A-WALL',
    ifcEntity: 'IfcWallStandardCase',
    revitCategory: 'OST_Walls',
    rubyDefinitionClass: 'Architecture::WallDefinition',
  },
  door: {
    family: 'door',
    cadLayerPrefix: 'A-DOOR',
    ifcEntity: 'IfcDoor',
    revitCategory: 'OST_Doors',
    rubyDefinitionClass: 'DoorWindow::DoorDefinition',
  },
  window: {
    family: 'window',
    cadLayerPrefix: 'A-WIND',
    ifcEntity: 'IfcWindow',
    revitCategory: 'OST_Windows',
    rubyDefinitionClass: 'DoorWindow::WindowDefinition',
  },
  roof: {
    family: 'roof',
    cadLayerPrefix: 'A-ROOF',
    ifcEntity: 'IfcRoof',
    revitCategory: 'OST_Roofs',
    rubyDefinitionClass: 'Roof::RoofDefinition',
  },
  stair: {
    family: 'stair',
    cadLayerPrefix: 'A-STRS',
    ifcEntity: 'IfcStair',
    revitCategory: 'OST_Stairs',
    rubyDefinitionClass: 'Architecture::StairDefinition',
  },
  railing: {
    family: 'railing',
    cadLayerPrefix: 'A-RAIL',
    ifcEntity: 'IfcRailing',
    revitCategory: 'OST_Railings',
    rubyDefinitionClass: 'Architecture::RailingDefinition',
  },
  ceiling: {
    family: 'ceiling',
    cadLayerPrefix: 'A-CLNG',
    ifcEntity: 'IfcCovering',
    revitCategory: 'OST_Ceilings',
    rubyDefinitionClass: 'Architecture::CeilingDefinition',
  },
  moulding: {
    family: 'moulding',
    cadLayerPrefix: 'A-FINS',
    ifcEntity: 'IfcCovering',
    revitCategory: 'OST_Cornices',
    rubyDefinitionClass: 'Decorative::MouldingDefinition',
  },

  // MEP
  manhole: {
    family: 'manhole',
    cadLayerPrefix: 'M-DRAN',
    ifcEntity: 'IfcDistributionChamberElement',
    revitCategory: 'OST_PlumbingFixtures',
    rubyDefinitionClass: 'Drainage::ManholeDefinition',
  },
  drain_pipe: {
    family: 'drain_pipe',
    cadLayerPrefix: 'M-PLMB',
    ifcEntity: 'IfcPipeSegment',
    revitCategory: 'OST_PipeCurves',
    rubyDefinitionClass: 'Drainage::PipeDefinition',
  },
  septic_tank: {
    family: 'septic_tank',
    cadLayerPrefix: 'M-DRAN',
    ifcEntity: 'IfcDistributionChamberElement',
    revitCategory: 'OST_PlumbingFixtures',
    rubyDefinitionClass: 'Drainage::SepticDefinition',
  },
  water_pipe: {
    family: 'water_pipe',
    cadLayerPrefix: 'M-PLMB',
    ifcEntity: 'IfcPipeSegment',
    revitCategory: 'OST_PipeCurves',
    rubyDefinitionClass: 'Plumbing::PipeDefinition',
  },
  pump_bypass: {
    family: 'pump_bypass',
    cadLayerPrefix: 'M-PUMP',
    ifcEntity: 'IfcPump',
    revitCategory: 'OST_MechanicalEquipment',
    rubyDefinitionClass: 'Plumbing::PumpBypassDefinition',
  },
  panelboard: {
    family: 'panelboard',
    cadLayerPrefix: 'E-POWR',
    ifcEntity: 'IfcElectricDistributionBoard',
    revitCategory: 'OST_ElectricalEquipment',
    rubyDefinitionClass: 'Electrical::PanelDefinition',
  },
  luminaire: {
    family: 'luminaire',
    cadLayerPrefix: 'E-LGHT',
    ifcEntity: 'IfcLightFixture',
    revitCategory: 'OST_LightingFixtures',
    rubyDefinitionClass: 'Electrical::LuminaireDefinition',
  },
}

export function resolveObjectFamily(object: SmartObject | { family?: string; object_type?: string }): string {
  if ('family' in object && typeof object.family === 'string' && object.family) {
    return object.family
  }
  if ('object_type' in object && typeof object.object_type === 'string' && object.object_type) {
    const parts = object.object_type.split('.')
    return parts[parts.length - 1]
  }
  return 'generic'
}

/**
 * Resolves the AutoCAD AIA / วสท. layer name for a Smart Object.
 * Format: {Discipline}-{ElementCode}-{PhaseSuffix} (e.g. A-WALL-NEWW, A-WALL-DEMO, S-COLN-EXST)
 */
export function resolveCadLayerForSmartObject(object: SmartObject | { family?: string; object_type?: string; created_phase?: Phase; removed_phase?: RemovalPhase | null }): string {
  const family = resolveObjectFamily(object)
  const mapping = CANONICAL_FAMILY_MAPPINGS[family]
  const prefix = mapping?.cadLayerPrefix ?? 'A-GENR'

  let phaseSuffix = 'NEWW'
  if (object.removed_phase === 'demolition' || object.created_phase === 'demolition') {
    phaseSuffix = 'DEMO'
  } else if (object.created_phase === 'existing') {
    phaseSuffix = 'EXST'
  }

  return `${prefix}-${phaseSuffix}`
}

/**
 * Resolves the OpenBIM IFC 4.3 entity name for a Smart Object.
 */
export function resolveIfcEntityForSmartObject(object: SmartObject | { family?: string; object_type?: string }): string {
  const family = resolveObjectFamily(object)
  const mapping = CANONICAL_FAMILY_MAPPINGS[family]
  return mapping?.ifcEntity ?? 'IfcBuildingElementProxy'
}

/**
 * Resolves the Autodesk Revit category name for a Smart Object.
 */
export function resolveRevitCategoryForSmartObject(object: SmartObject | { family?: string; object_type?: string }): string {
  const family = resolveObjectFamily(object)
  const mapping = CANONICAL_FAMILY_MAPPINGS[family]
  return mapping?.revitCategory ?? 'OST_GenericModel'
}

/**
 * Resolves the SketchUp Tag/Layer for a Smart Object.
 */
export function resolveSketchUpTagForSmartObject(object: SmartObject | { created_phase?: Phase; removed_phase?: RemovalPhase | null }): string {
  if (object.removed_phase === 'demolition' || object.created_phase === 'demolition') {
    return 'Phase::Demolition'
  }
  if (object.created_phase === 'existing') {
    return 'Phase::Existing'
  }
  return 'Phase::New'
}

/**
 * Resolves the IFC PropertySet Pset_ElementPhase parameters.
 */
export function resolvePsetPhase(object: SmartObject | { created_phase?: Phase; removed_phase?: RemovalPhase | null }): { PhaseCreated: string; PhaseDemolished: string } {
  let created = 'New Construction'
  if (object.created_phase === 'existing') created = 'Existing'
  else if (object.created_phase === 'demolition') created = 'Existing'

  let demolished = ''
  if (object.removed_phase === 'demolition' || object.created_phase === 'demolition') {
    demolished = 'Demolition'
  }

  return {
    PhaseCreated: created,
    PhaseDemolished: demolished,
  }
}

/**
 * Standard buildingSMART 22-char IFC Base64 conversion from RFC-4122 UUID.
 */
const IFC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

export function canonicalUuidToIfcGuid(uuid: string): string {
  const clean = uuid.replace(/-/g, '').toLowerCase()
  if (clean.length !== 32) {
    let hash = 0
    for (let i = 0; i < uuid.length; i++) {
      hash = (hash << 5) - hash + uuid.charCodeAt(i)
      hash |= 0
    }
    let out = ''
    for (let i = 0; i < 22; i++) {
      out += IFC_CHARS[Math.abs(hash + i * 31) % 64]
    }
    return out
  }

  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16) || 0
  }

  let result = ''
  let num = 0
  let nBits = 0

  for (let i = 0; i < 16; i++) {
    num = (num << 8) | bytes[i]
    nBits += 8
    while (nBits >= 6) {
      nBits -= 6
      const index = (num >> nBits) & 0x3f
      result += IFC_CHARS[index]
    }
  }

  if (nBits > 0) {
    const index = (num << (6 - nBits)) & 0x3f
    result += IFC_CHARS[index]
  }

  return result.slice(0, 22).padEnd(22, '0')
}
