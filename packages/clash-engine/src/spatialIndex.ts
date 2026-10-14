import type { SpatialBounds } from './spatial.js'

export interface SpatialEntry<T> {
  bounds: SpatialBounds
  value: T
}

interface RTreeNode<T> {
  leaf: boolean
  bounds: SpatialBounds
  children: Array<RTreeNode<T> | SpatialEntry<T>>
}

function isValidBounds(value: unknown): value is SpatialBounds {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const min = candidate.min
  const max = candidate.max
  const isFiniteNumber = (coordinate: unknown): coordinate is number => typeof coordinate === 'number' && Number.isFinite(coordinate)
  return Array.isArray(min) && min.length === 3 && Array.isArray(max) && max.length === 3
    && min.every(isFiniteNumber) && max.every(isFiniteNumber)
    && min.every((coordinate, axis) => coordinate <= max[axis])
}

function assertValidBounds(value: unknown, label: string): asserts value is SpatialBounds {
  if (!isValidBounds(value)) throw new Error(`${label} must contain finite 3D min/max coordinates in ascending order`)
}

function overlaps(a: SpatialBounds, b: SpatialBounds): boolean {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0]
    && a.min[1] <= b.max[1] && a.max[1] >= b.min[1]
    && a.min[2] <= b.max[2] && a.max[2] >= b.min[2]
}

function unionBounds(bounds: SpatialBounds[]): SpatialBounds {
  return {
    min: [0, 1, 2].map(axis => Math.min(...bounds.map(item => item.min[axis]))) as [number, number, number],
    max: [0, 1, 2].map(axis => Math.max(...bounds.map(item => item.max[axis]))) as [number, number, number],
  }
}

function centerOnAxis(bounds: SpatialBounds, axis: number): number {
  return (bounds.min[axis] + bounds.max[axis]) / 2
}

/** A packed 3D R-tree optimized for rebuilding an index from a project snapshot. */
export class RTree<T> {
  private readonly root: RTreeNode<T> | null
  readonly size: number

  constructor(entries: Array<SpatialEntry<T>>, readonly maxEntries = 8) {
    if (!Number.isInteger(maxEntries) || maxEntries < 4) throw new Error('R-tree maxEntries must be an integer of at least 4')
    for (const [index, entry] of entries.entries()) assertValidBounds(entry?.bounds, `R-tree entry ${index}`)
    this.size = entries.length
    if (!entries.length) {
      this.root = null
      return
    }
    let axis = 0
    let level: RTreeNode<T>[] = []
    const sortedEntries = [...entries].sort((a, b) => centerOnAxis(a.bounds, axis) - centerOnAxis(b.bounds, axis))
    for (let i = 0; i < sortedEntries.length; i += maxEntries) {
      const children = sortedEntries.slice(i, i + maxEntries)
      level.push({ leaf: true, bounds: unionBounds(children.map(entry => entry.bounds)), children })
    }
    axis = 1
    while (level.length > maxEntries) {
      const sortedNodes = level.sort((a, b) => centerOnAxis(a.bounds, axis) - centerOnAxis(b.bounds, axis))
      const parentLevel: RTreeNode<T>[] = []
      for (let i = 0; i < sortedNodes.length; i += maxEntries) {
        const children = sortedNodes.slice(i, i + maxEntries)
        parentLevel.push({ leaf: false, bounds: unionBounds(children.map(node => node.bounds)), children })
      }
      level = parentLevel
      axis = (axis + 1) % 3
    }
    this.root = level.length === 1
      ? level[0]!
      : { leaf: false, bounds: unionBounds(level.map(node => node.bounds)), children: level }
  }

  search(bounds: SpatialBounds): Array<SpatialEntry<T>> {
    assertValidBounds(bounds, 'R-tree query bounds')
    if (!this.root) return []
    const found: Array<SpatialEntry<T>> = []
    const stack: RTreeNode<T>[] = [this.root]
    while (stack.length) {
      const node = stack.pop()!
      if (!overlaps(node.bounds, bounds)) continue
      if (node.leaf) {
        for (const child of node.children as Array<SpatialEntry<T>>) if (overlaps(child.bounds, bounds)) found.push(child)
      } else {
        for (const child of node.children as Array<RTreeNode<T>>) if (overlaps(child.bounds, bounds)) stack.push(child)
      }
    }
    return found
  }
}
