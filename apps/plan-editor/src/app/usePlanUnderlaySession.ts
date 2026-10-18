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
  const allUnderlays = [underlay, ...(underlay.additional_layers ?? [])]
  canCalibrateUnderlayRef.current = allUnderlays.some(layer => !!layer.image && layer.visible)
  const calibrationPointsRef = useRef<{ first: [number, number]; second: [number, number] } | null>(null)

  useEffect(() => {
    const savedEntries = Object.entries(project.underlays ?? {}).filter(([key, saved]) =>
      key === underlayKey || (saved.view_id === viewMode && saved.level_id === activeLevelId),
    )
    const signature = `${underlayKey}:${savedEntries.map(([key, saved]) => `${key}:${saved.data_url}:${saved.visible}`).join('|')}`
    if (hydratedUnderlayRef.current === signature) return
    let isCurrent = true
    const loaded = Promise.all(savedEntries.map(([key, saved]) => new Promise<UnderlayConfig | null>(resolve => {
      const image = new Image()
      image.onload = () => {
        image.dataset.projectSrc = saved.data_url
        resolve({
          image, storage_key: key, drawing_id: saved.drawing_id, display_name: saved.display_name,
          view_id: saved.view_id, level_id: saved.level_id, source_file: saved.source_file,
          source_kind: saved.source_kind, source_layout: saved.source_layout, source_region: saved.source_region,
          scale_source: saved.scale_source, origin_mm: saved.origin_mm, scale_mm_per_px: saved.scale_mm_per_px,
          rotation_deg: saved.rotation_deg, opacity: saved.opacity, visible: saved.visible,
        })
      }
      image.onerror = () => resolve(null)
      image.src = saved.data_url
    })))
    void loaded.then(layers => {
      if (!isCurrent) return
      hydratedUnderlayRef.current = signature
      const validLayers = layers.filter((layer): layer is UnderlayConfig => layer !== null)
      const legacy = validLayers.find(layer => layer.storage_key === underlayKey && !layer.drawing_id)
      const primary = legacy ?? validLayers[0]
      const additional = validLayers.filter(layer => layer !== primary)
      setUnderlay(primary
        ? { ...primary, additional_layers: additional }
        : { image: null, origin_mm: [0, 0], scale_mm_per_px: 10, opacity: 0.6, visible: true, rotation_deg: 0, additional_layers: [] })
    })
    return () => {
      isCurrent = false
    }
  }, [project.underlays, underlayKey, viewMode, activeLevelId, setUnderlay])

  useEffect(() => {
    const toProjectUnderlay = (layer: UnderlayConfig) => {
      const image = layer.image
      const dataUrl = image?.dataset.projectSrc
      if (!image || !dataUrl || !dataUrl.startsWith('data:image/')) return null
      return {
        data_url: dataUrl,
        ...(layer.drawing_id ? { drawing_id: layer.drawing_id } : {}),
        ...(layer.display_name ? { display_name: layer.display_name } : {}),
        ...(layer.view_id ? { view_id: layer.view_id as import('@constructflow/project-model').ProjectViewId } : {}),
        ...(layer.level_id ? { level_id: layer.level_id } : {}),
        ...(layer.source_file ? { source_file: layer.source_file } : {}),
        ...(layer.source_kind ? { source_kind: layer.source_kind } : {}),
        ...(layer.source_layout ? { source_layout: layer.source_layout } : {}),
        ...(layer.source_region ? { source_region: layer.source_region } : {}),
        ...(layer.scale_source ? { scale_source: layer.scale_source } : {}),
        origin_mm: layer.origin_mm, scale_mm_per_px: layer.scale_mm_per_px,
        rotation_deg: layer.rotation_deg ?? 0, opacity: layer.opacity, visible: layer.visible,
      }
    }
    const layers = allUnderlays
    const values = layers.map(layer => ({ key: layer.storage_key ?? underlayKey, value: toProjectUnderlay(layer) })).filter((entry): entry is { key: string; value: NonNullable<ReturnType<typeof toProjectUnderlay>> } => !!entry.value)
    if (!values.length) return
    const timer = window.setTimeout(() => setProjectState(current => {
      const next = { ...(current.underlays ?? {}) }
      let changed = false
      for (const { key, value } of values) {
        if (next[key] && JSON.stringify(next[key]) === JSON.stringify(value)) continue
        next[key] = value
        changed = true
      }
      if (!changed) return current
      const updated = { ...current, underlays: next }
      sessionRef.current?.commit(updated)
      return updated
    }), 180)
    return () => window.clearTimeout(timer)
  }, [underlay, underlayKey, sessionRef, setProjectState])

  const clearUnderlay = () => {
    setUnderlay({ image: null, origin_mm: [0, 0], scale_mm_per_px: 10, opacity: 0.6, visible: true, rotation_deg: 0, additional_layers: [] })
    setProjectState(current => {
      if (!current.underlays) return current
      const underlays = { ...current.underlays }
      delete underlays[underlayKey]
      for (const [key, layer] of Object.entries(underlays)) {
        if (layer.view_id === viewMode && layer.level_id === activeLevelId) delete underlays[key]
      }
      const updated = { ...current, underlays }
      sessionRef.current?.commit(updated)
      return updated
    })
    hydratedUnderlayRef.current = underlayKey
  }

  const toggleAllUnderlays = () => {
    const nextVisible = !allUnderlays.some(layer => layer.image && layer.visible)
    setUnderlay(current => ({ ...current, visible: nextVisible, additional_layers: (current.additional_layers ?? []).map(layer => ({ ...layer, visible: nextVisible })) }))
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
    toggleAllUnderlays,
    applyCalibrationScale,
  }
}
