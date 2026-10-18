import type { FamilyDefinition, FamilyInstanceData } from '@constructflow/project-model'
export interface SaveFamilyInput { family: FamilyDefinition }
export interface PlaceFamilyInstanceInput extends FamilyInstanceData { id?: string; created_phase?: 'existing' | 'demolition' | 'new_construction' }
export interface UpdateFamilyInstanceInput { object_id: string; family_id?: string; family_type_id?: string; family_parameters?: Record<string, number>; location_mm?: [number, number, number]; rotation_deg?: number }
