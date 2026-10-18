import React, { useState, useRef, useEffect } from 'react'
import {
  Camera,
  Upload,
  X,
  Zap,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  MoveHorizontal,
  FileText,
  Compass,
  Square,
  Plus,
  MapPin,
  Maximize2,
  Scissors,
  Layers,
  Grid,
  Package,
} from 'lucide-react'
import {
  type PhotoDimensionLine,
  type PhotoDimensionSession,
  type PhotoAreaBox,
  type SubSegment,
  type DimensionCategory,
  type AreaCategory,
  type LaserMeasurementResult,
  type TileCalculationConfig,
  type TileSizePreset,
  STANDARD_TILE_PRESETS,
  calculateTileRequirement,
  createNewPhotoDimensionLine,
  createNewPhotoAreaBox,
  recalculateAreaBox,
  renderDimensionOverlays,
  renderAreaOverlays,
  exportAnnotatedPhotoImage,
} from '@constructflow/laser-survey'

import { getGlobalLaserDriver } from './LaserBleHudPill.js'

export interface PhotoDimensionModalProps {
  isOpen: boolean
  onClose: () => void
  currentRoomName?: string
  activeLevelId?: string
  initialSession?: PhotoDimensionSession | null
  onSaveSession?: (session: PhotoDimensionSession) => void
}

export const PhotoDimensionModal: React.FC<PhotoDimensionModalProps> = ({
  isOpen,
  onClose,
  currentRoomName = 'ห้องทั่วไป',
  activeLevelId = 'level-1f',
  initialSession = null,
  onSaveSession,
}) => {
  // Session State
  const [sessionId, setSessionId] = useState<string>(() => initialSession?.id ?? `photo-session-${Date.now()}`)
  const [sessionTitle, setSessionTitle] = useState<string>(() => initialSession?.title ?? `${currentRoomName} - วัดระยะหน้างาน`)
  const [imageSrc, setImageSrc] = useState<string | null>(() => initialSession?.image_data_url ?? null)
  const [dimensions, setDimensions] = useState<PhotoDimensionLine[]>(() => initialSession?.dimensions ?? [])
  const [areas, setAreas] = useState<PhotoAreaBox[]>(() => initialSession?.areas ?? [])
  const [pinCoordsMm, setPinCoordsMm] = useState<[number, number] | null>(() => initialSession?.pin_coords_mm ?? null)
  const [cameraHeadingDeg, setCameraHeadingDeg] = useState<number>(() => initialSession?.camera_heading_deg ?? 0)

  // Editor Interaction State
  const [activeMode, setActiveMode] = useState<'dimension' | 'area'>('dimension')
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)

  // Line creation parameters
  const [activeCategory, setActiveCategory] = useState<DimensionCategory>('interior')
  const [lineLabel, setLineLabel] = useState<string>('ระยะวัดหน้างาน')
  const [lineNotes, setLineNotes] = useState<string>('')

  // Area creation parameters
  const [areaCategory, setAreaCategory] = useState<AreaCategory>('paint')
  const [areaLabel, setAreaLabel] = useState<string>('ผนังทาสี')

  // Drawing state
  const [isDrawing, setIsDrawing] = useState<boolean>(false)
  const [drawStartRatio, setDrawStartRatio] = useState<[number, number] | null>(null)
  const [currentDragRatio, setCurrentDragRatio] = useState<[number, number] | null>(null)

  // Laser BLE Live state
  const [laserLiveDistMm, setLaserLiveDistMm] = useState<number>(0)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawCanvasRef = useRef<() => void>(() => {})
  const imageElementRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Sync initialSession if changed
  useEffect(() => {
    if (initialSession) {
      setSessionId(initialSession.id)
      setSessionTitle(initialSession.title)
      setImageSrc(initialSession.image_data_url)
      setDimensions(initialSession.dimensions ?? [])
      setAreas(initialSession.areas ?? [])
      setPinCoordsMm(initialSession.pin_coords_mm ?? null)
      setCameraHeadingDeg(initialSession.camera_heading_deg ?? 0)
    }
  }, [initialSession])

  // Listen to Xiaomi Laser BLE Driver
  useEffect(() => {
    const driver = getGlobalLaserDriver()
    const last = driver.getLastMeasurement()
    if (last) setLaserLiveDistMm(last.distance_mm)

    driver.setEvents({
      onMeasurement: (measure: LaserMeasurementResult) => {
        setLaserLiveDistMm(measure.distance_mm)
        // Auto-stamp if a line is currently selected in dimension mode
        if (activeMode === 'dimension' && selectedLineId) {
          applyDistanceToLine(selectedLineId, measure.distance_mm)
          showFeedback(`ประทับระยะ ${measure.distance_m.toFixed(3)} ม. จากเลเซอร์แล้ว!`)
        }
      },
    })
  }, [selectedLineId, activeMode])

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg)
    setTimeout(() => setFeedbackMsg(null), 3000)
  }

  // Handle Photo File selection / Camera capture
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const src = event.target?.result as string
      setImageSrc(src)
      setDimensions([])
      setAreas([])
      setSelectedLineId(null)
      setSelectedAreaId(null)
    }
    reader.readAsDataURL(file)
  }

  // Load image into HTMLImageElement
  useEffect(() => {
    if (!imageSrc) return
    const img = new Image()
    img.src = imageSrc
    img.onload = () => {
      imageElementRef.current = img
      drawCanvas()
    }
  }, [imageSrc])

  // Redraw Canvas
  const drawCanvas = () => {
    const canvas = canvasRef.current
    const img = imageElementRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Fit canvas to parent container while preserving aspect ratio
    const parentWidth = canvas.parentElement?.clientWidth ?? 800
    const parentHeight = canvas.parentElement?.clientHeight ?? 600
    const imgAspect = img.naturalWidth / img.naturalHeight

    let renderW = parentWidth
    let renderH = parentWidth / imgAspect

    if (renderH > parentHeight) {
      renderH = parentHeight
      renderW = parentHeight * imgAspect
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.style.width = `${renderW}px`
    canvas.style.height = `${renderH}px`
    canvas.width = Math.max(1, Math.round(renderW * dpr))
    canvas.height = Math.max(1, Math.round(renderH * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, renderW, renderH)
    ctx.drawImage(img, 0, 0, renderW, renderH)

    // 1. Render Area Overlays
    const renderedAreas = [...areas]
    if (isDrawing && activeMode === 'area' && drawStartRatio && currentDragRatio) {
      const rx = Math.min(drawStartRatio[0], currentDragRatio[0])
      const ry = Math.min(drawStartRatio[1], currentDragRatio[1])
      const rw = Math.abs(currentDragRatio[0] - drawStartRatio[0])
      const rh = Math.abs(currentDragRatio[1] - drawStartRatio[1])
      renderedAreas.push(createNewPhotoAreaBox([rx, ry, rw, rh], 3000, 2600, areaLabel, areaCategory))
    }

    renderAreaOverlays(ctx, renderW, renderH, renderedAreas, {
      selectedAreaId,
      lineWidth: 2.0,
      showLabels: true,
    })

    // 2. Render Dimension Overlays
    const renderedLines = [...dimensions]
    if (isDrawing && activeMode === 'dimension' && drawStartRatio && currentDragRatio) {
      const previewLine = createNewPhotoDimensionLine(
        drawStartRatio,
        currentDragRatio,
        laserLiveDistMm,
        lineLabel,
        activeCategory
      )
      renderedLines.push(previewLine)
    }

    renderDimensionOverlays(ctx, renderW, renderH, renderedLines, {
      selectedLineId,
      unit: 'm',
      showLabels: true,
      lineWidth: 2.5,
    })
  }

  drawCanvasRef.current = drawCanvas

  useEffect(() => {
    drawCanvas()
  }, [dimensions, areas, selectedLineId, selectedAreaId, isDrawing, currentDragRatio, activeMode])

  useEffect(() => {
    if (!imageSrc) return
    const parent = canvasRef.current?.parentElement
    if (!parent) return
    const redraw = () => drawCanvasRef.current()
    const observer = new ResizeObserver(redraw)
    observer.observe(parent)
    window.addEventListener('resize', redraw)
    return () => { observer.disconnect(); window.removeEventListener('resize', redraw) }
  }, [imageSrc])

  // Pointer Event Handlers for Stylus (Huawei M-Pencil) & Touch with Palm Rejection
  const getCanvasRatioCoords = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    return [x, y]
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Palm Rejection: Accept only stylus or primary mouse/touch
    if (e.pointerType === 'touch' && !e.isPrimary) return

    const coords = getCanvasRatioCoords(e)
    if (!coords) return

    const canvas = canvasRef.current
    if (!canvas) return

    if (activeMode === 'dimension') {
      const clickX = coords[0] * canvas.width
      const clickY = coords[1] * canvas.height

      let foundLineId: string | null = null
      for (const line of dimensions) {
        const lx1 = line.start_ratio[0] * canvas.width
        const ly1 = line.start_ratio[1] * canvas.height
        const lx2 = line.end_ratio[0] * canvas.width
        const ly2 = line.end_ratio[1] * canvas.height

        const dist = pointToLineDistance(clickX, clickY, lx1, ly1, lx2, ly2)
        if (dist <= 18 * Math.min(window.devicePixelRatio || 1, 2)) {
          foundLineId = line.id
          break
        }
      }

      if (foundLineId) {
        setSelectedLineId(foundLineId)
        setSelectedAreaId(null)
        const selected = dimensions.find((d) => d.id === foundLineId)
        if (selected) {
          setLineLabel(selected.label)
          setLineNotes(selected.notes ?? '')
          setActiveCategory(selected.category)
        }
        return
      }
    } else if (activeMode === 'area') {
      // Check if clicking inside an existing area box
      const rx = coords[0]
      const ry = coords[1]
      const foundArea = areas.find((a) => {
        const [bx, by, bw, bh] = a.bounds_ratio
        return rx >= bx && rx <= bx + bw && ry >= by && ry <= by + bh
      })

      if (foundArea) {
        setSelectedAreaId(foundArea.id)
        setSelectedLineId(null)
        setAreaLabel(foundArea.label)
        setAreaCategory(foundArea.category)
        return
      }
    }

    // Start drawing a new object
    setIsDrawing(true)
    setDrawStartRatio(coords)
    setCurrentDragRatio(coords)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawStartRatio) return
    const coords = getCanvasRatioCoords(e)
    if (coords) setCurrentDragRatio(coords)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawStartRatio || !currentDragRatio) {
      setIsDrawing(false)
      return
    }

    setIsDrawing(false)
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

    const dist = Math.hypot(currentDragRatio[0] - drawStartRatio[0], currentDragRatio[1] - drawStartRatio[1])
    if (dist < 0.03) return // Ignore accidental tiny taps

    if (activeMode === 'dimension') {
      const newLine = createNewPhotoDimensionLine(
        drawStartRatio,
        currentDragRatio,
        laserLiveDistMm > 0 ? laserLiveDistMm : 0,
        lineLabel,
        activeCategory
      )
      setDimensions([...dimensions, newLine])
      setSelectedLineId(newLine.id)
      setSelectedAreaId(null)
    } else if (activeMode === 'area') {
      const rx = Math.min(drawStartRatio[0], currentDragRatio[0])
      const ry = Math.min(drawStartRatio[1], currentDragRatio[1])
      const rw = Math.abs(currentDragRatio[0] - drawStartRatio[0])
      const rh = Math.abs(currentDragRatio[1] - drawStartRatio[1])

      const newArea = createNewPhotoAreaBox(
        [rx, ry, rw, rh],
        laserLiveDistMm > 0 ? laserLiveDistMm : 3000,
        2600,
        areaLabel,
        areaCategory
      )
      setAreas([...areas, newArea])
      setSelectedAreaId(newArea.id)
      setSelectedLineId(null)
    }

    setDrawStartRatio(null)
    setCurrentDragRatio(null)
  }

  const applyDistanceToLine = (lineId: string, distMm: number) => {
    setDimensions((prev) =>
      prev.map((d) =>
        d.id === lineId
          ? {
              ...d,
              distance_mm: distMm,
              distance_m: Number((distMm / 1000).toFixed(3)),
              status: 'measured',
            }
          : d
      )
    )
  }

  // Multi-Segment Chain Split Handlers
  const handleAddSubSegment = (lineId: string) => {
    const target = dimensions.find((d) => d.id === lineId)
    if (!target) return

    const existing = target.sub_segments ?? []
    const count = existing.length + 1
    const nextRatio = Number(((count) / (count + 1)).toFixed(2))
    const defaultDistMm = Math.round((target.distance_mm || 3000) / (count + 1))

    const newSub: SubSegment = {
      id: `sub-${Date.now()}-${count}`,
      ratio: nextRatio,
      distance_mm: laserLiveDistMm > 0 ? laserLiveDistMm : defaultDistMm,
      distance_m: Number(((laserLiveDistMm > 0 ? laserLiveDistMm : defaultDistMm) / 1000).toFixed(3)),
      label: `ช่วงที่ ${count}`,
    }

    const updatedSubs = [...existing, newSub].sort((a, b) => a.ratio - b.ratio)
    setDimensions(
      dimensions.map((d) => (d.id === lineId ? { ...d, sub_segments: updatedSubs } : d))
    )
    showFeedback(`เพิ่มช่วงวัดย่อยที่ ${count} แล้ว`)
  }

  const handleUpdateSubSegment = (lineId: string, subId: string, updates: Partial<SubSegment>) => {
    setDimensions(
      dimensions.map((d) => {
        if (d.id !== lineId) return d
        const updatedSubs = (d.sub_segments ?? []).map((s) => {
          if (s.id !== subId) return s
          const next = { ...s, ...updates }
          if (updates.distance_mm !== undefined) {
            next.distance_m = Number((updates.distance_mm / 1000).toFixed(3))
          }
          return next
        })
        return { ...d, sub_segments: updatedSubs }
      })
    )
  }

  const handleDeleteSubSegment = (lineId: string, subId: string) => {
    setDimensions(
      dimensions.map((d) => {
        if (d.id !== lineId) return d
        return {
          ...d,
          sub_segments: (d.sub_segments ?? []).filter((s) => s.id !== subId),
        }
      })
    )
  }

  // Area Box Update Handlers
  const handleUpdateArea = (areaId: string, updates: Partial<PhotoAreaBox>) => {
    setAreas(
      areas.map((a) => {
        if (a.id !== areaId) return a
        const updated = { ...a, ...updates }
        return recalculateAreaBox(updated)
      })
    )
  }

  const handleDeleteArea = (areaId: string) => {
    setAreas(areas.filter((a) => a.id !== areaId))
    if (selectedAreaId === areaId) setSelectedAreaId(null)
  }

  const handleDeleteSelected = () => {
    if (selectedLineId) {
      setDimensions(dimensions.filter((d) => d.id !== selectedLineId))
      setSelectedLineId(null)
    } else if (selectedAreaId) {
      setAreas(areas.filter((a) => a.id !== selectedAreaId))
      setSelectedAreaId(null)
    }
  }

  // Save Session & Pin to 2D Plan
  const handleSaveAndPinSession = () => {
    if (!imageSrc || !imageElementRef.current) return

    const session: PhotoDimensionSession = {
      id: sessionId,
      title: sessionTitle,
      room_name: currentRoomName,
      image_data_url: imageSrc,
      image_natural_width: imageElementRef.current.naturalWidth,
      image_natural_height: imageElementRef.current.naturalHeight,
      captured_at: new Date().toISOString(),
      dimensions,
      areas,
      pin_coords_mm: pinCoordsMm ?? [2000, 2000],
      camera_heading_deg: cameraHeadingDeg,
      level_id: activeLevelId,
    }

    if (onSaveSession) {
      onSaveSession(session)
    }
    showFeedback('📍 บันทึกหมุดรูปถ่ายและมุมกล้องลงบนแปลน 2D แล้ว!')
  }

  // Export Photo
  const handleExportPhoto = async () => {
    if (!imageSrc || !imageElementRef.current) return
    const session: PhotoDimensionSession = {
      id: sessionId,
      title: sessionTitle,
      room_name: currentRoomName,
      image_data_url: imageSrc,
      image_natural_width: imageElementRef.current.naturalWidth,
      image_natural_height: imageElementRef.current.naturalHeight,
      captured_at: new Date().toISOString(),
      dimensions,
      areas,
      pin_coords_mm: pinCoordsMm ?? undefined,
      camera_heading_deg: cameraHeadingDeg,
      level_id: activeLevelId,
    }

    try {
      const exportUrl = await exportAnnotatedPhotoImage(session, 'm')
      const a = document.createElement('a')
      a.href = exportUrl
      a.download = `ConstructFlow-${currentRoomName}-${Date.now()}.jpg`
      a.click()
      showFeedback('ส่งออกรูปภาพพร้อมขนาดและพื้นที่สำเร็จ!')
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  if (!isOpen) return null

  const selectedLine = dimensions.find((d) => d.id === selectedLineId)
  const selectedArea = areas.find((a) => a.id === selectedAreaId)

  return (
    <div
      className="cf-photo-dimension-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 8, 15, 0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header */}
      <header
        className="cf-photo-dimension-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          background: '#0B0F17',
          borderBottom: '1px solid #232F46',
          color: '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '6px', borderRadius: '6px', background: '#1E293B', color: '#00E5FF' }}>
            <Camera size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  background: 'transparent',
                  border: '1px solid transparent',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  outline: 'none',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#00E5FF')}
                onBlur={(e) => (e.target.style.borderColor = 'transparent')}
              />
              <span style={{ fontSize: '11px', color: '#64748B' }}>({currentRoomName})</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>
              {activeMode === 'dimension'
                ? 'โหมดเส้นตรง: ลากเส้นวัดระยะ / แบ่งช่วงวัดย่อย แล้วกดยิงเลเซอร์ประทับตัวเลข'
                : 'โหมดคำนวณพื้นที่: วาดกรอบสี่เหลี่ยมบนผนัง/พื้น เพื่อคำนวณ ตร.ม. งานสีและกระเบื้อง'}
            </div>
          </div>
        </div>

        {/* Mode Switcher Pills */}
        <div
          style={{
            display: 'flex',
            background: '#131B2A',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #232F46',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveMode('dimension')
              setSelectedAreaId(null)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeMode === 'dimension' ? '#00E5FF' : 'transparent',
              color: activeMode === 'dimension' ? '#0B0F17' : '#94A3B8',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <MoveHorizontal size={14} />
            <span>เส้นวัดระยะ (Dimension)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMode('area')
              setSelectedLineId(null)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeMode === 'area' ? '#10B981' : 'transparent',
              color: activeMode === 'area' ? '#FFFFFF' : '#94A3B8',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Square size={14} />
            <span>คำนวณพื้นที่ (Area m²)</span>
          </button>
        </div>

        {/* Right Actions Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {feedbackMsg && (
            <div
              style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                background: '#10B981',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {feedbackMsg}
            </div>
          )}

          {imageSrc && (
            <>
              <button
                type="button"
                onClick={handleSaveAndPinSession}
                title="ปักหมุดตำแหน่งรูปถ่ายลงบนแบบแปลน 2D"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #10B981',
                  background: '#062B1D',
                  color: '#10B981',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <MapPin size={14} />
                <span>ปักหมุดลงแปลน 2D</span>
              </button>

              <button
                type="button"
                onClick={handleExportPhoto}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #00E5FF',
                  background: '#0B132B',
                  color: '#00E5FF',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <Download size={14} />
                <span>ดาวน์โหลดรูป (JPEG)</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: '#1E293B',
              color: '#94A3B8',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="cf-photo-dimension-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Canvas Area */}
        <div
          className="cf-photo-dimension-stage"
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#06090E',
            padding: '16px',
            overflow: 'hidden',
          }}
        >
          {!imageSrc ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
                border: '2px dashed #334155',
                borderRadius: '12px',
                color: '#94A3B8',
                textAlign: 'center',
                maxWidth: '450px',
              }}
            >
              <Camera size={48} style={{ color: '#00E5FF', marginBottom: '16px', opacity: 0.8 }} />
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                ถ่ายรูปหน้างาน หรือ เลือกรูปจากเครื่อง
              </div>
              <div style={{ fontSize: '12px', marginBottom: '20px', lineHeight: 1.5 }}>
                ถ่ายภาพผนังบิวท์อิน, ช่องเปิดประตูหน้าต่าง, รอยร้าว, หรือพื้นที่ทาสี เพื่อวัดระยะและคำนวณ ตร.ม. ทันที
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#00E5FF',
                  color: '#0B0F17',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <Camera size={16} />
                <span>เปิดกล้อง / เลือกรูปถ่าย</span>
              </button>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{
                touchAction: 'none', // Palm rejection
                cursor: 'crosshair',
                borderRadius: '8px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              }}
            />
          )}
        </div>

        {/* Right Inspector Sidebar */}
        {imageSrc && (
          <aside
            className="cf-photo-dimension-inspector"
            style={{
              width: '340px',
              background: '#0B0F17',
              borderLeft: '1px solid #232F46',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              overflowY: 'auto',
            }}
          >
            {/* Live Laser Stamp Box */}
            <div
              style={{
                background: '#131B2A',
                border: '1px solid #232F46',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>ระยะสดจากเลเซอร์ XIAOMI:</span>
                <span style={{ color: '#FF3B30', display: 'flex', alignItems: 'center' }}>
                  <Zap size={14} fill="#FF3B30" />
                </span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace', color: '#00E5FF', marginBottom: '8px' }}>
                {laserLiveDistMm > 0 ? `${(laserLiveDistMm / 1000).toFixed(3)} m` : '--.--- m'}
              </div>
              <button
                type="button"
                disabled={(!selectedLineId && !selectedAreaId) || laserLiveDistMm <= 0}
                onClick={() => {
                  if (activeMode === 'dimension' && selectedLineId && laserLiveDistMm > 0) {
                    applyDistanceToLine(selectedLineId, laserLiveDistMm)
                    showFeedback(`สแตมป์ระยะ ${(laserLiveDistMm / 1000).toFixed(3)} ม. แล้ว`)
                  } else if (activeMode === 'area' && selectedAreaId && laserLiveDistMm > 0) {
                    handleUpdateArea(selectedAreaId, { width_mm: laserLiveDistMm })
                    showFeedback(`สแตมป์ความกว้าง ${(laserLiveDistMm / 1000).toFixed(3)} ม. แล้ว`)
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #00E5FF',
                  background: (selectedLineId || selectedAreaId) && laserLiveDistMm > 0 ? '#00E5FF' : '#1E293B',
                  color: (selectedLineId || selectedAreaId) && laserLiveDistMm > 0 ? '#0B0F17' : '#64748B',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: (selectedLineId || selectedAreaId) && laserLiveDistMm > 0 ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Zap size={14} />
                <span>
                  {activeMode === 'dimension'
                    ? 'สแตมป์ระยะใส่เส้นที่เลือก'
                    : 'สแตมป์ความกว้างผนัง (Width)'}
                </span>
              </button>
            </div>

            {/* Feature 1: Pin to 2D Plan & Camera Direction */}
            <div
              style={{
                background: '#131B2A',
                border: '1px solid #232F46',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="#10B981" />
                  <span>ปักหมุดแปลน 2D & ทิศทางกล้อง</span>
                </span>
                <span style={{ fontSize: '11px', color: pinCoordsMm ? '#10B981' : '#F59E0B', fontWeight: 600 }}>
                  {pinCoordsMm ? 'ปักหมุดแล้ว' : 'ยังไม่ปัก'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: '#94A3B8', display: 'block' }}>พิกัด X (m):</label>
                  <input
                    type="number"
                    step="0.05"
                    value={pinCoordsMm ? Number((pinCoordsMm[0] / 1000).toFixed(2)) : ''}
                    placeholder="2.00"
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0
                      setPinCoordsMm([Math.round(val * 1000), pinCoordsMm ? pinCoordsMm[1] : 2000])
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid #334155',
                      background: '#1E293B',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: '#94A3B8', display: 'block' }}>พิกัด Y (m):</label>
                  <input
                    type="number"
                    step="0.05"
                    value={pinCoordsMm ? Number((pinCoordsMm[1] / 1000).toFixed(2)) : ''}
                    placeholder="2.00"
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0
                      setPinCoordsMm([pinCoordsMm ? pinCoordsMm[0] : 2000, Math.round(val * 1000)])
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid #334155',
                      background: '#1E293B',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>

              {/* Camera Heading Degrees */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '10px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Compass size={12} />
                    <span>มุมมองกล้อง (FOV Cone):</span>
                  </label>
                  <span style={{ fontSize: '11px', color: '#00E5FF', fontFamily: 'monospace', fontWeight: 700 }}>
                    {cameraHeadingDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={cameraHeadingDeg}
                  onChange={(e) => setCameraHeadingDeg(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: '#00E5FF', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  {[
                    { label: 'เหนือ 0°', deg: 0 },
                    { label: 'ออก 90°', deg: 90 },
                    { label: 'ใต้ 180°', deg: 180 },
                    { label: 'ตก 270°', deg: 270 },
                  ].map((preset) => (
                    <button
                      key={preset.deg}
                      type="button"
                      onClick={() => setCameraHeadingDeg(preset.deg)}
                      style={{
                        flex: 1,
                        padding: '3px 2px',
                        borderRadius: '4px',
                        border: '1px solid #334155',
                        background: cameraHeadingDeg === preset.deg ? '#00E5FF' : '#1E293B',
                        color: cameraHeadingDeg === preset.deg ? '#0B0F17' : '#94A3B8',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* MODE 1: Selected Line Properties & Multi-Segment Chain */}
            {activeMode === 'dimension' && (
              <>
                {selectedLine ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>เส้นบอกระยะที่เลือก</span>
                      <button
                        type="button"
                        onClick={handleDeleteSelected}
                        style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px' }}
                        title="ลบเส้นนี้"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                        ป้ายชื่อระยะ:
                      </label>
                      <input
                        type="text"
                        value={lineLabel}
                        onChange={(e) => {
                          setLineLabel(e.target.value)
                          setDimensions(dimensions.map((d) => (d.id === selectedLineId ? { ...d, label: e.target.value } : d)))
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #334155',
                          background: '#1E293B',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                        ระยะทางรวม (มม. / เมตร):
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={selectedLine.distance_mm || ''}
                        placeholder="พิมพ์ระยะ หรือ กดยิงเลเซอร์"
                        onChange={(e) => {
                          const mm = parseInt(e.target.value, 10) || 0
                          applyDistanceToLine(selectedLine.id, mm)
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #334155',
                          background: '#1E293B',
                          color: '#00E5FF',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          fontSize: '14px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Feature 3: Continuous Multi-Segment Chain Section */}
                    <div
                      style={{
                        background: '#131B2A',
                        border: '1px solid #232F46',
                        borderRadius: '6px',
                        padding: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#00E5FF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Scissors size={13} />
                          <span>ช่วงวัดย่อยต่อเนื่อง (Chain)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddSubSegment(selectedLine.id)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid #00E5FF',
                            background: '#0B132B',
                            color: '#00E5FF',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Plus size={11} />
                          <span>แบ่งช่วง</span>
                        </button>
                      </div>

                      {selectedLine.sub_segments && selectedLine.sub_segments.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {selectedLine.sub_segments.map((seg, idx) => (
                            <div
                              key={seg.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#1E293B',
                                padding: '6px 8px',
                                borderRadius: '4px',
                              }}
                            >
                              <span style={{ fontSize: '10px', color: '#94A3B8', minWidth: '16px' }}>#{idx + 1}</span>
                              <input
                                type="text"
                                value={seg.label ?? ''}
                                placeholder="ชื่อช่วง"
                                onChange={(e) =>
                                  handleUpdateSubSegment(selectedLine.id, seg.id, { label: e.target.value })
                                }
                                style={{
                                  flex: 1,
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#FFFFFF',
                                  fontSize: '11px',
                                }}
                              />
                              <input
                                type="number"
                                step="1"
                                value={seg.distance_mm || ''}
                                placeholder="มม."
                                onChange={(e) =>
                                  handleUpdateSubSegment(selectedLine.id, seg.id, {
                                    distance_mm: parseInt(e.target.value, 10) || 0,
                                  })
                                }
                                style={{
                                  width: '60px',
                                  background: '#0B0F17',
                                  border: '1px solid #334155',
                                  borderRadius: '3px',
                                  color: '#00E5FF',
                                  fontSize: '11px',
                                  fontFamily: 'monospace',
                                  padding: '2px 4px',
                                }}
                              />
                              <button
                                type="button"
                                title="สแตมป์จากเลเซอร์"
                                disabled={laserLiveDistMm <= 0}
                                onClick={() => {
                                  if (laserLiveDistMm > 0) {
                                    handleUpdateSubSegment(selectedLine.id, seg.id, { distance_mm: laserLiveDistMm })
                                    showFeedback(`สแตมป์ช่วง #${idx + 1} ด้วย ${(laserLiveDistMm / 1000).toFixed(3)} ม.`)
                                  }
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: laserLiveDistMm > 0 ? '#00E5FF' : '#64748B',
                                  cursor: laserLiveDistMm > 0 ? 'pointer' : 'default',
                                  padding: '2px',
                                }}
                              >
                                <Zap size={13} />
                              </button>
                              <button
                                type="button"
                                title="ลบช่วงนี้"
                                onClick={() => handleDeleteSubSegment(selectedLine.id, seg.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#EF4444',
                                  cursor: 'pointer',
                                  padding: '2px',
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '10px', color: '#64748B', textAlign: 'center', padding: '6px' }}>
                          ยังไม่มีช่วงย่อย (กด "+ แบ่งช่วง" เพื่อวัดเสาถึงปลั๊ก, ปลั๊กถึงประตู ฯลฯ)
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                        หมวดหมู่งาน:
                      </label>
                      <select
                        value={activeCategory}
                        onChange={(e) => {
                          const cat = e.target.value as DimensionCategory
                          setActiveCategory(cat)
                          setDimensions(dimensions.map((d) => (d.id === selectedLineId ? { ...d, category: cat } : d)))
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #334155',
                          background: '#1E293B',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="interior">ตกแต่งภายใน (Interior Fit-out)</option>
                        <option value="architecture">งานสถาปัตย์ (As-Built ผนัง/ห้อง)</option>
                        <option value="setback">ระยะร่นแนวเขต (Setback กฎกระทรวง 55)</option>
                        <option value="defect">รอยร้าว / ตรวจ Defect</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 10px', color: '#64748B', fontSize: '12px' }}>
                    <MoveHorizontal size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <div>ใช้ปากกา M-Pencil หรือนิ้ว ลากเส้นตรงบนรูปถ่าย เพื่อสร้างเส้นบอกระยะ</div>
                  </div>
                )}

                {/* Dimension Lines List */}
                {dimensions.length > 0 && (
                  <div style={{ marginTop: 'auto', borderTop: '1px solid #1E293B', paddingTop: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '8px', fontWeight: 600 }}>
                      รายการเส้นวัดในรูปนี้ ({dimensions.length}):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                      {dimensions.map((dim, idx) => (
                        <button
                          key={dim.id}
                          type="button"
                          onClick={() => {
                            setSelectedLineId(dim.id)
                            setSelectedAreaId(null)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid',
                            borderColor: dim.id === selectedLineId ? '#00E5FF' : '#1E293B',
                            background: dim.id === selectedLineId ? '#0B132B' : '#131B2A',
                            color: '#F8FAFC',
                            fontSize: '11px',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                            {idx + 1}. {dim.label}
                          </span>
                          <span style={{ fontFamily: 'monospace', color: dim.distance_mm > 0 ? '#00E5FF' : '#F59E0B', fontWeight: 700 }}>
                            {dim.distance_mm > 0 ? `${dim.distance_m.toFixed(3)}m` : 'รอยิง'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* MODE 2: Feature 4 Surface Area Calculator (Paint / Tile / Wallpaper) */}
            {activeMode === 'area' && (
              <>
                {selectedArea ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Square size={14} />
                        <span>พื้นที่คำนวณที่เลือก</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteArea(selectedArea.id)}
                        style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px' }}
                        title="ลบพื้นที่นี้"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                        ชื่อพื้นที่ / ผนัง:
                      </label>
                      <input
                        type="text"
                        value={selectedArea.label}
                        onChange={(e) => handleUpdateArea(selectedArea.id, { label: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #334155',
                          background: '#1E293B',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                        ประเภทงานวัสดุ:
                      </label>
                      <select
                        value={selectedArea.category}
                        onChange={(e) => {
                          const cat = e.target.value as AreaCategory
                          const updates: Partial<PhotoAreaBox> = { category: cat }
                          if (cat === 'tile') {
                            updates.color = '#38BDF8'
                            if (!selectedArea.tile_config) {
                              updates.tile_config = {
                                tile_width_cm: 60,
                                tile_length_cm: 60,
                                waste_percent: 10,
                                pieces_per_box: 4,
                                show_grid: true,
                              }
                            }
                          } else {
                            updates.color = '#10B981'
                          }
                          handleUpdateArea(selectedArea.id, updates)
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #334155',
                          background: '#1E293B',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="tile">🧱 งานปูกระเบื้อง (Floor/Wall Tiles) [คำนวณแผ่น/กล่อง]</option>
                        <option value="paint">🎨 งานทาสีผนัง (Wall Paint)</option>
                        <option value="wallpaper">🖼️ วอลเปเปอร์ (Wallpaper)</option>
                        <option value="masonry">🏗️ ก่ออิฐฉาบปูน (Masonry/Plaster)</option>
                        <option value="custom">📐 กำหนดเอง (Custom)</option>
                      </select>
                    </div>

                    {/* Width & Height Dimensions */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#94A3B8' }}>กว้าง (มม.):</label>
                          <button
                            type="button"
                            disabled={laserLiveDistMm <= 0}
                            onClick={() => {
                              if (laserLiveDistMm > 0) {
                                handleUpdateArea(selectedArea.id, { width_mm: laserLiveDistMm })
                                showFeedback(`สแตมป์ความกว้าง ${(laserLiveDistMm / 1000).toFixed(2)} ม.`)
                              }
                            }}
                            title="สแตมป์จากเลเซอร์"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: laserLiveDistMm > 0 ? '#10B981' : '#64748B',
                              cursor: laserLiveDistMm > 0 ? 'pointer' : 'default',
                              padding: 0,
                            }}
                          >
                            <Zap size={12} />
                          </button>
                        </div>
                        <input
                          type="number"
                          step="1"
                          value={selectedArea.width_mm}
                          onChange={(e) =>
                            handleUpdateArea(selectedArea.id, { width_mm: parseInt(e.target.value, 10) || 0 })
                          }
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid #334155',
                            background: '#1E293B',
                            color: selectedArea.category === 'tile' ? '#38BDF8' : '#10B981',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#94A3B8' }}>สูง (มม.):</label>
                          <button
                            type="button"
                            disabled={laserLiveDistMm <= 0}
                            onClick={() => {
                              if (laserLiveDistMm > 0) {
                                handleUpdateArea(selectedArea.id, { height_mm: laserLiveDistMm })
                                showFeedback(`สแตมป์ความสูง ${(laserLiveDistMm / 1000).toFixed(2)} ม.`)
                              }
                            }}
                            title="สแตมป์จากเลเซอร์"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: laserLiveDistMm > 0 ? '#10B981' : '#64748B',
                              cursor: laserLiveDistMm > 0 ? 'pointer' : 'default',
                              padding: 0,
                            }}
                          >
                            <Zap size={12} />
                          </button>
                        </div>
                        <input
                          type="number"
                          step="1"
                          value={selectedArea.height_mm}
                          onChange={(e) =>
                            handleUpdateArea(selectedArea.id, { height_mm: parseInt(e.target.value, 10) || 0 })
                          }
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid #334155',
                            background: '#1E293B',
                            color: selectedArea.category === 'tile' ? '#38BDF8' : '#10B981',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        />
                      </div>
                    </div>

                    {/* Deductions (Doors / Windows) */}
                    <div>
                      <label style={{ fontSize: '11px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                        หักช่องเปิด ประตู/หน้าต่าง (ตร.ม.):
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={selectedArea.deductions_sqm || ''}
                        placeholder="0.00"
                        onChange={(e) =>
                          handleUpdateArea(selectedArea.id, { deductions_sqm: parseFloat(e.target.value) || 0 })
                        }
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid #334155',
                          background: '#1E293B',
                          color: '#F59E0B',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          fontWeight: 700,
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleUpdateArea(selectedArea.id, { deductions_sqm: (selectedArea.deductions_sqm || 0) + 1.8 })}
                          style={{
                            flex: 1,
                            padding: '3px',
                            borderRadius: '3px',
                            border: '1px solid #334155',
                            background: '#131B2A',
                            color: '#94A3B8',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          + ประตู 1.8m²
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateArea(selectedArea.id, { deductions_sqm: (selectedArea.deductions_sqm || 0) + 1.2 })}
                          style={{
                            flex: 1,
                            padding: '3px',
                            borderRadius: '3px',
                            border: '1px solid #334155',
                            background: '#131B2A',
                            color: '#94A3B8',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          + หน้าต่าง 1.2m²
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateArea(selectedArea.id, { deductions_sqm: 0 })}
                          style={{
                            padding: '3px 6px',
                            borderRadius: '3px',
                            border: '1px solid #334155',
                            background: '#131B2A',
                            color: '#EF4444',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          ล้าง
                        </button>
                      </div>
                    </div>

                    {/* Dedicated Tile Estimator Section if category === 'tile' */}
                    {selectedArea.category === 'tile' ? (
                      <div
                        style={{
                          background: '#081726',
                          border: '1px solid #0284C7',
                          borderRadius: '8px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Grid size={14} />
                            <span>คำนวณแผ่นกระเบื้องตามขนาด</span>
                          </span>
                          <label style={{ fontSize: '10px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedArea.tile_config?.show_grid !== false}
                              onChange={(e) => {
                                const cfg = selectedArea.tile_config || { tile_width_cm: 60, tile_length_cm: 60, waste_percent: 10, pieces_per_box: 4 }
                                handleUpdateArea(selectedArea.id, { tile_config: { ...cfg, show_grid: e.target.checked } })
                              }}
                              style={{ accentColor: '#38BDF8' }}
                            />
                            <span>แสดงตารางบนรูป</span>
                          </label>
                        </div>

                        {/* Presets Grid */}
                        <div>
                          <label style={{ fontSize: '10px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                            เลือกขนาดยอดนิยม (ไทย):
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                            {STANDARD_TILE_PRESETS.map((preset) => {
                              const cfg = selectedArea.tile_config
                              const isCurrent = cfg && cfg.tile_width_cm === preset.width_cm && cfg.tile_length_cm === preset.length_cm
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => {
                                    const currentCfg = selectedArea.tile_config || { waste_percent: 10, show_grid: true }
                                    handleUpdateArea(selectedArea.id, {
                                      label: `กระเบื้อง ${preset.name.split(' ')[0]}`,
                                      tile_config: {
                                        ...currentCfg,
                                        tile_width_cm: preset.width_cm,
                                        tile_length_cm: preset.length_cm,
                                        pieces_per_box: preset.pieces_per_box,
                                      },
                                    })
                                  }}
                                  style={{
                                    padding: '4px 2px',
                                    borderRadius: '4px',
                                    border: '1px solid',
                                    borderColor: isCurrent ? '#38BDF8' : '#1E293B',
                                    background: isCurrent ? '#0369A1' : '#131B2A',
                                    color: isCurrent ? '#FFFFFF' : '#94A3B8',
                                    fontSize: '10px',
                                    fontWeight: isCurrent ? 700 : 500,
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  title={preset.description}
                                >
                                  {preset.name.split(' ')[0]}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Dimensions and Pieces/Box */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                          <div>
                            <label style={{ fontSize: '10px', color: '#94A3B8', display: 'block' }}>กว้าง (ซม.):</label>
                            <input
                              type="number"
                              step="1"
                              value={selectedArea.tile_config?.tile_width_cm ?? 60}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 1
                                const cfg = selectedArea.tile_config || { tile_width_cm: 60, tile_length_cm: 60, waste_percent: 10, pieces_per_box: 4 }
                                handleUpdateArea(selectedArea.id, { tile_config: { ...cfg, tile_width_cm: val } })
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                border: '1px solid #334155',
                                background: '#1E293B',
                                color: '#38BDF8',
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '10px', color: '#94A3B8', display: 'block' }}>ยาว (ซม.):</label>
                            <input
                              type="number"
                              step="1"
                              value={selectedArea.tile_config?.tile_length_cm ?? 60}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 1
                                const cfg = selectedArea.tile_config || { tile_width_cm: 60, tile_length_cm: 60, waste_percent: 10, pieces_per_box: 4 }
                                handleUpdateArea(selectedArea.id, { tile_config: { ...cfg, tile_length_cm: val } })
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                border: '1px solid #334155',
                                background: '#1E293B',
                                color: '#38BDF8',
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '10px', color: '#94A3B8', display: 'block' }}>แผ่น/กล่อง:</label>
                            <input
                              type="number"
                              step="1"
                              value={selectedArea.tile_config?.pieces_per_box ?? 4}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 1
                                const cfg = selectedArea.tile_config || { tile_width_cm: 60, tile_length_cm: 60, waste_percent: 10, pieces_per_box: 4 }
                                handleUpdateArea(selectedArea.id, { tile_config: { ...cfg, pieces_per_box: val } })
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                border: '1px solid #334155',
                                background: '#1E293B',
                                color: '#38BDF8',
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                            />
                          </div>
                        </div>

                        {/* Wastage Rate Buttons */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px', color: '#94A3B8' }}>เผื่อเศษตัด (Wastage Rate):</label>
                            <span style={{ fontSize: '11px', color: '#F59E0B', fontFamily: 'monospace', fontWeight: 700 }}>
                              {selectedArea.tile_config?.waste_percent ?? 10}%
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {[
                              { label: '5% ปูตรง', pct: 5 },
                              { label: '10% มีเสา/มุม', pct: 10 },
                              { label: '15% ก้างปลา/ทะแยง', pct: 15 },
                            ].map((w) => {
                              const active = (selectedArea.tile_config?.waste_percent ?? 10) === w.pct
                              return (
                                <button
                                  key={w.pct}
                                  type="button"
                                  onClick={() => {
                                    const cfg = selectedArea.tile_config || { tile_width_cm: 60, tile_length_cm: 60, pieces_per_box: 4 }
                                    handleUpdateArea(selectedArea.id, { tile_config: { ...cfg, waste_percent: w.pct } })
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '3px 2px',
                                    borderRadius: '3px',
                                    border: '1px solid',
                                    borderColor: active ? '#F59E0B' : '#334155',
                                    background: active ? '#78350F' : '#131B2A',
                                    color: active ? '#FDE68A' : '#94A3B8',
                                    fontSize: '10px',
                                    fontWeight: active ? 700 : 500,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {w.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Calculated Tile Results Dashboard */}
                        {selectedArea.tile_result && (
                          <div
                            style={{
                              background: '#041B2D',
                              border: '1px solid #0284C7',
                              borderRadius: '6px',
                              padding: '10px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div style={{ background: '#082F49', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: '#7DD3FC' }}>สั่งกระเบื้องทั้งหมด:</div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#38BDF8', fontFamily: 'monospace' }}>
                                  {selectedArea.tile_result.total_boxes} กล่อง
                                </div>
                                <div style={{ fontSize: '9px', color: '#94A3B8' }}>
                                  (คลุม {selectedArea.tile_result.box_coverage_sqm} m²)
                                </div>
                              </div>

                              <div style={{ background: '#064E3B', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: '#6EE7B7' }}>แผ่นกระเบื้องรวม:</div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981', fontFamily: 'monospace' }}>
                                  {selectedArea.tile_result.total_pieces} แผ่น
                                </div>
                                <div style={{ fontSize: '9px', color: '#A7F3D0' }}>
                                  (จริง {selectedArea.tile_result.base_pieces} + เศษ {selectedArea.tile_result.waste_pieces})
                                </div>
                              </div>
                            </div>

                            {/* Mortar & Grout Supplies */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#0F172A',
                                padding: '6px 10px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                border: '1px solid #1E293B',
                              }}
                            >
                              <span style={{ color: '#CBD5E1' }}>🏗️ ปูนกาว (20kg):</span>
                              <span style={{ color: '#F59E0B', fontWeight: 700, fontFamily: 'monospace' }}>
                                {selectedArea.tile_result.mortar_bags_20kg} ถุง
                              </span>
                              <span style={{ color: '#475569' }}>|</span>
                              <span style={{ color: '#CBD5E1' }}>🧴 กาวยาแนว (1kg):</span>
                              <span style={{ color: '#00E5FF', fontWeight: 700, fontFamily: 'monospace' }}>
                                {selectedArea.tile_result.grout_bags_1kg} ถุง
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Non-tile Net Area Box */
                      <div
                        style={{
                          background: '#062B1D',
                          border: '1px solid #10B981',
                          borderRadius: '6px',
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: '#6EE7B7' }}>พื้นที่สุทธิที่ต้องใช้วัสดุ (Net Area):</div>
                        <div style={{ fontSize: '26px', fontWeight: 800, color: '#10B981', fontFamily: 'monospace' }}>
                          {selectedArea.net_area_sqm.toFixed(2)} m²
                        </div>
                        <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                          (พื้นที่รวม {selectedArea.area_sqm.toFixed(2)} m² - หักช่องเปิด {selectedArea.deductions_sqm.toFixed(2)} m²)
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 10px', color: '#64748B', fontSize: '12px' }}>
                    <Square size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <div>ลากกล่องสี่เหลี่ยมบนผนัง เพื่อคำนวณพื้นที่ทาสี/ปูกระเบื้อง (ตร.ม.)</div>
                  </div>
                )}


                {/* Area Boxes List */}
                {areas.length > 0 && (
                  <div style={{ marginTop: 'auto', borderTop: '1px solid #1E293B', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
                        พื้นที่ทั้งหมด ({areas.length}):
                      </span>
                      <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 700, fontFamily: 'monospace' }}>
                        รวม {areas.reduce((sum, a) => sum + a.net_area_sqm, 0).toFixed(2)} m²
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                      {areas.map((box, idx) => (
                        <button
                          key={box.id}
                          type="button"
                          onClick={() => {
                            setSelectedAreaId(box.id)
                            setSelectedLineId(null)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid',
                            borderColor: box.id === selectedAreaId ? '#10B981' : '#1E293B',
                            background: box.id === selectedAreaId ? '#062B1D' : '#131B2A',
                            color: '#F8FAFC',
                            fontSize: '11px',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                            {idx + 1}. {box.label}
                          </span>
                          <span style={{ fontFamily: 'monospace', color: '#10B981', fontWeight: 700 }}>
                            {box.net_area_sqm.toFixed(2)} m²
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

function pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const lineLenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2
  if (lineLenSq === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lineLenSq))
  const projX = x1 + t * (x2 - x1)
  const projY = y1 + t * (y2 - y1)
  return Math.hypot(px - projX, py - projY)
}
