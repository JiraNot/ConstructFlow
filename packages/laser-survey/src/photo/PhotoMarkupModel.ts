export type DimensionCategory = 'architecture' | 'interior' | 'setback' | 'defect' | 'mep'
export type DimensionStatus = 'measured' | 'pending' | 'defect'
export type AreaCategory = 'paint' | 'wallpaper' | 'tile' | 'masonry' | 'custom'

/** Sub-segment within a continuous multi-segment dimension chain */
export interface SubSegment {
  id: string
  /** Split position ratio along the line (0.0 < ratio < 1.0) */
  ratio: number
  /** Measured distance of this sub-segment in canonical millimeters */
  distance_mm: number
  /** Distance in meters */
  distance_m: number
  /** Label for this segment (e.g. 'ถึงปลั๊กไฟ', 'ถึงท่อน้ำ') */
  label?: string
}

export interface PhotoDimensionLine {
  id: string
  /** Normalized start coordinate (0.0 to 1.0 relative to image width/height) */
  start_ratio: [number, number]
  /** Normalized end coordinate (0.0 to 1.0 relative to image width/height) */
  end_ratio: [number, number]
  /** Total measured distance in canonical millimeters */
  distance_mm: number
  /** Total distance in meters */
  distance_m: number
  /** Descriptive label (e.g. 'ความกว้างช่องตู้เย็น', 'ระยะร่นรั้ว', 'รอยร้าวเสา') */
  label: string
  /** Work category */
  category: DimensionCategory
  /** Status */
  status: DimensionStatus
  /** Notes in Thai or English */
  notes?: string
  /** Color hex code for rendering */
  color?: string
  /** Optional continuous multi-segment division points along this line */
  sub_segments?: SubSegment[]
}

export interface TileSizePreset {
  id: string
  name: string
  width_cm: number
  length_cm: number
  pieces_per_box: number
  description: string
}

export const STANDARD_TILE_PRESETS: TileSizePreset[] = [
  { id: '60x60', name: '60x60 cm (แกรนิตโต้)', width_cm: 60, length_cm: 60, pieces_per_box: 4, description: 'ยอดนิยมสำหรับพื้นห้องโถง / ห้องนั่งเล่น (1 กล่อง = 1.44 ตร.ม.)' },
  { id: '30x30', name: '30x30 cm (พื้นห้องน้ำ)', width_cm: 30, length_cm: 30, pieces_per_box: 11, description: 'กระเบื้องพื้นห้องน้ำ / ระเบียงกันลื่น (1 กล่อง ≈ 0.99 ตร.ม.)' },
  { id: '30x60', name: '30x60 cm (ผนังห้องน้ำ/ครัว)', width_cm: 30, length_cm: 60, pieces_per_box: 8, description: 'กระเบื้องผนังห้องน้ำ / เคาน์เตอร์ครัว (1 กล่อง = 1.44 ตร.ม.)' },
  { id: '60x120', name: '60x120 cm (แผ่นใหญ่หรู)', width_cm: 60, length_cm: 120, pieces_per_box: 2, description: 'กระเบื้องพอร์ซเลนแผ่นใหญ่หรูหรา (1 กล่อง = 1.44 ตร.ม.)' },
  { id: '15x60', name: '15x60 cm (ลายไม้)', width_cm: 15, length_cm: 60, pieces_per_box: 11, description: 'กระเบื้องลายไม้ปูสลับ / ลายก้างปลา (1 กล่อง = 0.99 ตร.ม.)' },
  { id: '40x40', name: '40x40 cm (พื้นทั่วไป)', width_cm: 40, length_cm: 40, pieces_per_box: 6, description: 'กระเบื้องเซรามิกพื้นทั่วไป (1 กล่อง = 0.96 ตร.ม.)' },
  { id: '20x20', name: '20x20 cm (วินเทจ/โมเสก)', width_cm: 20, length_cm: 20, pieces_per_box: 25, description: 'กระเบื้องตกแต่งลายโบราณ / พื้นห้องน้ำ (1 กล่อง = 1.00 ตร.ม.)' },
]

export interface TileCalculationConfig {
  tile_width_cm: number
  tile_length_cm: number
  waste_percent: number // e.g. 5, 10, 15
  pieces_per_box?: number
  show_grid?: boolean
}

export interface TileCalculationResult {
  tile_width_cm: number
  tile_length_cm: number
  tile_area_sqm: number
  net_area_sqm: number
  waste_percent: number
  base_pieces: number // Net Area / Tile Area (ceil)
  waste_pieces: number // Extra cut waste
  total_pieces: number // base + waste
  pieces_per_box: number
  total_boxes: number // ceil(total_pieces / pieces_per_box)
  box_coverage_sqm: number // total_boxes * pieces_per_box * tile_area_sqm
  mortar_bags_20kg: number // 1 bag (20kg) covers ~4.0 m²
  grout_bags_1kg: number // 1 bag (1kg) covers ~3.5 m²
}

/** Rectangular surface area box on photo for calculating paint/tile/wallpaper */
export interface PhotoAreaBox {
  id: string
  /** Normalized bounding box [left, top, width, height] (0.0 to 1.0) */
  bounds_ratio: [number, number, number, number]
  /** Width in canonical millimeters */
  width_mm: number
  /** Height in canonical millimeters */
  height_mm: number
  /** Gross area in square meters (width_mm * height_mm / 1,000,000) */
  area_sqm: number
  /** Area to deduct in square meters (e.g. doors, windows) */
  deductions_sqm: number
  /** Net surface area in square meters (area_sqm - deductions_sqm) */
  net_area_sqm: number
  /** Label for this area (e.g. 'ผนังทาสีห้องนอน', 'ผนังกระเบื้องห้องน้ำ') */
  label: string
  /** Work category */
  category: AreaCategory
  /** Notes */
  notes?: string
  /** Color */
  color?: string
  /** Tile calculation configuration if category === 'tile' */
  tile_config?: TileCalculationConfig
  /** Computed tile piece count, box count, and mortar/grout bags */
  tile_result?: TileCalculationResult
}

export interface PhotoDimensionSession {
  id: string
  title: string
  room_name?: string
  image_data_url: string
  image_natural_width: number
  image_natural_height: number
  captured_at: string
  dimensions: PhotoDimensionLine[]
  areas?: PhotoAreaBox[]
  notes?: string
  /** Pinned 2D coordinate on ConstructFlow active level in model millimeters [x_mm, y_mm] */
  pin_coords_mm?: [number, number]
  /** Camera orientation angle in degrees (0 = North, 90 = East, 180 = South, 270 = West) */
  camera_heading_deg?: number
  /** Level ID this photo is attached to */
  level_id?: string
}

export function createNewPhotoDimensionLine(
  start_ratio: [number, number],
  end_ratio: [number, number],
  distance_mm: number = 0,
  label: string = 'ระยะวัดหน้างาน',
  category: DimensionCategory = 'interior'
): PhotoDimensionLine {
  return {
    id: `dim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    start_ratio,
    end_ratio,
    distance_mm,
    distance_m: Number((distance_mm / 1000).toFixed(3)),
    label,
    category,
    status: distance_mm > 0 ? 'measured' : 'pending',
    color: '#00E5FF', // Blueprint Cyan
    sub_segments: [],
  }
}

export function calculateTileRequirement(
  net_area_sqm: number,
  config: TileCalculationConfig
): TileCalculationResult {
  const w_m = config.tile_width_cm / 100
  const l_m = config.tile_length_cm / 100
  const tile_area_sqm = Number((w_m * l_m).toFixed(4))

  if (tile_area_sqm <= 0 || net_area_sqm <= 0) {
    return {
      tile_width_cm: config.tile_width_cm,
      tile_length_cm: config.tile_length_cm,
      tile_area_sqm: 0,
      net_area_sqm: 0,
      waste_percent: config.waste_percent,
      base_pieces: 0,
      waste_pieces: 0,
      total_pieces: 0,
      pieces_per_box: config.pieces_per_box || 4,
      total_boxes: 0,
      box_coverage_sqm: 0,
      mortar_bags_20kg: 0,
      grout_bags_1kg: 0,
    }
  }

  const rawBasePieces = net_area_sqm / tile_area_sqm
  const base_pieces = Math.ceil(rawBasePieces)
  const wasteRate = Math.max(0, config.waste_percent || 0) / 100
  const waste_pieces = Math.ceil(base_pieces * wasteRate)
  const total_pieces = base_pieces + waste_pieces

  const pieces_per_box = config.pieces_per_box && config.pieces_per_box > 0
    ? config.pieces_per_box
    : 4
  const total_boxes = Math.ceil(total_pieces / pieces_per_box)
  const box_coverage_sqm = Number((total_boxes * pieces_per_box * tile_area_sqm).toFixed(2))

  // Mortar (ปูนกาวซีเมนต์ถุง 20kg): Standard consumption 4.0 - 5.0 kg/m² -> ~4.0 m² per 20kg bag
  const mortar_bags_20kg = Math.ceil(net_area_sqm / 4.0)

  // Tile Grout (กาวยาแนวถุง 1kg): Standard consumption 0.25 - 0.35 kg/m² -> ~3.5 m² per 1kg bag
  const grout_bags_1kg = Math.ceil(net_area_sqm / 3.5)

  return {
    tile_width_cm: config.tile_width_cm,
    tile_length_cm: config.tile_length_cm,
    tile_area_sqm,
    net_area_sqm,
    waste_percent: config.waste_percent,
    base_pieces,
    waste_pieces,
    total_pieces,
    pieces_per_box,
    total_boxes,
    box_coverage_sqm,
    mortar_bags_20kg,
    grout_bags_1kg,
  }
}

export function createNewPhotoAreaBox(
  bounds_ratio: [number, number, number, number],
  width_mm: number = 3000,
  height_mm: number = 2600,
  label: string = 'ผนังทาสี',
  category: AreaCategory = 'paint'
): PhotoAreaBox {
  const grossArea = Number(((width_mm * height_mm) / 1_000_000).toFixed(2))
  const box: PhotoAreaBox = {
    id: `area-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    bounds_ratio,
    width_mm,
    height_mm,
    area_sqm: grossArea,
    deductions_sqm: 0,
    net_area_sqm: grossArea,
    label,
    category,
    color: category === 'tile' ? '#38BDF8' : '#10B981', // Sky blue for tile, Emerald for paint
  }

  if (category === 'tile') {
    box.tile_config = {
      tile_width_cm: 60,
      tile_length_cm: 60,
      waste_percent: 10,
      pieces_per_box: 4,
      show_grid: true,
    }
    box.tile_result = calculateTileRequirement(grossArea, box.tile_config)
  }

  return box
}

export function recalculateAreaBox(box: PhotoAreaBox): PhotoAreaBox {
  const grossArea = Number(((box.width_mm * box.height_mm) / 1_000_000).toFixed(2))
  const netArea = Math.max(0, Number((grossArea - (box.deductions_sqm || 0)).toFixed(2)))

  let tile_result = box.tile_result
  if (box.category === 'tile' && box.tile_config) {
    tile_result = calculateTileRequirement(netArea, box.tile_config)
  }

  return {
    ...box,
    area_sqm: grossArea,
    net_area_sqm: netArea,
    tile_result,
  }
}

export function validatePhotoSession(session: unknown): asserts session is PhotoDimensionSession {
  if (!session || typeof session !== 'object') throw new Error('Session must be an object')
  const s = session as PhotoDimensionSession
  if (typeof s.id !== 'string' || !s.id.trim()) throw new Error('Session requires an ID')
  if (typeof s.image_data_url !== 'string' || !s.image_data_url.trim()) throw new Error('Session requires image data')
  if (!Array.isArray(s.dimensions)) throw new Error('Session dimensions must be an array')
}
