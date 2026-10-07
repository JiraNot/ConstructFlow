import type { ProjectDocument } from "@constructflow/project-model";
export { generateProjectCutList } from "@constructflow/interior-engine";
import type { DomainOutput } from "@constructflow/module-sdk";
import {
  structureOutputs,
  validateStructureConstruction,
} from "@constructflow/structure-engine";
import {
  bathroomOutputs,
  validateBathroom,
  stairOutputs,
  validateStairs,
  railingOutputs,
} from "@constructflow/architecture-engine";
import { roofOutputs, validateRoof } from "@constructflow/roof-engine";
import {
  decorativeOutputs,
  validateDecorative,
} from "@constructflow/decorative-engine";
import {
  drainageOutputs,
  validateDrainage,
} from "@constructflow/drainage-engine";
import {
  plumbingOutputs,
  validatePlumbing,
} from "@constructflow/plumbing-engine";
import {
  electricalOutputs,
  validateElectrical,
} from "@constructflow/electrical-engine";
import {
  interiorOutputs,
  validateInterior,
} from "@constructflow/interior-engine";

export function constructionOutputs(project: ProjectDocument): DomainOutput[] {
  return [
    structureOutputs,
    bathroomOutputs,
    stairOutputs,
    railingOutputs,
    roofOutputs,
    decorativeOutputs,
    drainageOutputs,
    plumbingOutputs,
    electricalOutputs,
    interiorOutputs,
  ].flatMap((provider) => provider(project));
}

export function validateConstructionProject(project: ProjectDocument): void {
  for (const validate of [
    validateStructureConstruction,
    validateBathroom,
    validateStairs,
    validateRoof,
    validateDecorative,
    validateDrainage,
    validatePlumbing,
    validateElectrical,
    validateInterior,
  ])
    validate(project);
}
