export type ProjectTakeoffUnit = 'item' | 'm' | 'm2' | 'm3' | 'kg'

/** Project-owned override for a material's default Thai reference rate. */
export interface ProjectTakeoffRate {
  material_rate: number
  labor_rate: number
  unit: ProjectTakeoffUnit
  /** Sell price per material output unit; BOQ direct cost continues to use material_rate. */
  material_sell_rate?: number
  /** Effective gross margin captured when a supplier product or bundle was applied. */
  product_gross_margin_percent?: number
  supplier_product_id?: string
  supplier_product_bundle_id?: string
  /** Visibility snapshot copied from the selected supplier product/bundle. */
  hide_on_app?: boolean
  hide_on_proposal?: boolean
}

export function validateProjectTakeoffRates(value: Record<string, ProjectTakeoffRate>): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 1000) throw new Error('Invalid takeoff rates: expected at most 1000 keyed material rates')
  for (const [key, rate] of Object.entries(value)) {
    if (!key.trim() || key.length > 160 || !rate || typeof rate !== 'object') throw new Error(`Invalid takeoff rate key ${key || '(empty)'}`)
    if (![rate.material_rate, rate.labor_rate].every(amount => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0)) throw new Error(`Invalid takeoff rate for ${key}: rates must be non-negative amounts`)
    if (!['item', 'm', 'm2', 'm3', 'kg'].includes(rate.unit)) throw new Error(`Invalid takeoff rate unit for ${key}`)
    if (rate.material_sell_rate !== undefined && (typeof rate.material_sell_rate !== 'number' || !Number.isFinite(rate.material_sell_rate) || rate.material_sell_rate < rate.material_rate)) throw new Error(`Invalid takeoff sell rate for ${key}: it must be finite and at least the material cost`)
    if (rate.product_gross_margin_percent !== undefined && (typeof rate.product_gross_margin_percent !== 'number' || !Number.isFinite(rate.product_gross_margin_percent) || rate.product_gross_margin_percent < 0 || rate.product_gross_margin_percent >= 100)) throw new Error(`Invalid product gross margin for ${key}`)
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (rate.supplier_product_id !== undefined && (typeof rate.supplier_product_id !== 'string' || !uuid.test(rate.supplier_product_id))) throw new Error(`Invalid supplier product ID for ${key}`)
    if (rate.supplier_product_bundle_id !== undefined && (typeof rate.supplier_product_bundle_id !== 'string' || !uuid.test(rate.supplier_product_bundle_id))) throw new Error(`Invalid supplier product bundle ID for ${key}`)
    if (rate.supplier_product_id && rate.supplier_product_bundle_id) throw new Error(`Takeoff rate ${key} cannot reference both a supplier product and a bundle`)
    if (rate.hide_on_app !== undefined && typeof rate.hide_on_app !== 'boolean') throw new Error(`Invalid app visibility flag for ${key}`)
    if (rate.hide_on_proposal !== undefined && typeof rate.hide_on_proposal !== 'boolean') throw new Error(`Invalid proposal visibility flag for ${key}`)
  }
}
