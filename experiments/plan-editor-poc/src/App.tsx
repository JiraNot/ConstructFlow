import React, { useState, useEffect } from 'react'
import { Project, Phase, SyncDeltaEvent } from './types/model'
import { CommandBus } from './commands/CommandBus'
import { Toolbar, ToolType } from './components/Toolbar'
import { PlanCanvas } from './components/PlanCanvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { SketchUpSyncPanel } from './components/SketchUpSyncPanel'

const INITIAL_PROJECT: Project = {
  id: 'CF-PROJ-DEMO',
  name: 'Residential Extension & Renovation',
  units: 'mm',
  active_level_id: 'L1',
  active_phase: 'new_construction',
  levels: [
    { id: 'L0', name: 'Foundation', elevation_mm: -1000 },
    { id: 'L1', name: 'Ground Floor', elevation_mm: 0 },
    { id: 'L2', name: 'First Floor', elevation_mm: 3000 },
  ],
  objects: {},
}

export const App: React.FC = () => {
  const [project, setProject] = useState<Project>(INITIAL_PROJECT)
  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cursorCoords_mm, setCursorCoords_mm] = useState<[number, number]>([0, 0])
  const [snapKind, setSnapKind] = useState<string>('Free')
  const [syncEvents, setSyncEvents] = useState<SyncDeltaEvent[]>([])

  // Setup initial template model (Grids A, B, C & 1, 2 + Columns)
  useEffect(() => {
    let current = INITIAL_PROJECT

    // Grids
    const gridActions = [
      { tag: 'A', orientation: 'vertical', position_mm: 0 },
      { tag: 'B', orientation: 'vertical', position_mm: 4000 },
      { tag: 'C', orientation: 'vertical', position_mm: 8000 },
      { tag: '1', orientation: 'horizontal', position_mm: 0 },
      { tag: '2', orientation: 'horizontal', position_mm: 5000 },
    ]

    for (const g of gridActions) {
      const res = CommandBus.execute(current, 'CreateGridLine', g)
      if (res.status === 'success') current = res.updated_project
    }

    // Initial Column at A-1
    const col1 = CommandBus.execute(current, 'CreateColumn', {
      location_mm: [0, 0],
      section_mm: [200, 200],
    })
    if (col1.status === 'success') current = col1.updated_project

    // Initial Column at B-1
    const col2 = CommandBus.execute(current, 'CreateColumn', {
      location_mm: [4000, 0],
      section_mm: [200, 200],
    })
    if (col2.status === 'success') current = col2.updated_project

    // Initial Wall between A-1 and B-1 (Existing phase)
    const wall1 = CommandBus.execute(current, 'CreateWall', {
      start_mm: [0, 0],
      end_mm: [4000, 0],
      thickness_mm: 150,
      material: 'Brick 150mm',
    })
    if (wall1.status === 'success') {
      current = wall1.updated_project
      const wallId = Object.keys(current.objects).find(
        (k) => current.objects[k].object_type === 'architecture.wall'
      )
      if (wallId) {
        const phaseRes = CommandBus.execute(current, 'ChangePhase', {
          id: wallId,
          new_phase: 'existing',
        })
        if (phaseRes.status === 'success') current = phaseRes.updated_project
      }
    }

    setProject(current)
    setSyncEvents([
      {
        op: 'CREATE',
        id: 'INIT-MODEL',
        object_type: 'project.init',
        timestamp: new Date().toISOString(),
        payload: { message: 'Initialized Project with Grids A-C, 1-2, Columns, and Wall' },
      },
    ])
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') {
        setActiveTool('select')
        setSelectedId(null)
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select')
      } else if (e.key === 'c' || e.key === 'C') {
        setActiveTool('column')
      } else if (e.key === 'w' || e.key === 'W') {
        setActiveTool('wall')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Command handlers
  const handleCommitColumn = (location_mm: [number, number]) => {
    const res = CommandBus.execute(project, 'CreateColumn', {
      location_mm,
      section_mm: [200, 200],
    })
    if (res.status === 'success') {
      setProject(res.updated_project)
      setSyncEvents((prev) => [...prev, ...res.events])
    }
  }

  const handleCommitWall = (start_mm: [number, number], end_mm: [number, number]) => {
    const res = CommandBus.execute(project, 'CreateWall', {
      start_mm,
      end_mm,
      thickness_mm: 150,
    })
    if (res.status === 'success') {
      setProject(res.updated_project)
      setSyncEvents((prev) => [...prev, ...res.events])
    }
  }

  const handleMoveColumn = (id: string, newLocation_mm: [number, number]) => {
    const res = CommandBus.execute(project, 'MoveColumn', {
      id,
      new_location_mm: newLocation_mm,
    })
    if (res.status === 'success') {
      setProject(res.updated_project)
      setSyncEvents((prev) => [...prev, ...res.events])
    }
  }

  const handleUpdatePhase = (id: string, phase: Phase) => {
    const res = CommandBus.execute(project, 'ChangePhase', { id, new_phase: phase })
    if (res.status === 'success') {
      setProject(res.updated_project)
      setSyncEvents((prev) => [...prev, ...res.events])
    }
  }

  const handleDeleteObject = (id: string) => {
    const res = CommandBus.execute(project, 'DeleteObject', { id })
    if (res.status === 'success') {
      setProject(res.updated_project)
      setSyncEvents((prev) => [...prev, ...res.events])
      setSelectedId(null)
    }
  }

  const handleSetupGrids = () => {
    let current = project
    const extraGrids = [
      { tag: 'D', orientation: 'vertical', position_mm: 12000 },
      { tag: '3', orientation: 'horizontal', position_mm: 10000 },
    ]
    for (const g of extraGrids) {
      const res = CommandBus.execute(current, 'CreateGridLine', g)
      if (res.status === 'success') {
        current = res.updated_project
        setSyncEvents((prev) => [...prev, ...res.events])
      }
    }
    setProject(current)
  }

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.id}.cfproj.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectedObject = selectedId ? project.objects[selectedId] || null : null

  return (
    <div style={layoutStyles.root}>
      {/* Top Application Toolbar */}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        activeLevelId={project.active_level_id}
        levels={project.levels}
        onSelectLevel={(id) => setProject((p) => ({ ...p, active_level_id: id }))}
        activePhase={project.active_phase}
        onSelectPhase={(phase) => setProject((p) => ({ ...p, active_phase: phase }))}
        onAddGridLines={handleSetupGrids}
        onExportJson={handleExportJson}
        onResetModel={() => {
          setProject(INITIAL_PROJECT)
          setSelectedId(null)
        }}
      />

      {/* Main Workspace Body */}
      <div style={layoutStyles.body}>
        {/* Center Plan Canvas & Bottom Sync Panel */}
        <div style={layoutStyles.centerColumn}>
          <PlanCanvas
            project={project}
            activeTool={activeTool}
            selectedId={selectedId}
            onSelectObject={setSelectedId}
            onCommitColumn={handleCommitColumn}
            onCommitWall={handleCommitWall}
            onMoveColumn={handleMoveColumn}
            onCursorChange={(coords, snap) => {
              setCursorCoords_mm(coords)
              setSnapKind(snap)
            }}
          />

          <SketchUpSyncPanel
            events={syncEvents}
            onClearEvents={() => setSyncEvents([])}
          />
        </div>

        {/* Right Semantic Properties Inspector */}
        <PropertiesPanel
          selectedObject={selectedObject}
          onUpdatePhase={handleUpdatePhase}
          onDeleteObject={handleDeleteObject}
        />
      </div>

      {/* Bottom Status Bar */}
      <div style={layoutStyles.statusBar}>
        <div style={layoutStyles.statusGroup}>
          <span style={layoutStyles.statusLabel}>CURSOR:</span>
          <span style={layoutStyles.statusValMono}>
            X: {cursorCoords_mm[0].toLocaleString()} mm &nbsp; Y: {cursorCoords_mm[1].toLocaleString()} mm
          </span>
        </div>

        <div style={layoutStyles.statusDivider} />

        <div style={layoutStyles.statusGroup}>
          <span style={layoutStyles.statusLabel}>SNAP:</span>
          <span style={layoutStyles.statusPillYellow}>{snapKind}</span>
        </div>

        <div style={layoutStyles.statusDivider} />

        <div style={layoutStyles.statusGroup}>
          <span style={layoutStyles.statusLabel}>OBJECTS:</span>
          <span style={layoutStyles.statusValMono}>
            {Object.keys(project.objects).length} entities
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            Millimeter Canonical Units &bull; CommandBus Mutation Boundary
          </span>
        </div>
      </div>
    </div>
  )
}

const layoutStyles: Record<string, React.CSSProperties> = {
  root: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#090d16',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  centerColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  statusBar: {
    height: '26px',
    background: '#090d16',
    borderTop: '1px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: '12px',
    userSelect: 'none',
  },
  statusGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
  },
  statusLabel: {
    color: '#64748b',
    fontWeight: 600,
  },
  statusValMono: {
    fontFamily: 'JetBrains Mono, monospace',
    color: '#cbd5e1',
  },
  statusPillYellow: {
    background: 'rgba(234, 179, 8, 0.15)',
    color: '#facc15',
    padding: '1px 6px',
    borderRadius: '4px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '10px',
  },
  statusDivider: {
    width: '1px',
    height: '14px',
    background: '#1e293b',
  },
}
