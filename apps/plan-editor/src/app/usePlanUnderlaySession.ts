import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { useProjectSession } from './useProjectSession.js'
import type { EditorViewMode } from './useMultiViewPreferences.js'
import type { UnderlayConfig } from '../rendering/planRenderer.js'
import type { ToolType } from '../components/Toolbar.js'

interface UsePlanUnderlaySessionOptions {
  project: ProjectDocument
  viewMode: EditorViewMode
  activeLevelId: string
  sessionRef: ReturnType<typeof useProjectSession>['sessionRef']
  setProjectState: Dispatch<SetStateAction<ProjectDocument>>
  setActiveTool: (tool: ToolType) => void
}

/** Owns per-view/level reference-underlay hydration, persistence, calibration, and clearing. */
export function usePlanUnderlaySession({
  project, viewMode, activeLevelId, sessionRef, setProjectState, setActiveTool,
}: UsePlanUnderlaySessionOptions) {
  const [underlay, setUnderlay] = useState<UnderlayConfig>({
    image: null,
    origin_mm: [0, 0],
    scale_mm_per_px: 10,
    opacity: 0.6,
    visible: true,
    rotation_deg: 0,
  })
  const underlayKey = `${viewMode}:${activeLevelId}`
  const hydratedUnderlayRef = useRef<string | null>(null)
  const canCalibrateUnderlayRef = useRef(false)
  canCalibrateUnderlayRef.current = !!underlay.image && underlay.visible
  const calibrationPointsRef = useRef<{ first: [number, number]; second: [number, number] } | null>(null)

  useEffect(() => {
    const saved = project.underlays?.[underlayKey]
    if (!saved) {
      if (hydratedUnderlayRef.current !== underlayKey) {
        hydratedUnderlayRef.current = underlayKey
        setUnderlay(current => ({ ...current, image: null }))
      }
      return
    }
    if (hydratedUnderlayRef.current === `${underlayKey}:${saved.data_url}`) return
    let isCurrent = true
    const image = new Image()
    image.onload = () => {
      if (!isCurrent) return
      image.dataset.projectSrc = saved.data_url
      hydratedUnderlayRef.current = `${underlayKey}:${saved.data_url}`
      setUnderlay({ image, source_file: saved.source_file, scale_source: saved.scale_source, origin_mm: saved.origin_mm, scale_mm_per_px: saved.scale_mm_per_px, rotation_deg: saved.rotation_deg, opacity: saved.opacity, visible: saved.visible })
    }
    image.onerror = () => { if (isCurrent) hydratedUnderlayRef.current = `${underlayKey}:${saved.data_url}` }
    image.src = saved.data_url
    return () => {
      isCurrent = false
      image.onload = null
      image.onerror = null
    }
  }, [project.underlays, underlayKey])

  useEffect(() => {
    const image = underlay.image
    const dataUrl = image?.dataset.projectSrc
    if (!image || !dataUrl || !dataUrl.startsWith('data:image/')) return
    const value = { data_url: dataUrl, ...(underlay.source_file ? { source_file: underlay.source_file } : {}), ...(underlay.scale_source ? { scale_source: underlay.scale_source } : {}), origin_mm: underlay.origin_mm, scale_mm_per_px: underlay.scale_mm_per_px, rotation_deg: underlay.rotation_deg ?? 0, opacity: underlay.opacity, visible: underlay.visible }
    const timer = window.setTimeout(() => setProjectState(current => {
      const existing = current.underlays?.[underlayKey]
      if (existing && JSON.stringify(existing) === JSON.stringify(value)) return current
      const updated = { ...current, underlays: { ...current.underlays, [underlayKey]: value } }
      sessionRef.current?.commit(updated)
      return updated
    }), 180)
    return () => window.clearTimeout(timer)
  }, [underlay, underlayKey, sessionRef, setProjectState])

  const clearUnderlay = () => {
    setUnderlay(current => ({ ...current, image: null }))
    setProjectState(current => {
      if (!current.underlays?.[underlayKey]) return current
      const underlays = { ...current.underlays }
      delete underlays[underlayKey]
      const updated = { ...current, underlays }
      sessionRef.current?.commit(updated)
      return updated
    })
    hydratedUnderlayRef.current = underlayKey
  }

  const applyCalibrationScale = (newScale: number, axis: 'x' | 'y') => {
    const points = calibrationPointsRef.current
    setUnderlay(previous => ({
      ...previous,
      scale_source: 'calibrated',
      scale_mm_per_px: newScale,
      ...(points ? (() => {
        const dx = (points.second[0] - points.first[0]) / previous.scale_mm_per_px
        const dy = (points.second[1] - points.first[1]) / previous.scale_mm_per_px
        const rotation = (axis === 'x' ? 0 : Math.PI / 2) - Math.atan2(dy, dx)
        const cos = Math.cos(rotation), sin = Math.sin(rotation)
        const px = (points.first[0] - previous.origin_mm[0]) / previous.scale_mm_per_px
        const py = (points.first[1] - previous.origin_mm[1]) / previous.scale_mm_per_px
        return {
          rotation_deg: (previous.rotation_deg ?? 0) + rotation * 180 / Math.PI,
          origin_mm: [
            points.first[0] - (px * cos - py * sin) * newScale,
            points.first[1] - (px * sin + py * cos) * newScale,
          ] as [number, number],
        }
      })() : {}),
    }))
    setActiveTool('select')
  }

  return {
    underlay,
    setUnderlay,
    underlayKey,
    hydratedUnderlayRef,
    canCalibrateUnderlayRef,
    calibrationPointsRef,
    clearUnderlay,
    applyCalibrationScale,
  }
}
