import type { ProjectTakeoffRate } from '@constructflow/project-model'
import type { LocalSupplierProductBundle } from './projectAutosave.js'

/** Frozen catalog choices and prices for one bundle instance being placed on a plan. */
export interface SupplierProductBundlePlacement {
  bundle: LocalSupplierProductBundle
  unit_rate: ProjectTakeoffRate
  components: Array<{
    product_id: string
    product_name: string
    supplier_name: string
    supplier_sku: string
    product_group_id?: string
    product_group_name?: string
    purchase_units_per_output_unit: number
    waste_percent: number
    quantity_mode?: 'area' | 'perimeter'
    purchase_unit: string
    unit_cost_thb: number
    unit_sell_thb: number
    unit_labor_thb?: number
  }>
}

export interface SupplierBundlePlacementGeometry {
  location_mm?: [number, number]
  path_mm?: [number, number][]
  boundary_mm?: [number, number][]
}
