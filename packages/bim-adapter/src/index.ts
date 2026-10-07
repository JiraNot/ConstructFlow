// @constructflow/bim-adapter Public API

import type { ProjectDocument } from "@constructflow/project-model";
import { IfcSerializer, type IfcExportOptions } from "./ifcSerializer.js";
import { uuidToIfcGuid } from "./ifcGuid.js";
import {
  serializeRevitTransfer,
  type RevitTransferDocument,
  type RevitWall,
  type RevitColumn,
  type RevitBeam,
  type RevitFloor,
  type RevitOpening,
} from "./revitTransfer.js";

export interface IfcExportResult {
  ifcContent: string;
  byteLength: number;
}

export function exportProjectToIfc(
  project: ProjectDocument,
  options: IfcExportOptions = {},
): IfcExportResult {
  const serializer = new IfcSerializer(project, options);
  const ifcContent = serializer.serialize();

  return {
    ifcContent,
    byteLength: new TextEncoder().encode(ifcContent).length,
  };
}

export {
  IfcSerializer,
  type IfcExportOptions,
  uuidToIfcGuid,
  serializeRevitTransfer,
  type RevitTransferDocument,
  type RevitWall,
  type RevitColumn,
  type RevitBeam,
  type RevitFloor,
  type RevitOpening,
};
