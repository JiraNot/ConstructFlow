import { familyOutputs, validateFamilyProject } from '@constructflow/family-engine'
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
  const custom = familyOutputs(project)
  const native = [
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
  const overrides = new Map(custom.map(output => [output.object_id, output]))
  const nativeIds = new Set(native.map(output=>output.object_id))
  return [...native.map(output => { const family = overrides.get(output.object_id); return family ? {...output, paths:family.paths, meshes:family.meshes, schedule:{...output.schedule,...family.schedule}} : output }), ...custom.filter(output=>!nativeIds.has(output.object_id))];
}

export function validateConstructionProject(project: ProjectDocument): void {
  for (const validate of [
    validateFamilyProject,
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
