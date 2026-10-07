export type ExtensionPresetType = 'carport' | 'kitchen' | 'terrace'

/** Presentation accepts meters; Extension converts to canonical millimeters once. */
export interface ExtensionPresetInput {
  preset: ExtensionPresetType
  posX_m: number
  posY_m: number
  width_m: number
  length_m: number
  carportColumnType?: string
  kitchenWallHeight_m?: number
  kitchenIncludeDoor?: boolean
  kitchenIncludeWindow?: boolean
  kitchenWallSides?: 3 | 4
  terraceElevation_m?: number
}
