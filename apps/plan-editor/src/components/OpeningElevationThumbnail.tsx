import React from 'react'
import { getOpeningElevationLinework } from '@constructflow/representation-engine'
import type { RepresentationShape } from '@constructflow/representation-engine'

interface Props {
  shape: Extract<RepresentationShape, { kind: 'opening' }>
  widthPx?: number
  heightPx?: number
  showOperationIndicator?: boolean
}

export const OpeningElevationThumbnail: React.FC<Props> = ({
  shape,
  widthPx = 180,
  heightPx = 130,
  showOperationIndicator = true,
}) => {
  const lineworks = getOpeningElevationLinework(shape, { show_operation_indicator: showOperationIndicator })
  const w = Math.max(100, shape.width_mm)
  const h = Math.max(100, shape.height_mm)
  const pad = 60
  // SVG viewBox in opening coordinates: X in [-pad, w + pad], Z in [-pad, h + pad]
  // Because SVG standard Y points down, we map Z -> (h - Z)
  const viewBox = `0 0 ${w} ${h}`

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 3,
        padding: '6px 8px',
        margin: '4px 0',
      }}
    >
      <svg
        viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
        style={{
          width: '100%',
          maxWidth: widthPx,
          height: heightPx,
          overflow: 'visible',
        }}
      >
        {lineworks.map((path, idx) => {
          // Convert from bottom-up Z coordinates to top-down SVG coordinates
          const d =
            path.points_mm
              .map(([x, z], i) => `${i === 0 ? 'M' : 'L'} ${x} ${h - z}`)
              .join(' ') + (path.closed ? ' Z' : '')

          const isDashed = !path.closed && path.line_width_mm <= 0.22
          return (
            <path
              key={idx}
              d={d}
              fill={path.fill ?? 'none'}
              stroke="#0f172a"
              strokeWidth={Math.max(1.2, (path.line_width_mm / 0.35) * (w / 280))}
              strokeDasharray={isDashed ? `${w * 0.04} ${w * 0.025}` : undefined}
            />
          )
        })}
      </svg>
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontWeight: 500 }}>
        {(w / 1000).toFixed(2)} × {(h / 1000).toFixed(2)} m · {shape.opening_type === 'door' ? 'รูปด้านประตู' : 'รูปด้านหน้าต่าง'}
      </div>
    </div>
  )
}
