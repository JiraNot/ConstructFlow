import React, { useState, useEffect } from 'react'
import { Ruler, Check, X, ArrowRight } from 'lucide-react'

interface UnderlayCalibrationModalProps {
  isOpen: boolean
  onClose: () => void
  measuredDistance_mm: number
  currentScale_mm_per_px: number
  onApplyScale: (newScale_mm_per_px: number, realDistance_mm: number) => void
}

export const UnderlayCalibrationModal: React.FC<UnderlayCalibrationModalProps> = ({
  isOpen,
  onClose,
  measuredDistance_mm,
  currentScale_mm_per_px,
  onApplyScale,
}) => {
  const [inputValue, setInputValue] = useState<string>('4000')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Default to rounded 100mm of measured distance if reasonable
      const rounded = Math.round(measuredDistance_mm / 100) * 100
      setInputValue(rounded > 0 ? String(rounded) : '4000')
      setErrorMsg(null)
    }
  }, [isOpen, measuredDistance_mm])

  if (!isOpen) return null

  // Parse user input (supports e.g. "4000", "4m", "4.0m", "4.5")
  const parseDistanceMm = (text: string): number | null => {
    const trimmed = text.trim().toLowerCase()
    if (!trimmed) return null
    if (trimmed.endsWith('m') && !trimmed.endsWith('mm')) {
      const val = parseFloat(trimmed.replace('m', ''))
      return isNaN(val) || val <= 0 ? null : Math.round(val * 1000)
    }
    const val = parseFloat(trimmed.replace('mm', ''))
    if (isNaN(val) || val <= 0) return null
    // If value is small (< 50), user likely entered meters without typing 'm' (e.g. "4.0")
    if (val < 50) {
      return Math.round(val * 1000)
    }
    return Math.round(val)
  }

  const parsedRealMm = parseDistanceMm(inputValue)
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
    onApplyScale(computedScale, parsedRealMm)
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
          borderRadius: 12,
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
            padding: '16px 20px',
            borderBottom: '1px solid #f2f6fa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #ffffff 0%, #f2f6fa 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
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
                ปรับสเกลภาพแปลน 1:1 ให้ตรงกับระยะจริงในงานก่อสร้าง (mm)
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
              padding: 4,
              borderRadius: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Measured Info Card */}
          <div
            style={{
              background: '#f2f6fa',
              borderRadius: 8,
              padding: '12px 16px',
              border: '1px solid #dce4ed',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: '#52677d' }}>ระยะที่วัดได้บนภาพ (Current Measured):</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b', marginTop: 2 }}>
                {Math.round(measuredDistance_mm).toLocaleString()} mm{' '}
                <span style={{ fontSize: 12, color: '#52677d', fontWeight: 500 }}>
                  ({(measuredDistance_mm / 1000).toFixed(3)} m)
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
              <div>ความกว้างพิกเซล:</div>
              <div style={{ fontFamily: 'monospace', color: '#40566e' }}>{pixelDist.toFixed(1)} px</div>
            </div>
          </div>

          {/* Real Distance Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#24364b' }}>
              ระยะทางจริงระหว่าง 2 จุดนี้ (มม. หรือ เมตร):
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                autoFocus
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setErrorMsg(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                placeholder="เช่น 4000 หรือ 4.0m"
                style={{
                  flex: 1,
                  background: '#0b1329',
                  border: errorMsg ? '1px solid #ef4444' : '1px solid #0284c7',
                  borderRadius: 6,
                  padding: '9px 12px',
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
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                }}
              >
                {parsedRealMm ? `${parsedRealMm.toLocaleString()} mm (${(parsedRealMm / 1000).toFixed(2)} m)` : 'ระบุตัวเลข'}
              </span>
            </div>
            {errorMsg && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{errorMsg}</div>}
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, color: '#52677d' }}>ระยะยอดนิยม (Quick Presets):</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['1000', '2000', '3000', '3500', '4000', '5000', '6000', '8000'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setInputValue(preset)
                    setErrorMsg(null)
                  }}
                  style={{
                    background: inputValue === preset ? '#0284c7' : '#f2f6fa',
                    color: inputValue === preset ? '#ffffff' : '#40566e',
                    border: '1px solid #dce4ed',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {parseInt(preset) / 1000} m ({preset})
                </button>
              ))}
            </div>
          </div>

          {/* Scale Preview */}
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.05)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: 6,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
            }}
          >
            <div style={{ color: '#52677d' }}>
              อัตราส่วนสเกลใหม่:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0873c4' }}>
              <span>1 px = {computedScale.toFixed(3)} mm</span>
              <ArrowRight size={14} />
              <span style={{ color: '#22c55e' }}>1:1 Real Scale</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #f2f6fa',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            background: '#0b1329',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: '#f2f6fa',
              border: '1px solid #dce4ed',
              color: '#40566e',
              borderRadius: 6,
              padding: '7px 14px',
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
              borderRadius: 6,
              padding: '7px 18px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
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
