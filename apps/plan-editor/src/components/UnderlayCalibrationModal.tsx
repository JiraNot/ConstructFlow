import React, { useState, useEffect } from 'react'
import { Ruler, Check, X, ArrowRight } from 'lucide-react'
import { formatLengthMm, parseLengthMm, type DisplayLengthUnit } from '@constructflow/project-model'

interface UnderlayCalibrationModalProps {
  isOpen: boolean
  onClose: () => void
  measuredDistance_mm: number
  displayUnit: DisplayLengthUnit
  currentScale_mm_per_px: number
  onApplyScale: (newScale_mm_per_px: number, realDistance_mm: number, axis: 'x' | 'y') => void
}

export const UnderlayCalibrationModal: React.FC<UnderlayCalibrationModalProps> = ({
  isOpen,
  onClose,
  measuredDistance_mm,
  displayUnit,
  currentScale_mm_per_px,
  onApplyScale,
}) => {
  const [inputValue, setInputValue] = useState<string>('4.000')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [axis, setAxis] = useState<'x' | 'y'>('x')

  useEffect(() => {
    if (isOpen) {
      // Default to rounded 100mm of measured distance if reasonable
      const rounded = Math.round(measuredDistance_mm / 100) * 100
      setInputValue(rounded > 0 ? formatLengthMm(rounded, displayUnit) : formatLengthMm(4000, displayUnit))
      setErrorMsg(null)
    }
  }, [isOpen, measuredDistance_mm, displayUnit])

  if (!isOpen) return null

  const parsedInput = parseLengthMm(inputValue, displayUnit)
  const parsedRealMm = parsedInput !== null && parsedInput > 0 ? Math.round(parsedInput) : null
  // Distance in pixel coordinates on current scale
  const pixelDist = measuredDistance_mm / (currentScale_mm_per_px || 1)
  const computedScale = parsedRealMm && pixelDist > 0 ? parsedRealMm / pixelDist : currentScale_mm_per_px

  const handleConfirm = () => {
    if (!parsedRealMm || parsedRealMm <= 0) {
      setErrorMsg('กรุณาระบุระยะทางจริงที่ถูกต้อง (เช่น 4000 หรือ 4.0m)')
      return
    }
    if (pixelDist <= 0) {
      setErrorMsg('ระยะพิกเซลที่วัดได้น้อยเกินไป กรุณาเลือก 2 จุดที่ห่างกันมากกว่านี้')
      return
    }
    onApplyScale(computedScale, parsedRealMm, axis)
    onClose()
  }

  return (
    <div className="cf-legacy-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: 480,
          background: '#ffffff',
          borderRadius: 6,
          border: '1px solid #dce4ed',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '11px 14px',
            borderBottom: '1px solid #f2f6fa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #ffffff 0%, #f2f6fa 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 4,
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0873c4',
              }}
            >
              <Ruler size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#24364b' }}>
                เทียบสเกลแปลนพื้น (Point-to-Point Calibration)
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: '#52677d' }}>
                ปรับสเกลภาพแปลน 1:1 ให้ตรงกับระยะจริงในงานก่อสร้าง ({displayUnit})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: 3,
              borderRadius: 2,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          {/* Measured Info Card */}
          <div
            style={{
              background: '#f2f6fa',
              borderRadius: 4,
              padding: '8px 11px',
              border: '1px solid #dce4ed',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: '#52677d' }}>ระยะที่วัดได้บนภาพ (Current Measured):</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b', marginTop: 2 }}>{formatLengthMm(measuredDistance_mm, displayUnit)} {displayUnit}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
              <div>ความกว้างพิกเซล:</div>
              <div style={{ fontFamily: 'monospace', color: '#40566e' }}>{pixelDist.toFixed(1)} px</div>
            </div>
          </div>

          {/* Real Distance Input */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#24364b' }}>
            จัดแนวเส้นที่วัดให้ขนานกับแกน
            <select value={axis} onChange={event => setAxis(event.target.value as 'x' | 'y')} style={{ padding: 4, border: '1px solid #cbd5e1', borderRadius: 3 }}>
              <option value="x">X (แนวนอน)</option><option value="y">Y (แนวตั้ง)</option>
            </select>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#24364b' }}>
              ระยะจริงระหว่าง 2 จุดนี้ ({displayUnit}; ใส่ mm/cm/m ต่อท้ายได้):
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                autoFocus
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setErrorMsg(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                placeholder={`เช่น ${formatLengthMm(4000, displayUnit)} ${displayUnit}`}
                style={{
                  flex: 1,
                  background: '#0b1329',
                  border: errorMsg ? '1px solid #ef4444' : '1px solid #0284c7',
                  borderRadius: 3,
                  padding: '6px 8px',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
              <span
                style={{
                  alignSelf: 'center',
                  fontSize: 12,
                  color: '#0873c4',
                  fontWeight: 600,
                  background: 'rgba(56, 189, 248, 0.1)',
                  padding: '6px 8px',
                  borderRadius: 3,
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                }}
              >
                {parsedRealMm ? `${formatLengthMm(parsedRealMm, displayUnit)} ${displayUnit}` : 'ระบุตัวเลข'}
              </span>
            </div>
            {errorMsg && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{errorMsg}</div>}
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 11, color: '#52677d' }}>ระยะยอดนิยม (Quick Presets):</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[1000, 2000, 3000, 3500, 4000, 5000, 6000, 8000].map((presetMm) => {
                const preset = formatLengthMm(presetMm, displayUnit)
                return (
                <button
                  key={presetMm}
                  onClick={() => {
                    setInputValue(preset)
                    setErrorMsg(null)
                  }}
                  style={{
                    background: inputValue === preset ? '#0284c7' : '#f2f6fa',
                    color: inputValue === preset ? '#ffffff' : '#40566e',
                    border: '1px solid #dce4ed',
                    borderRadius: 2,
                    padding: '2px 6px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {preset} {displayUnit}
                </button>
                )
              })}
            </div>
          </div>

          {/* Scale Preview */}
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.05)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: 3,
              padding: '7px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
            }}
          >
            <div style={{ color: '#52677d' }}>
              อัตราส่วนสเกลใหม่:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0873c4' }}>
              <span>1 px = {formatLengthMm(computedScale, displayUnit)} {displayUnit}</span>
              <ArrowRight size={14} />
              <span style={{ color: '#22c55e' }}>1:1 Real Scale</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid #f2f6fa',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 7,
            background: '#0b1329',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: '#f2f6fa',
              border: '1px solid #dce4ed',
              color: '#40566e',
              borderRadius: 3,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleConfirm}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              border: '1px solid #0873c4',
              color: '#ffffff',
              borderRadius: 3,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.4)',
            }}
          >
            <Check size={14} /> ยืนยันปรับสเกล 1:1
          </button>
        </div>
      </div>
    </div>
  )
}
