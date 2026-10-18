import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction, type WheelEvent } from 'react'
import type { SmartObject, CabinetModuleData } from '@constructflow/project-model'
import { isGridObject } from '@constructflow/project-model'
import { cabinetFootprintPoints } from './PlanCanvasGeometry.js'
import { coordinatedPlanViewportFromScreen, screenViewportFromCoordinatedPlan, zoomAtScreenPoint, type CoordinatedPlanViewport, type ViewportState } from '../viewport/viewportTransform.js'

export const usePlanCanvasViewport = (
  containerRef: { current: HTMLDivElement | null },
  planVisibleObjects: readonly SmartObject[],
  referencePoints: readonly [number, number][] = [],
  sharedViewport?: CoordinatedPlanViewport | null,
  onSharedViewportChange?: (viewport: CoordinatedPlanViewport) => void,
) => {
  const hasInitialFitRef = useRef(false)
  const [localViewport, setLocalViewport] = useState<ViewportState>({ panX: 400, panY: 300, zoom: 0.08 })
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 })
  const viewport = sharedViewport
    ? screenViewportFromCoordinatedPlan(sharedViewport, containerSize)
    : localViewport
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateSize = () => setContainerSize({ width: Math.max(container.clientWidth, 1), height: Math.max(container.clientHeight, 1) })
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])
  const setViewport = useCallback<Dispatch<SetStateAction<ViewportState>>>(nextOrUpdater => {
    const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(viewportRef.current) : nextOrUpdater
    viewportRef.current = next
    setLocalViewport(next)
    const container = containerRef.current
    const size = container
      ? { width: Math.max(container.clientWidth, 1), height: Math.max(container.clientHeight, 1) }
      : containerSize
    onSharedViewportChange?.(coordinatedPlanViewportFromScreen(next, size))
  }, [containerRef, containerSize, onSharedViewportChange])

  const handleWheel = useCallback((event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenPoint: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
    setViewport(current => zoomAtScreenPoint(current, screenPoint, event.deltaY < 0 ? 1.15 : 0.85))
  }, [containerRef])

  const fitView = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const points: [number, number][] = [...referencePoints]
    const pointKeys = ['location_mm', 'center_mm', 'start_point_mm', 'end_point_mm', 'origin_mm']
    const polygonKeys = ['boundary_mm', 'vertices_mm', 'outline_mm', 'points_mm', 'path_mm']
    for (const object of planVisibleObjects) {
      if (isGridObject(object)) continue
      const data = object.module_data as Record<string, unknown>
      if (object.object_type === 'interior.cabinet_run') {
        points.push(...cabinetFootprintPoints(object.module_data as unknown as CabinetModuleData))
      }
      if (['interior.furniture', 'family.instance'].includes(object.object_type)) {
        const d = data as { location_mm: [number, number, number]; width_mm: number; depth_mm: number; rotation_deg: number }
        const angle = Number(d.rotation_deg ?? 0) * Math.PI / 180
        const bounds = data.family_bounds_mm as [number,number,number,number] | undefined
        const [left,top,right,bottom] = bounds ?? [0,0,d.width_mm,d.depth_mm]
        for (const [u, v] of [[left, top], [right, top], [right, bottom], [left, bottom]]) points.push([
          d.location_mm[0] + u * Math.cos(angle) - v * Math.sin(angle),
          d.location_mm[1] + u * Math.sin(angle) + v * Math.cos(angle),
        ])
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
  }, [planVisibleObjects, referencePoints])

  useEffect(() => {
    if (sharedViewport) {
      hasInitialFitRef.current = true
      return
    }
    if (hasInitialFitRef.current || planVisibleObjects.length === 0) return
    const frame = requestAnimationFrame(() => {
      fitView()
      hasInitialFitRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, planVisibleObjects.length, sharedViewport])


  return { viewport, setViewport, fitView, handleWheel }
}
