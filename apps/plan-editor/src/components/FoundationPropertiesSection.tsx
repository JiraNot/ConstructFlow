import React from 'react'
import { FoundationModuleData, SmartObject, formatLengthMm, type DisplayLengthUnit } from '@constructflow/project-model'

type Props = { displayUnit: DisplayLengthUnit; foundation: SmartObject<FoundationModuleData> | null; onOpenTypeManager: () => void }
export const FoundationPropertiesSection: React.FC<Props> = ({ displayUnit, foundation: fndObj, onOpenTypeManager }) => {
  if (!fndObj) return null
  return <>
      {/* Footing Dimensions */}
      {fndObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ขนาด ({displayUnit})</label>
            <button
              onClick={onOpenTypeManager}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#996000',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              แก้ไขชนิด
            </button>
          </div>
          <div style={{
            background: '#f5f8fc',
            padding: '5px 7px',
            borderRadius: 3,
            fontSize: 13,
            fontWeight: 700,
            color: '#996000',
            border: '1px solid #eef3f8',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{fndObj.module_data.size_mm.map(value => formatLengthMm(value, displayUnit)).join(' × ')} {displayUnit}</span>
            <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {fndObj.module_data.mark}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>Center:</span>
            <span style={{ fontFamily: 'monospace' }}>
              ({formatLengthMm(fndObj.module_data.center_mm[0], displayUnit)} {displayUnit}, {formatLengthMm(fndObj.module_data.center_mm[1], displayUnit)} {displayUnit})
            </span>
          </div>
        </div>
      )}
  </>
}
