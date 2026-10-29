import React, { useState, useEffect, useRef } from 'react'
import {
  Zap,
  ZapOff,
  Battery,
  Volume2,
  VolumeX,
  Camera,
  ChevronDown,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import {
  XiaomiLaserBleDriver,
  type BleConnectionStatus,
  type LaserMeasurementResult,
  type LaserBenchmark,
} from '@constructflow/laser-survey'

export interface LaserBleHudPillProps {
  onMeasurementReceived?: (measurement: LaserMeasurementResult) => void
  onOpenPhotoDimensionModal?: () => void
  onApplyDistanceToSelectedWall?: (distanceMm: number) => void
}

// Global driver instance so it persists across view re-renders
let globalLaserDriver: XiaomiLaserBleDriver | null = null

export function getGlobalLaserDriver(): XiaomiLaserBleDriver {
  if (!globalLaserDriver) {
    globalLaserDriver = new XiaomiLaserBleDriver({}, { enabled: true, language: 'th' })
  }
  return globalLaserDriver
}

export const LaserBleHudPill: React.FC<LaserBleHudPillProps> = ({
  onMeasurementReceived,
  onOpenPhotoDimensionModal,
  onApplyDistanceToSelectedWall,
}) => {
  const driver = getGlobalLaserDriver()
  const [status, setStatus] = useState<BleConnectionStatus>(driver.getStatus())
  const [measurement, setMeasurement] = useState<LaserMeasurementResult | null>(driver.getLastMeasurement())
  const [batteryPercent, setBatteryPercent] = useState<number>(driver.getBatteryPercent())
  const [benchmark, setBenchmark] = useState<LaserBenchmark>(driver.getBenchmark())
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(driver.getTtsService().isEnabled())
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false)
  const [flashLive, setFlashLive] = useState<boolean>(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    driver.setEvents({
      onStatusChange: (newStatus: BleConnectionStatus) => {
        setStatus(newStatus)
      },
      onMeasurement: (newMeasure: LaserMeasurementResult) => {
        setMeasurement(newMeasure)
        setBenchmark(newMeasure.benchmark)
        setFlashLive(true)
        setTimeout(() => setFlashLive(false), 300)
        onMeasurementReceived?.(newMeasure)
        onApplyDistanceToSelectedWall?.(newMeasure.distance_mm)
      },
      onBatteryChange: (percent: number) => {
        setBatteryPercent(percent)
      },
    })
  }, [driver, onMeasurementReceived, onApplyDistanceToSelectedWall])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleConnectClick = async () => {
    if (status === 'connected') {
      setIsMenuOpen(!isMenuOpen)
    } else {
      await driver.connect()
    }
  }

  const handleBenchmarkToggle = () => {
    const nextBench = benchmark === 'rear' ? 'front' : 'rear'
    driver.setBenchmark(nextBench)
    setBenchmark(nextBench)
  }

  const handleTtsToggle = () => {
    const nextTts = !ttsEnabled
    driver.getTtsService().setEnabled(nextTts)
    setTtsEnabled(nextTts)
  }

  const handleSimulate = (distM: number) => {
    driver.simulateMeasurement(distM, benchmark)
  }

  return (
    <div className="cf-laser-hud-container" ref={menuRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {/* HUD Pill Button */}
      <button
        type="button"
        className={`cf-laser-hud-pill ${status === 'connected' ? 'is-connected' : ''} ${flashLive ? 'is-flashing' : ''}`}
        aria-label={status === 'connected' ? `เลเซอร์เชื่อมต่อแล้ว${measurement ? ` วัดได้ ${measurement.distance_m.toFixed(3)} เมตร` : ''} เปิดตัวเลือก` : status === 'connecting' || status === 'scanning' ? 'กำลังเชื่อมต่อเลเซอร์' : 'เชื่อมต่อเลเซอร์ Xiaomi'}
        onClick={handleConnectClick}
        title={status === 'connected' ? 'คลิกเพื่อดูตัวเลือกเลเซอร์' : 'คลิกเพื่อเชื่อมต่อ Xiaomi Smart Laser Measure ผ่าน Bluetooth'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          height: '28px',
          padding: '0 10px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: '"JetBrains Mono", monospace',
          border: '1px solid',
          borderColor: status === 'connected' ? '#00E5FF' : '#334155',
          background: status === 'connected' ? '#0B132B' : '#0F172A',
          color: status === 'connected' ? '#00E5FF' : '#94A3B8',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: status === 'connected' ? '0 0 10px rgba(0, 229, 255, 0.2)' : 'none',
        }}
      >
        {status === 'connected' ? (
          <>
            <span style={{ color: '#FF3B30', display: 'flex', alignItems: 'center' }}>
              <Zap size={13} fill="#FF3B30" />
            </span>
            <span style={{ color: '#FFFFFF', letterSpacing: '-0.3px', fontWeight: 700 }}>
              {measurement ? `${measurement.distance_m.toFixed(3)} m` : 'พร้อมยิงระยะ'}
            </span>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 4px',
                borderRadius: '3px',
                background: '#1E293B',
                color: '#94A3B8',
              }}
              title={benchmark === 'rear' ? 'อ้างอิงท้ายเครื่อง (Rear)' : 'อ้างอิงหัวเครื่อง (Front)'}
            >
              {benchmark === 'rear' ? 'REAR' : 'FRONT'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#10B981', fontSize: '10px' }}>
              <Battery size={12} />
              {batteryPercent}%
            </span>
            <ChevronDown size={12} style={{ opacity: 0.7 }} />
          </>
        ) : status === 'connecting' || status === 'scanning' ? (
          <>
            <RotateCcw size={13} className="cf-spin" />
            <span>กำลังสแกนหา Xiaomi...</span>
          </>
        ) : (
          <>
            <Zap size={13} style={{ color: '#F59E0B' }} />
            <span>ต่อเลเซอร์ Xiaomi</span>
          </>
        )}
      </button>

      {/* Quick Action: Photo Dimension Shortcut Button */}
      {onOpenPhotoDimensionModal && (
        <button
          type="button"
          className="cf-laser-photo-button"
          aria-label="ถ่ายรูปใส่ระยะ"
          onClick={onOpenPhotoDimensionModal}
          title="ถ่ายรูปใส่ระยะหน้างาน (Photo Dimension)"
          style={{
            marginLeft: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '28px',
            padding: '0 8px',
            borderRadius: '6px',
            fontSize: '11px',
            border: '1px solid #334155',
            background: '#1E293B',
            color: '#38BDF8',
            cursor: 'pointer',
            gap: '4px',
          }}
        >
          <Camera size={13} />
          <span aria-hidden="true">ถ่ายรูปใส่ระยะ</span>
        </button>
      )}

      {/* Dropdown Menu Popover */}
      {isMenuOpen && (
        <div
          style={{
            position: 'absolute',
            top: '34px',
            left: 0,
            zIndex: 1000,
            minWidth: '220px',
            background: '#0B0F17',
            border: '1px solid #232F46',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
            padding: '8px',
            color: '#F8FAFC',
            fontSize: '12px',
          }}
        >
          <div style={{ padding: '4px 8px', borderBottom: '1px solid #1E293B', marginBottom: '6px', fontWeight: 600, color: '#94A3B8' }}>
            Xiaomi Smart Laser (MJJGCJYD001QW)
          </div>

          <button
            type="button"
            onClick={handleBenchmarkToggle}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: '#FFFFFF',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1E293B')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span>จุดอ้างอิงเครื่องวัด:</span>
            <span style={{ color: '#00E5FF', fontWeight: 700 }}>
              {benchmark === 'rear' ? 'ท้ายเครื่อง (Rear ⌸)' : 'หัวเครื่อง (Front ⌹)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleTtsToggle}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: '#FFFFFF',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1E293B')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {ttsEnabled ? <Volume2 size={14} color="#10B981" /> : <VolumeX size={14} color="#64748B" />}
              <span>เสียงพูดภาษาไทย (TTS):</span>
            </span>
            <span style={{ color: ttsEnabled ? '#10B981' : '#64748B', fontWeight: 600 }}>
              {ttsEnabled ? 'เปิด' : 'ปิด'}
            </span>
          </button>

          <div style={{ margin: '6px 0', borderTop: '1px solid #1E293B' }} />

          <div style={{ padding: '4px 8px', fontSize: '11px', color: '#64748B' }}>
            จำลองค่าวัดระยะ (Demo / ทดสอบ):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', padding: '0 4px 6px' }}>
            {[1.2, 2.45, 3.5, 4.25].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleSimulate(d)}
                style={{
                  padding: '3px 0',
                  borderRadius: '3px',
                  border: '1px solid #334155',
                  background: '#1E293B',
                  color: '#CBD5E1',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                {d}m
              </button>
            ))}
          </div>

          <div style={{ margin: '4px 0', borderTop: '1px solid #1E293B' }} />

          <button
            type="button"
            onClick={() => {
              driver.disconnect()
              setIsMenuOpen(false)
            }}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: '#EF4444',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <ZapOff size={14} />
            <span>ตัดการเชื่อมต่อ Bluetooth</span>
          </button>
        </div>
      )}
    </div>
  )
}
