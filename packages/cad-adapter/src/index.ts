// @constructflow/cad-adapter Public API

import type { ProjectDocument } from "@constructflow/project-model";
import { DxfGenerator, type DxfGeneratorOptions, LAYOUT_DEFS } from "./dxfGenerator.js";
import { CAD_STANDARD_LAYERS, resolveCadLayer } from "./layerStandards.js";
import { formatAcadTableDxf, formatTableLinesFallbackDxf } from "./tableEntity.js";

export interface CadExportResult {
  dxfContent: string;
  publishScriptContent: string;
  layoutsCount: number;
  layersCount: number;
}

export function exportProjectToDxf(
  project: ProjectDocument,
  options: DxfGeneratorOptions = {},
): CadExportResult {
  const generator = new DxfGenerator(project, options);
  const dxfContent = generator.generate();
  const publishScriptContent = generator.generateBatchPublishScript();

  return {
    dxfContent,
    publishScriptContent,
    layoutsCount: generator.layoutsCount,
    layersCount: Object.keys(CAD_STANDARD_LAYERS).length,
  };
}

export {
  DxfGenerator,
  type DxfGeneratorOptions,
  LAYOUT_DEFS,
  CAD_STANDARD_LAYERS,
  resolveCadLayer,
  formatAcadTableDxf,
  formatTableLinesFallbackDxf,
};
