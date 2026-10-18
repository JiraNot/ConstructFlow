import React, { useState } from 'react'
import type { PhotoDimensionSession } from '@constructflow/laser-survey'
import { worldToScreen, type ViewportState } from '../viewport/viewportTransform.js'

export interface PlanPhotoPinLayerProps {
  viewport: ViewportState
  activeLevelId: string
  sessions: PhotoDimensionSession[]
  onSelectSession: (session: PhotoDimensionSession) => void
}

/**
 * Renders Camera Pin Markers on the 2D Plan with Field-of-View (FOV) direction cones.
 * Clicking a pin opens the Photo Dimension Markup modal with all laser dimensions and surface areas.
 */
export const PlanPhotoPinLayer: React.FC<PlanPhotoPinLayerProps> = ({
  viewport,
  activeLevelId,
  sessions,
  onSelectSession,
}) => {
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null)

  const activeSessions = sessions.filter(
    (s) => s.pin_coords_mm && (!s.level_id || s.level_id === activeLevelId)
  )

  if (activeSessions.length === 0) return null

  return (
    <svg
      tabIndex={-1}
      aria-label="หมุดรูปถ่ายหน้างานบนแปลน"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
        outline: 'none',
        zIndex: 12,
      }}
    >
      <defs>
        <radialGradient id="cf-fov-gradient" cx="0%" cy="0%" r="100%">
          <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#00E5FF" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.03" />
        </radialGradient>
        <radialGradient id="cf-fov-gradient-hover" cx="0%" cy="0%" r="100%">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.6" />
          <stop offset="60%" stopColor="#10B981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
        </radialGradient>
        <filter id="cf-pin-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.6" />
        </filter>
      </defs>

      {activeSessions.map((session) => {
        const [cx, cy] = worldToScreen(session.pin_coords_mm!, viewport)
        const isHovered = hoveredSessionId === session.id
        const headingDeg = session.camera_heading_deg ?? 0

        // North = 0 deg (vector points UP, dy = -1)
        const phi = ((headingDeg - 90) * Math.PI) / 180
        const coneRadius = isHovered ? 58 : 48
        const halfFov = (30 * Math.PI) / 180 // 60 deg total FOV

        const p1x = cx + coneRadius * Math.cos(phi - halfFov)
        const p1y = cy + coneRadius * Math.sin(phi - halfFov)
        const p2x = cx + coneRadius * Math.cos(phi + halfFov)
        const p2y = cy + coneRadius * Math.sin(phi + halfFov)

        // Center direction pointer
        const pointerLen = coneRadius + 6
        const pmidX = cx + pointerLen * Math.cos(phi)
        const pmidY = cy + pointerLen * Math.sin(phi)

        const dimCount = session.dimensions ? session.dimensions.length : 0
        const areaCount = session.areas ? session.areas.length : 0
        const totalCount = dimCount + areaCount

        const fovFill = isHovered ? 'url(#cf-fov-gradient-hover)' : 'url(#cf-fov-gradient)'
        const strokeColor = isHovered ? '#10B981' : '#00E5FF'

        return (
          <g
            key={session.id}
            data-photo-pin-id={session.id}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            onPointerEnter={() => setHoveredSessionId(session.id)}
            onPointerLeave={() => setHoveredSessionId(null)}
            onPointerDown={(e) => {
              e.stopPropagation()
              onSelectSession(session)
            }}
          >
            <title>{`${session.title || 'รูปถ่ายหน้างาน'} | ${dimCount} เส้นวัด · ${areaCount} ผนัง ตร.ม. (คลิกเพื่อเปิด)`}</title>

            {/* 1. Field of View (FOV) Camera Cone */}
            <path
              d={`M ${cx} ${cy} L ${p1x} ${p1y} A ${coneRadius} ${coneRadius} 0 0 1 ${p2x} ${p2y} Z`}
              fill={fovFill}
              stroke={strokeColor}
              strokeWidth={isHovered ? 1.8 : 1.2}
              strokeDasharray="4 2"
            />

            {/* 2. Direction Beam Pointer */}
            <line
              x1={cx}
              y1={cy}
              x2={pmidX}
              y2={pmidY}
              stroke={strokeColor}
              strokeWidth={isHovered ? 2 : 1.2}
            />
            <circle cx={pmidX} cy={pmidY} r={2.5} fill={strokeColor} />

            {/* 3. Camera Marker Pin Circle */}
            <circle
              cx={cx}
              cy={cy}
              r={14}
              fill="#0B0F17"
              stroke={strokeColor}
              strokeWidth={2}
              filter="url(#cf-pin-shadow)"
            />

            {/* Camera Icon Vector */}
            <g transform={`translate(${cx - 7}, ${cy - 6})`}>
              {/* Camera Body */}
              <rect
                x="0"
                y="3"
                width="14"
                height="9"
                rx="2"
                fill="none"
                stroke={isHovered ? '#FFFFFF' : '#00E5FF'}
                strokeWidth="1.3"
              />
              {/* Lens */}
              <circle
                cx="7"
                cy="7.5"
                r="2.5"
                fill="none"
                stroke={isHovered ? '#FFFFFF' : '#00E5FF'}
                strokeWidth="1.2"
              />
              {/* Flash Bump */}
              <rect
                x="3"
                y="1"
                width="3.5"
                height="2"
                rx="0.5"
                fill={isHovered ? '#FFFFFF' : '#00E5FF'}
              />
            </g>

            {/* Badge Indicator for count of dimensions */}
            {totalCount > 0 && (
              <g transform={`translate(${cx + 9}, ${cy - 11})`}>
                <circle cx="0" cy="0" r="7" fill={isHovered ? '#10B981' : '#00E5FF'} />
                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fill="#0B0F17"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="system-ui, sans-serif"
                >
                  {totalCount}
                </text>
              </g>
            )}

            {/* Hover Tooltip Box */}
            {isHovered && (
              <g transform={`translate(${cx}, ${cy - 24})`}>
                <rect
                  x="-70"
                  y="-22"
                  width="140"
                  height="20"
                  rx="4"
                  fill="#0B0F17"
                  stroke="#10B981"
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="-8"
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  {session.title.length > 18 ? session.title.slice(0, 18) + '…' : session.title}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
