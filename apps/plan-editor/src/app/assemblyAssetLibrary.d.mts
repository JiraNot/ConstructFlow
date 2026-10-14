export type AssemblyAsset = {
  id: string; name: string; preset: 'carport' | 'kitchen' | 'terrace'; saved_at: string;
  parameters: {
    posX_m: number; posY_m: number; width_m: number; length_m: number;
    carportColumnType?: string; kitchenWallHeight_m?: number; kitchenIncludeDoor?: boolean;
    kitchenIncludeWindow?: boolean; kitchenWallSides?: 3 | 4; terraceElevation_m?: number;
  };
}
export const ASSEMBLY_ASSET_LIBRARY_KEY: string
export const ASSEMBLY_ASSET_LIBRARY_FORMAT: string
export function validateAssemblyAssetLibrary(value: unknown): { format: string; version: 1; items: AssemblyAsset[] }
export function loadAssemblyAssets(storage?: Storage): AssemblyAsset[]
export function saveAssemblyAssets(items: AssemblyAsset[], storage?: Storage): AssemblyAsset[]
export function createAssemblyAsset(input: { id?: string; name: string; preset: AssemblyAsset['preset']; parameters: AssemblyAsset['parameters']; savedAt?: string }): AssemblyAsset
export function exportAssemblyAssets(items: AssemblyAsset[]): string
export function importAssemblyAssets(source: string, currentItems?: AssemblyAsset[]): AssemblyAsset[]
