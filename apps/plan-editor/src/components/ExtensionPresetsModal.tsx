import React, { useState } from 'react'
import {
  ProjectDocument,
  lengthUnitFactor,
} from '@constructflow/project-model'
import type { DisplayLengthUnit } from '@constructflow/project-model'
import { CommandEnvelope, ExtensionPresetType } from '@constructflow/command-schema'
import { applyExtensionPreset } from '@constructflow/extension-engine'
import {
  Sparkles,
  Car,
  Utensils,
  TreePine,
  Check,
  X,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react'

export type { ExtensionPresetType } from '@constructflow/command-schema'

interface ExtensionPresetsModalProps {
  isOpen: boolean
  onClose: () => void
  project: ProjectDocument
  onApplyPreset: (updatedProject: ProjectDocument, envelopes: CommandEnvelope[]) => void
}

export const ExtensionPresetsModal: React.FC<ExtensionPresetsModalProps> = ({
  isOpen,
  onClose,
  project,
  onApplyPreset,
}) => {
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [activePreset, setActivePreset] = useState<ExtensionPresetType>('carport')

  // Common Placement Parameters (in METERS)
  const [posX_m, setPosX_m] = useState<number>(0.0)
  const [posY_m, setPosY_m] = useState<number>(0.0)
  const [width_m, setWidth_m] = useState<number>(5.0)
  const [length_m, setLength_m] = useState<number>(5.5)

  // Carport specific
  const [carportColumnType, setCarportColumnType] = useState<string>('SC1') // Steel H-Beam or C1

  // Kitchen specific
  const [kitchenWallHeight_m, setKitchenWallHeight_m] = useState<number>(2.8)
  const [kitchenIncludeDoor, setKitchenIncludeDoor] = useState<boolean>(true)
  const [kitchenIncludeWindow, setKitchenIncludeWindow] = useState<boolean>(true)
  const [kitchenWallSides, setKitchenWallSides] = useState<3 | 4>(3) // 3 walls for side attached to house

  // Terrace specific
  const [terraceElevation_m, setTerraceElevation_m] = useState<number>(0.45)
  const displayUnit: DisplayLengthUnit = project.project.display_unit ?? 'm'
  const unitsPerMeter = 1000 / lengthUnitFactor(displayUnit)
  const fromMeters = (meters: number) => meters * unitsPerMeter
  const toMeters = (value: number) => value / unitsPerMeter

  if (!isOpen) return null

  // Handle Preset Switching with sensible default dimensions
  const handleSelectPreset = (preset: ExtensionPresetType) => {
    setGenerationError(null)
    setActivePreset(preset)
    if (preset === 'carport') {
      setWidth_m(5.0)
      setLength_m(5.5)
      setPosX_m(0.0)
      setPosY_m(0.0)
    } else if (preset === 'kitchen') {
      setWidth_m(4.0)
      setLength_m(2.5)
      setPosX_m(0.0)
      setPosY_m(4.0)
    } else if (preset === 'terrace') {
      setWidth_m(3.0)
      setLength_m(4.0)
      setPosX_m(4.0)
      setPosY_m(0.0)
    }
  }

  const handleGenerate = () => {
    const response = applyExtensionPreset(project, {
      preset: activePreset, posX_m, posY_m, width_m, length_m,
      carportColumnType, kitchenWallHeight_m, kitchenIncludeDoor, kitchenIncludeWindow,
      kitchenWallSides, terraceElevation_m,
    })
    if (response.status !== 'success') {
      setGenerationError(response.errors?.join('; ') || 'ไม่สามารถสร้างส่วนต่อเติมได้')
      return
    }
    setGenerationError(null)
    onApplyPreset(response.updatedProject, response.emittedEnvelopes)
    onClose()
  }

  return (
    <div className="cf-legacy-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 860,
          maxHeight: '92vh',
          background: '#ffffff',
          border: '1px solid #dce4ed',
          borderRadius: 6,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '11px 14px',
            background: 'linear-gradient(90deg, #f2f6fa 0%, #ffffff 100%)',
            borderBottom: '1px solid #dce4ed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 4,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#24364b' }}>
                สร้างส่วนต่อเติมสำเร็จรูป (Parametric Extension Presets)
              </h2>
              <p style={{ margin: 0, fontSize: 12, color: '#52677d' }}>
                สั่งสร้างโครงสร้างและสถาปัตย์แบบครบวงจรใน 1 คลิก พร้อมแยกเฟสสร้างใหม่ (New Construction) อัตโนมัติ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#52677d',
              cursor: 'pointer',
              padding: 3,
              borderRadius: 2,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Preset Selector Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '16px 20px 0' }}>
          {/* Preset 1: Carport */}
          <div
            onClick={() => handleSelectPreset('carport')}
            style={{
              padding: '8px 10px',
              borderRadius: 4,
              border: activePreset === 'carport' ? '2px solid #0873c4' : '1px solid #dce4ed',
              background: activePreset === 'carport' ? 'rgba(56, 189, 248, 0.1)' : '#f2f6fa',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#24364b', fontSize: 13 }}>
                <Car size={16} color="#0873c4" />
                <span>โรงจอดรถหน้าบ้าน</span>
              </div>
              {activePreset === 'carport' && <Check size={16} color="#0873c4" />}
            </div>
            <div style={{ fontSize: 11, color: '#52677d', lineHeight: 1.4 }}>
              โครงเสาเหล็ก / ฐานราก / คานรอบและคานกลาง
            </div>
            <div style={{ fontSize: 10, color: '#0873c4', marginTop: 'auto' }}>
              ค่าเริ่มต้น: 5.00 × 5.50 ม.
            </div>
          </div>

          {/* Preset 2: Kitchen */}
          <div
            onClick={() => handleSelectPreset('kitchen')}
            style={{
              padding: '8px 10px',
              borderRadius: 4,
              border: activePreset === 'kitchen' ? '2px solid #f97316' : '1px solid #dce4ed',
              background: activePreset === 'kitchen' ? 'rgba(249, 115, 22, 0.1)' : '#f2f6fa',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#24364b', fontSize: 13 }}>
                <Utensils size={16} color="#f97316" />
                <span>ครัวไทยหลังบ้าน</span>
              </div>
              {activePreset === 'kitchen' && <Check size={16} color="#f97316" />}
            </div>
            <div style={{ fontSize: 11, color: '#52677d', lineHeight: 1.4 }}>
              แยกโครงสร้างอิสระ / ฐานรากเข็ม / ผนังมวลเบา / ประตู D1 + หน้าต่าง W1
            </div>
            <div style={{ fontSize: 10, color: '#f97316', marginTop: 'auto' }}>
              ค่าเริ่มต้น: 4.00 × 2.50 ม.
            </div>
          </div>

          {/* Preset 3: Terrace */}
          <div
            onClick={() => handleSelectPreset('terrace')}
            style={{
              padding: '8px 10px',
              borderRadius: 4,
              border: activePreset === 'terrace' ? '2px solid #22c55e' : '1px solid #dce4ed',
              background: activePreset === 'terrace' ? 'rgba(34, 197, 94, 0.1)' : '#f2f6fa',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#24364b', fontSize: 13 }}>
                <TreePine size={16} color="#22c55e" />
                <span>เทอเรสระเบียงไม้เทียม</span>
              </div>
              {activePreset === 'terrace' && <Check size={16} color="#22c55e" />}
            </div>
            <div style={{ fontSize: 11, color: '#52677d', lineHeight: 1.4 }}>
              เสา คสล. / ฐานราก / คานเหล็กรองรับระเบียง
            </div>
            <div style={{ fontSize: 10, color: '#22c55e', marginTop: 'auto' }}>
              ค่าเริ่มต้น: 3.00 × 4.00 ม.
            </div>
          </div>
        </div>

        {/* Main Configuration & Blueprint Preview */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 11, padding: 14, overflowY: 'auto' }}>
          {/* Left Column: Form Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: '#f2f6fa', padding: 10, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#40566e' }}>1. ขนาดและตำแหน่ง ({displayUnit})</span>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#52677d' }}>ความกว้าง (Width):</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <input
                      type="number"
                      step={0.1 * unitsPerMeter}
                      min={1 * unitsPerMeter}
                      max={20 * unitsPerMeter}
                      value={fromMeters(width_m)}
                      onChange={(e) => setWidth_m(toMeters(parseFloat(e.target.value) || 1.0))}
                      style={{
                        width: '100%',
                        background: '#ffffff',
                        border: '1px solid #dce4ed',
                        borderRadius: 3,
                        color: '#24364b',
                        padding: '4px 7px',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#52677d' }}>{displayUnit}</span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#52677d' }}>ความยาว/ลึก (Length):</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <input
                      type="number"
                      step={0.1 * unitsPerMeter}
                      min={1 * unitsPerMeter}
                      max={20 * unitsPerMeter}
                      value={fromMeters(length_m)}
                      onChange={(e) => setLength_m(toMeters(parseFloat(e.target.value) || 1.0))}
                      style={{
                        width: '100%',
                        background: '#ffffff',
                        border: '1px solid #dce4ed',
                        borderRadius: 3,
                        color: '#24364b',
                        padding: '4px 7px',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#52677d' }}>{displayUnit}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#52677d' }}>พิกัดจุดเริ่มต้น X:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <input
                      type="number"
                      step="0.50"
                      value={fromMeters(posX_m)}
                      onChange={(e) => setPosX_m(toMeters(parseFloat(e.target.value) || 0))}
                      style={{
                        width: '100%',
                        background: '#ffffff',
                        border: '1px solid #dce4ed',
                        borderRadius: 3,
                        color: '#24364b',
                        padding: '4px 7px',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#52677d' }}>{displayUnit}</span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#52677d' }}>พิกัดจุดเริ่มต้น Y:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <input
                      type="number"
                      step="0.50"
                      value={fromMeters(posY_m)}
                      onChange={(e) => setPosY_m(toMeters(parseFloat(e.target.value) || 0))}
                      style={{
                        width: '100%',
                        background: '#ffffff',
                        border: '1px solid #dce4ed',
                        borderRadius: 3,
                        color: '#24364b',
                        padding: '4px 7px',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#52677d' }}>{displayUnit}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Specific Preset Options */}
            <div style={{ background: '#f2f6fa', padding: 10, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#40566e' }}>
                2. พารามิเตอร์เฉพาะส่วนต่อเติม (Specific Options)
              </span>

              {activePreset === 'carport' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: '#52677d' }}>สเปกเสาโครงสร้าง:</label>
                    <select
                      value={carportColumnType}
                      onChange={(e) => setCarportColumnType(e.target.value)}
                      style={{ background: '#ffffff', color: '#24364b', border: '1px solid #dce4ed', borderRadius: 2, padding: '3px 6px', fontSize: 12 }}
                    >
                      <option value="SC1">เสาเหล็ก SC1 (150×150 มม.)</option>
                      <option value="C1">คอนกรีต คสล. C1 (200×200 มม.)</option>
                    </select>
                  </div>
                  <div style={{ fontSize: 11, color: '#52677d' }}>สร้างเสา ฐานราก และคาน; ยังไม่รวมพื้นและหลังคา</div>
                </>
              )}

              {activePreset === 'kitchen' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: '#52677d' }}>ความสูงผนัง (Wall Height):</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                      step={0.1 * unitsPerMeter}
                        min={2 * unitsPerMeter}
                        max={4 * unitsPerMeter}
                        value={fromMeters(kitchenWallHeight_m)}
                        onChange={(e) => setKitchenWallHeight_m(toMeters(parseFloat(e.target.value) || fromMeters(2.8)))}
                        style={{ width: 60, background: '#ffffff', color: '#24364b', border: '1px solid #dce4ed', borderRadius: 2, padding: '3px 4px', fontSize: 12, textAlign: 'center' }}
                      />
                      <span style={{ fontSize: 11, color: '#52677d' }}>{displayUnit}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: '#52677d' }}>จำนวนด้านผนังที่ก่อ:</label>
                    <select
                      value={kitchenWallSides}
                      onChange={(e) => setKitchenWallSides(parseInt(e.target.value) as 3 | 4)}
                      style={{ background: '#ffffff', color: '#24364b', border: '1px solid #dce4ed', borderRadius: 2, padding: '3px 6px', fontSize: 12 }}
                    >
                      <option value="3">3 ด้าน (แนวชนบ้านเดิมแยกขาด Expansion Joint)</option>
                      <option value="4">4 ด้านอิสระ (Fully Enclosed)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#40566e', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={kitchenIncludeDoor}
                        onChange={(e) => setKitchenIncludeDoor(e.target.checked)}
                      />
                      รวมประตู D1 (0.90 ม.)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#40566e', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={kitchenIncludeWindow}
                        onChange={(e) => setKitchenIncludeWindow(e.target.checked)}
                      />
                      รวมหน้าต่างระบายอากาศ W1 (1.20 ม.)
                    </label>
                  </div>
                </>
              )}

              {activePreset === 'terrace' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: '#52677d' }}>ระดับความสูงพื้น (Elevation):</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        step={0.05 * unitsPerMeter}
                        min={0.1 * unitsPerMeter}
                        max={1.5 * unitsPerMeter}
                        value={fromMeters(terraceElevation_m)}
                        onChange={(e) => setTerraceElevation_m(toMeters(parseFloat(e.target.value) || fromMeters(0.45)))}
                        style={{ width: 60, background: '#ffffff', color: '#24364b', border: '1px solid #dce4ed', borderRadius: 2, padding: '3px 4px', fontSize: 12, textAlign: 'center' }}
                      />
                      <span style={{ fontSize: 11, color: '#52677d' }}>{displayUnit}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#52677d' }}>สร้างโครงรองรับ; ยังไม่รวมแผ่นพื้น WPC และบันได</div>
                </>
              )}
            </div>
          </div>

          {/* Right Column: Live SVG Blueprint Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#40566e' }}>
              แผนผังจำลอง (Live Schematic Preview)
            </span>

            <div
              style={{
                height: 240,
                background: '#070d1e',
                borderRadius: 4,
                border: '1px solid #f2f6fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Dynamic SVG Blueprint */}
              <svg width="280" height="200" viewBox="0 0 280 200" style={{ overflow: 'visible' }}>
                <defs>
                  <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f2f6fa" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="280" height="200" fill="url(#gridPattern)" />

                {/* Framing Boundary Box */}
                <rect
                  x="40"
                  y="30"
                  width="180"
                  height="130"
                  fill={activePreset === 'carport' ? 'rgba(56, 189, 248, 0.08)' : activePreset === 'kitchen' ? 'rgba(249, 115, 22, 0.08)' : 'rgba(34, 197, 94, 0.08)'}
                  stroke={activePreset === 'carport' ? '#0873c4' : activePreset === 'kitchen' ? '#f97316' : '#22c55e'}
                  strokeWidth="2"
                  strokeDasharray={activePreset === 'terrace' ? '4,4' : 'none'}
                />

                {/* Footings (Amber squares) */}
                <rect x="30" y="20" width="20" height="20" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth="1" />
                <rect x="210" y="20" width="20" height="20" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth="1" />
                <rect x="210" y="150" width="20" height="20" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth="1" />
                <rect x="30" y="150" width="20" height="20" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth="1" />

                {/* Columns (Blue filled squares) */}
                <rect x="36" y="26" width="8" height="8" fill="#0873c4" />
                <rect x="216" y="26" width="8" height="8" fill="#0873c4" />
                <rect x="216" y="156" width="8" height="8" fill="#0873c4" />
                <rect x="36" y="156" width="8" height="8" fill="#0873c4" />

                {/* Middle Support for Terrace or Carport */}
                {activePreset === 'terrace' && (
                  <>
                    <rect x="120" y="20" width="20" height="20" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth="1" />
                    <rect x="120" y="150" width="20" height="20" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth="1" />
                    <rect x="126" y="26" width="8" height="8" fill="#0873c4" />
                    <rect x="126" y="156" width="8" height="8" fill="#0873c4" />
                  </>
                )}

                {/* Door / Window indicators if Kitchen */}
                {activePreset === 'kitchen' && (
                  <>
                    {/* Door D1 on South wall */}
                    <path d="M 120 160 A 20 20 0 0 1 140 180" fill="none" stroke="#22c55e" strokeWidth="1.5" />
                    <line x1="120" y1="160" x2="120" y2="180" stroke="#22c55e" strokeWidth="1.5" />
                    <text x="130" y="194" fill="#4ade80" fontSize="9" textAnchor="middle" fontFamily="monospace">D1 (0.90 m)</text>

                    {/* Window W1 on North wall */}
                    <rect x="110" y="28" width="40" height="4" fill="#06b6d4" />
                    <text x="130" y="18" fill="#06b6d4" fontSize="9" textAnchor="middle" fontFamily="monospace">W1 (1.20 m)</text>
                  </>
                )}

                {/* Dimensions */}
                {/* Top Width Dimension */}
                <line x1="40" y1="15" x2="220" y2="15" stroke="#52677d" strokeWidth="1" />
                <line x1="40" y1="10" x2="40" y2="20" stroke="#52677d" strokeWidth="1" />
                <line x1="220" y1="10" x2="220" y2="20" stroke="#52677d" strokeWidth="1" />
                <text x="130" y="10" fill="#24364b" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                  {width_m.toFixed(2)} m
                </text>

                {/* Right Length Dimension */}
                <line x1="245" y1="30" x2="245" y2="160" stroke="#52677d" strokeWidth="1" />
                <line x1="240" y1="30" x2="250" y2="30" stroke="#52677d" strokeWidth="1" />
                <line x1="240" y1="160" x2="250" y2="160" stroke="#52677d" strokeWidth="1" />
                <text x="255" y="100" fill="#24364b" fontSize="10" fontWeight="bold" textAnchor="start" fontFamily="monospace">
                  {length_m.toFixed(2)} m
                </text>
              </svg>
            </div>

            {/* Bill of Elements Generated */}
            <div
              style={{
                padding: '7px 8px',
                background: '#f2f6fa',
                borderRadius: 3,
                fontSize: 11,
                color: '#52677d',
                lineHeight: 1.5,
                border: '1px solid #dce4ed',
              }}
            >
              <div style={{ color: '#40566e', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Layers size={13} color="#0873c4" />
                <span>รายการชิ้นส่วนที่จะถูกสร้างอัตโนมัติ:</span>
              </div>
              {activePreset === 'carport' && (
                <div>• เสา 4 ต้น ({carportColumnType}) • ฐานราก 4 ฐาน (F1) • คาน 4-5 ช่วง (B1/B2) • เฟสงาน: ส่วนสร้างใหม่</div>
              )}
              {activePreset === 'kitchen' && (
                <div>• เสา 4 ต้น (C1) • ฐานรากแผ่ 4 ฐาน (F1) • คาน 4 ช่วง (B1) • ผนังมวลเบา {kitchenWallSides} ด้าน (W1) {kitchenIncludeDoor ? '• ประตู D1' : ''} {kitchenIncludeWindow ? '• หน้าต่าง W1' : ''}</div>
              )}
              {activePreset === 'terrace' && (
                <div>• เสา คสล. 6 ต้น (C1) • ฐานราก 6 ฐาน (F1) • คานเหล็ก 5 ช่วง</div>
              )}
            </div>
          </div>
        </div>

        {generationError && <div role="alert" style={{ padding: '7px 14px', color: '#fca5a5' }}>{generationError}</div>}

        {/* Footer Actions */}
        <div
          style={{
            padding: '10px 14px',
            background: '#0b1329',
            borderTop: '1px solid #f2f6fa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 11, color: '#64748b' }}>
            * ทุกชิ้นงานแก้ไขหรือลบต่อได้ทันที และการเชื่อมโยงข้อมูลจะคงอยู่
          </div>

          <div style={{ display: 'flex', gap: 7 }}>
            <button
              onClick={onClose}
              style={{
                background: '#f2f6fa',
                border: '1px solid #dce4ed',
                color: '#40566e',
                padding: '5px 10px',
                borderRadius: 3,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ยกเลิก
            </button>

            <button
              onClick={handleGenerate}
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '5px 12px',
                borderRadius: 3,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: '0 2px 4px rgba(245, 158, 11, 0.3)',
              }}
            >
              <Sparkles size={14} />
              <span>สั่งสร้างส่วนต่อเติมทันที</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
