import { useCallback, useEffect, useRef, useState } from 'react'
import type { SmartObject, CabinetModuleData } from '@constructflow/project-model'
import { isGridObject } from '@constructflow/project-model'
import { cabinetFootprintPoints } from './PlanCanvasGeometry.js'
import type { ViewportState } from '../viewport/viewportTransform.js'

export const usePlanCanvasViewport = (
  containerRef: { current: HTMLDivElement | null },
  planVisibleObjects: readonly SmartObject[],
) => {
  const hasInitialFitRef = useRef(false)
  const [viewport, setViewport] = useState<ViewportState>({ panX: 400, panY: 300, zoom: 0.08 })

  const fitView = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const points: [number, number][] = []
    const pointKeys = ['location_mm', 'center_mm', 'start_point_mm', 'end_point_mm', 'origin_mm']
    const polygonKeys = ['boundary_mm', 'vertices_mm', 'outline_mm', 'points_mm', 'path_mm']
    for (const object of planVisibleObjects) {
      if (isGridObject(object)) continue
      const data = object.module_data as Record<string, unknown>
      if (object.object_type === 'interior.cabinet_run') {
        points.push(...cabinetFootprintPoints(object.module_data as unknown as CabinetModuleData))
      }
      for (const key of pointKeys) {
        const value = data[key]
        if (Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
          points.push([value[0], value[1]])
        }
      }
      for (const key of polygonKeys) {
        const value = data[key]
        if (!Array.isArray(value)) continue
        for (const point of value) {
          if (Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
            points.push([point[0], point[1]])
          }
        }
      }
      const center = data.center_mm
      const size = data.size_mm
      if (Array.isArray(center) && Array.isArray(size) && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
        points.push([center[0] - size[0] / 2, center[1] - size[1] / 2])
        points.push([center[0] + size[0] / 2, center[1] + size[1] / 2])
      }
    }
    if (points.length === 0) return
    const bounds = points.reduce((result, point) => ({
      minX: Math.min(result.minX, point[0]),
      maxX: Math.max(result.maxX, point[0]),
      minY: Math.min(result.minY, point[1]),
      maxY: Math.max(result.maxY, point[1]),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
    const { minX, maxX, minY, maxY } = bounds
    const spanX = Math.max(1000, maxX - minX)
    const spanY = Math.max(1000, maxY - minY)
    const zoom = Math.max(0.005, Math.min(0.16,
      (container.clientWidth - 112) / (spanX + 1600),
      (container.clientHeight - 112) / (spanY + 1600),
    ))
    setViewport({
      zoom,
      panX: container.clientWidth / 2 - ((minX + maxX) / 2) * zoom,
      panY: container.clientHeight / 2 - ((minY + maxY) / 2) * zoom,
    })
  }, [planVisibleObjects])

  useEffect(() => {
    if (hasInitialFitRef.current || planVisibleObjects.length === 0) return
    const frame = requestAnimationFrame(() => {
      fitView()
      hasInitialFitRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, planVisibleObjects.length])


  return { viewport, setViewport, fitView }
}
