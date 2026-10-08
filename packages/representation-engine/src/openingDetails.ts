import type { TypeParameters } from '@constructflow/project-model'

/** Hardware is mounted on the stile, measured from the leaf edge in mm. */
export function openingHandlePlacement(operation: string, index: number, width: number, height: number, glazed: boolean) {
  if (operation === 'fixed' || width <= 0 || height <= 0) return null
  const inset = Math.min(glazed || operation === 'louver' ? 16 : 65, width * 0.2)
  const rightEdge = index % 2 === 0
  return {
    x: operation === 'awning' ? 0.5 : rightEdge ? 1 - inset / width : inset / width,
    y: operation === 'awning' ? 1 - Math.min(16, height * 0.2) / height : 0.5,
    direction: operation === 'awning' || !rightEdge ? 1 : -1,
  }
}

export function openingMaterialAppearance(material: string | undefined) {
  switch (material?.toLowerCase()) {
    case 'timber': case 'wood': case 'solid_wood': return { color: '#a47750', roughness: 0.58, metalness: 0.02 }
    case 'hdf': case 'mdf': return { color: '#e0d7c8', roughness: 0.48, metalness: 0 }
    case 'wpc': return { color: '#877058', roughness: 0.7, metalness: 0 }
    case 'pvc': case 'upvc': return { color: '#e6e7df', roughness: 0.4, metalness: 0 }
    case 'steel': return { color: '#454e55', roughness: 0.4, metalness: 0.55 }
    default: return { color: '#637078', roughness: 0.36, metalness: 0.48 }
  }
}

export interface OpeningDetailBox {
  size_mm: [number, number, number]
  center_mm: [number, number, number]
  role: 'panel' | 'moulding' | 'shadow'
  rotation_x_rad?: number
}

/** Glazing beads sit inside the sash rails on both faces of the glass. */
export function sashBeadDetails(width: number, height: number, depth: number, rail: number): OpeningDetailBox[] {
  if (![width, height, depth, rail].every(v => Number.isFinite(v) && v > 0) || width <= 2 * rail || height <= 2 * rail) return []
  const w = width - 2 * rail, h = height - 2 * rail
  const bead = Math.min(5, w / 8, h / 8)
  const result: OpeningDetailBox[] = []
  for (const face of [-1, 1]) for (const sign of [-1, 1]) {
    result.push({ size_mm: [w, 3, bead], center_mm: [0, face * depth / 2, sign * (h - bead) / 2], role: 'moulding' })
    result.push({ size_mm: [bead, 3, h - 2 * bead], center_mm: [sign * (w - bead) / 2, face * depth / 2, 0], role: 'moulding' })
  }
  return result
}

/** Schematic joinery relief, centered on a leaf; never used as manufacturing dimensions. */
export function doorLeafDetails(style: TypeParameters['door_leaf_style'], width: number, height: number, depth: number): OpeningDetailBox[] {
  if (![width, height, depth].every(v => Number.isFinite(v) && v > 0) || style === 'flush') return []
  const boxes: OpeningDetailBox[] = []
  const insetX = Math.min(85, width * 0.12), insetZ = Math.min(105, height * 0.08)
  const w = width - 2 * insetX, h = height - 2 * insetZ
  const grids = { raised_2_panel: [2, 1], raised_4_panel: [2, 2], raised_6_panel: [3, 2] } as const
  const grid = style && style in grids ? grids[style as keyof typeof grids] : undefined
  const add = (size_mm: OpeningDetailBox['size_mm'], center_mm: OpeningDetailBox['center_mm'], role: OpeningDetailBox['role'], rotation_x_rad = 0) => {
    boxes.push({ size_mm, center_mm, role, rotation_x_rad })
  }
  for (const face of [-1, 1]) {
    const y = face * (depth / 2 + 2)
    if (grid) {
      const gap = Math.min(90, w * 0.10, h * 0.08)
      const pw = (w - (grid[1] - 1) * gap) / grid[1], ph = (h - (grid[0] - 1) * gap) / grid[0]
      for (let row = 0; row < grid[0]; row++) for (let col = 0; col < grid[1]; col++) {
        const x = -w / 2 + pw / 2 + col * (pw + gap), z = h / 2 - ph / 2 - row * (ph + gap)
        const trim = Math.min(14, pw * 0.06, ph * 0.06)
        add([pw, 3, ph], [x, y, z], 'shadow')
        add([pw - 4 * trim, 8, ph - 4 * trim], [x, y + face * 3, z], 'panel')
        // Two stepped mouldings give the edge a readable profile in grazing light.
        for (let step = 0; step < 2; step++) {
          const ww = pw - step * 2 * trim, hh = ph - step * 2 * trim
          for (const sign of [-1, 1]) {
            add([ww, 5 + step * 2, trim], [x, y + face * (4 + step * 2), z + sign * (hh - trim) / 2], 'moulding')
            add([trim, 5 + step * 2, hh - 2 * trim], [x + sign * (ww - trim) / 2, y + face * (4 + step * 2), z], 'moulding')
          }
        }
      }
    } else if (style === 'horizontal_grooves_3' || style === 'horizontal_grooves_5') {
      const count = style === 'horizontal_grooves_5' ? 5 : 3
      for (let i = 1; i <= count; i++) add([w, 1, Math.min(3, h * 0.01)], [0, y, -h / 2 + h * i / (count + 1)], 'shadow')
    } else if (style === 'vertical_grooves_3') {
      for (let i = 1; i <= 3; i++) add([Math.min(3, w * 0.01), 1, h], [-w / 2 + w * i / 4, y, 0], 'shadow')
    } else if (style === 'louvered') {
      const count = Math.max(4, Math.min(32, Math.round(h / 65)))
      for (let i = 0; i < count; i++) add([w, 10, h / count * 0.84], [0, y + face * 7, -h / 2 + h * (i + 0.5) / count], 'panel', face * 0.28)
    }
  }
  return boxes
}
