import { useEffect, useRef, useState } from 'react'
import { formatLengthMm, parseLengthMm, type DisplayLengthUnit, type ProjectDocument } from '@constructflow/project-model'
import type { StairPlacementOptions } from '@constructflow/architecture-engine'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { ToolType } from './Toolbar.js'
import type { BeamPlacementStart, WallPlacementStart } from './commitPlanCanvasLinePlacementPoint.js'
import { reformatPlacementLengthInput } from './reformatPlacementLengthInput.mjs'

type Point = [number, number]

interface UsePlanCanvasPlacementSessionOptions {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  activeTool: ToolType
  activation: number
}

export function usePlanCanvasPlacementSession({ project, displayUnit, activeTool, activation }: UsePlanCanvasPlacementSessionOptions) {
  const [gridStartPoint, setGridStartPoint] = useState<Point | null>(null)
  const [stairStartPoint, setStairStartPoint] = useState<Point | null>(null)
  const [stairOptions, setStairOptions] = useState<StairPlacementOptions>({ stair_type: 'u_shape', width_mm: 900, landing_depth_mm: 900, turn_direction: 'right', num_risers: 18, flight_gap_mm: 100, top_level_id: '' })
  const [stairError, setStairError] = useState('')
  const [gridSequenceStyle, setGridSequenceStyle] = useState<'auto' | 'alpha' | 'numeric'>('auto')
  const [gridCopySourceId, setGridCopySourceId] = useState<string | null>(null)
  const [gridXIntervals, setGridXIntervals] = useState(() => [3000, 3000, 3000].map(value => formatLengthMm(value, displayUnit)).join(', '))
  const [gridYIntervals, setGridYIntervals] = useState(() => [2500, 2500].map(value => formatLengthMm(value, displayUnit)).join(', '))
  const [gridXFirstTag, setGridXFirstTag] = useState('A')
  const [gridYFirstTag, setGridYFirstTag] = useState('1')
  const [gridSystemError, setGridSystemError] = useState('')
  const [drawLengthMeters, setDrawLengthMeters] = useState('')
  const [drawAngleDegrees, setDrawAngleDegrees] = useState('')
  const [dimensionInputX, setDimensionInputX] = useState('')
  const [dimensionInputY, setDimensionInputY] = useState('')
  const dimensionInputXRef = useRef<HTMLInputElement>(null)
  const dimensionInputYRef = useRef<HTMLInputElement>(null)
  const [dimensionAnchorX, setDimensionAnchorX] = useState<number | null>(null)
  const [dimensionAnchorY, setDimensionAnchorY] = useState<number | null>(null)
  const [dimensionKeyboardAxis, setDimensionKeyboardAxis] = useState<'x' | 'y'>('x')
  const [beamStartNode, setBeamStartNode] = useState<BeamPlacementStart | null>(null)
  const [wallStartNode, setWallStartNode] = useState<WallPlacementStart | null>(null)
  const [roomSeparatorStart, setRoomSeparatorStart] = useState<Point | null>(null)
  const [roofShape, setRoofShape] = useState<'hip' | 'gable' | 'flat'>('hip')
  const [roofSlopeDeg, setRoofSlopeDeg] = useState(25)
  const [roofThicknessMm, setRoofThicknessMm] = useState(30)
  const [roofElevationOffsetMm, setRoofElevationOffsetMm] = useState(2800)
  const [roofMaterial, setRoofMaterial] = useState('metal_sheet')
  const [pipeSystem, setPipeSystem] = useState<'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'>('waste')
  const [fixtureKind, setFixtureKind] = useState<'light' | 'switch' | 'outlet' | 'panel'>('light')
  const [slabBoundary, setSlabBoundary] = useState<Point[]>([])
  const [calibrationP1, setCalibrationP1] = useState<Point | null>(null)
  const [calibrationMousePoint, setCalibrationMousePoint] = useState<Point | null>(null)
  const [tapeMeasure, setTapeMeasure] = useState<{ start: Point; end: Point; complete: boolean } | null>(null)
  const [activeSnap, setActiveSnap] = useState<SnapResult | null>(null)
  const [activeWallSnap, setActiveWallSnap] = useState<WallHostSnapResult | null>(null)
  const previousDisplayUnit = useRef(displayUnit)
  const previousToolSession = useRef({ activeTool, activation })

  const clearDimensionOverrides = () => {
    setDimensionInputX('')
    setDimensionInputY('')
    setDimensionAnchorX(null)
    setDimensionAnchorY(null)
  }

  const resetPlacementDrafts = () => {
    setGridStartPoint(null)
    setStairStartPoint(null)
    setStairError('')
    setGridCopySourceId(null)
    setGridSystemError('')
    setDrawLengthMeters('')
    setDrawAngleDegrees('')
    clearDimensionOverrides()
    setBeamStartNode(null)
    setWallStartNode(null)
    setRoomSeparatorStart(null)
    setSlabBoundary([])
    setCalibrationP1(null)
    setCalibrationMousePoint(null)
    setTapeMeasure(null)
    setActiveSnap(null)
    setActiveWallSnap(null)
  }

  useEffect(() => {
    const base = project.levels.find(level => level.id === project.project.active_level_id)
    const top = project.levels.filter(level => level.elevation_mm > (base?.elevation_mm ?? 0)).sort((a, b) => a.elevation_mm - b.elevation_mm)[0]
    setStairOptions(options => ({ ...options, top_level_id: top?.id ?? '', num_risers: top && base ? Math.ceil((top.elevation_mm - base.elevation_mm) / 190) : 18, first_flight_risers: undefined }))
    setStairStartPoint(null)
  }, [project.project.active_level_id, project.levels])

  useEffect(() => {
    const previousUnit = previousDisplayUnit.current
    if (previousUnit === displayUnit) return
    const convert = (value: string) => value.split(/[,;]+/).map(part => part.trim()).filter(Boolean).map(part => {
      const mm = parseLengthMm(part, previousUnit)
      return mm === null ? part : formatLengthMm(mm, displayUnit)
    }).join(', ')
    setGridXIntervals(convert(gridXIntervals))
    setGridYIntervals(convert(gridYIntervals))
    setDimensionInputX(value => reformatPlacementLengthInput(value, previousUnit, displayUnit))
    setDimensionInputY(value => reformatPlacementLengthInput(value, previousUnit, displayUnit))
    setDrawLengthMeters(value => reformatPlacementLengthInput(value, previousUnit, displayUnit))
    previousDisplayUnit.current = displayUnit
  }, [displayUnit])

  useEffect(() => {
    const previous = previousToolSession.current
    previousToolSession.current = { activeTool, activation }
    if (previous.activeTool !== activeTool || previous.activation === activation) return

    // Repeating the active tool is a new session and must discard its pending step.
    resetPlacementDrafts()
  }, [activeTool, activation])

  useEffect(() => {
    clearDimensionOverrides()
  }, [activeTool, activation])

  useEffect(() => {
    if (activeTool !== 'beam') setBeamStartNode(null)
    if (activeTool !== 'wall') setWallStartNode(null)
    if (!['roomSeparator', 'pipe', 'cabinet', 'moulding'].includes(activeTool)) setRoomSeparatorStart(null)
    if (activeTool !== 'grid') setGridStartPoint(null)
    if (activeTool !== 'stair') { setStairStartPoint(null); setStairError('') }
    if (activeTool !== 'gridCopy') setGridCopySourceId(null)
    if (!['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof'].includes(activeTool)) setSlabBoundary([])
    if (activeTool !== 'calibrate') { setCalibrationP1(null); setCalibrationMousePoint(null) }
    if (activeTool !== 'measure') setTapeMeasure(null)
    setDrawLengthMeters('')
    setDrawAngleDegrees('')
  }, [activeTool, activation])

  return {
    gridStartPoint, setGridStartPoint,
    stairStartPoint, setStairStartPoint, stairOptions, setStairOptions, stairError, setStairError,
    gridSequenceStyle, setGridSequenceStyle, gridCopySourceId, setGridCopySourceId,
    gridXIntervals, setGridXIntervals, gridYIntervals, setGridYIntervals,
    gridXFirstTag, setGridXFirstTag, gridYFirstTag, setGridYFirstTag, gridSystemError, setGridSystemError,
    drawLengthMeters, setDrawLengthMeters, drawAngleDegrees, setDrawAngleDegrees,
    dimensionInputX, setDimensionInputX, dimensionInputY, setDimensionInputY,
    dimensionInputXRef, dimensionInputYRef, dimensionAnchorX, setDimensionAnchorX, dimensionAnchorY, setDimensionAnchorY,
    dimensionKeyboardAxis, setDimensionKeyboardAxis, clearDimensionOverrides, resetPlacementDrafts,
    beamStartNode, setBeamStartNode, wallStartNode, setWallStartNode,
    roomSeparatorStart, setRoomSeparatorStart, roofShape, setRoofShape, roofSlopeDeg, setRoofSlopeDeg,
    roofThicknessMm, setRoofThicknessMm, roofElevationOffsetMm, setRoofElevationOffsetMm, roofMaterial, setRoofMaterial,
    pipeSystem, setPipeSystem, fixtureKind, setFixtureKind, slabBoundary, setSlabBoundary,
    calibrationP1, setCalibrationP1, calibrationMousePoint, setCalibrationMousePoint,
    tapeMeasure, setTapeMeasure, activeSnap, setActiveSnap, activeWallSnap, setActiveWallSnap,
  }
}
