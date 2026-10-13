import React from 'react'
import { ProjectDocument, SmartObject } from '@constructflow/project-model'
import { evaluateRoomVentilationCompliance } from '@constructflow/clash-engine'
import { formatRoomAreaM2 } from '../roomLabel.mjs'

type RoomPropertiesSectionProps = {
  project: ProjectDocument
  room: SmartObject | null
  onCreateRoomFinish?: (kind: 'floor' | 'ceiling', roomId: string) => void
}

export const RoomPropertiesSection: React.FC<RoomPropertiesSectionProps> = ({ project, room: roomObj, onCreateRoomFinish }) => {
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }
  const roomData = roomObj?.module_data as Record<string, unknown> | undefined
  const roomBoundaryOpen = roomData?.boundary_status === 'unclosed'
  const roomAreaLabel = formatRoomAreaM2(roomData?.area_mm2, roomData?.boundary_status)
  const roomLastKnownAreaLabel = roomBoundaryOpen ? formatRoomAreaM2(roomData?.area_mm2, 'closed') : roomAreaLabel
  return (
    <>
      {roomObj && (() => {
        const ventSummary = evaluateRoomVentilationCompliance(project, roomObj.id)
        const roomVent = ventSummary.rooms[0]

        return (
          <section style={{ display: 'grid', gap: 7, padding: 7, border: '1px solid #dbe3ed', borderRadius: 4, background: '#fafcff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>ห้อง {String((roomObj.module_data as Record<string,unknown>).number ?? '')} · {String((roomObj.module_data as Record<string,unknown>).name ?? '')}</strong>
              <span style={{ fontSize: 10, padding: '2px 4px', borderRadius: 2, background: roomVent?.overall_status === 'pass' ? '#dcfce7' : '#fee2e2', color: roomVent?.overall_status === 'pass' ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                {roomVent?.overall_status === 'pass' ? 'ผ่านเกณฑ์ ✅' : 'ไม่ผ่านเกณฑ์ ⚠️'}
              </span>
            </div>

            <span style={{ fontSize: 11, color: roomBoundaryOpen ? '#b91c1c' : '#52677d' }}>
              {roomBoundaryOpen ? `วงผนังเปิด · พื้นที่ล่าสุด ${roomLastKnownAreaLabel ?? 'ไม่ระบุ'} ตร.ม. ใช้เป็นค่าปัจจุบันไม่ได้` : `พื้นที่ ${roomAreaLabel ?? 'ไม่ระบุ'} ตร.ม. · ขอบเขตตามผนัง/เส้นแบ่งห้อง`}
            </span>

            {/* Thai Building Code MR55 Natural Light & Ventilation Gauge */}
            {roomVent && (
              <details className="cf-inspector-section">
                <summary>แสง {roomVent.daylight_ratio_percent.toFixed(1)}% · ระบายอากาศ {roomVent.ventilation_ratio_percent.toFixed(1)}% · {roomVent.overall_status === 'pass' ? 'ผ่านเกณฑ์' : 'ตรวจเกณฑ์'}</summary>
              <div style={{ display: 'grid', gap: 6, background: '#ffffff', padding: 6, borderRadius: 3, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                  การระบายอากาศและแสงสว่าง (กฎกระทรวง ฉบับที่ 55)
                </div>

                {/* Daylighting */}
                <div style={{ display: 'grid', gap: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#475569' }}>☀️ แสงสว่างธรรมชาติ:</span>
                    <strong style={{ color: roomVent.daylight_status === 'pass' ? '#15803d' : '#b91c1c' }}>
                      {roomVent.total_daylight_area_sq_m.toFixed(2)} ตร.ม. ({roomVent.daylight_ratio_percent.toFixed(1)}%)
                    </strong>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, (roomVent.daylight_ratio_percent / 10) * 100)}%`,
                      height: '100%',
                      background: roomVent.daylight_status === 'pass' ? '#22c55e' : '#f59e0b',
                      borderRadius: 2,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
                    <span>เกณฑ์: &ge; {roomVent.required_daylight_percent}% ({((roomVent.floor_area_sq_m * roomVent.required_daylight_percent) / 100).toFixed(2)} ตร.ม.)</span>
                    <span>{roomVent.daylight_status === 'pass' ? '✅ ผ่าน' : '⚠️ ต่ำกว่าเกณฑ์'}</span>
                  </div>
                </div>

                {/* Ventilation */}
                <div style={{ display: 'grid', gap: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#475569' }}>💨 ระบายอากาศธรรมชาติ:</span>
                    <strong style={{ color: roomVent.ventilation_status === 'pass' ? '#15803d' : '#b91c1c' }}>
                      {roomVent.total_ventilation_area_sq_m.toFixed(2)} ตร.ม. ({roomVent.ventilation_ratio_percent.toFixed(1)}%)
                    </strong>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, roomVent.room_type === 'bathroom' ? (roomVent.total_ventilation_area_sq_m / 0.2) * 100 : (roomVent.ventilation_ratio_percent / 10) * 100)}%`,
                      height: '100%',
                      background: roomVent.ventilation_status === 'pass' ? '#22c55e' : '#f59e0b',
                      borderRadius: 2,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
                    <span>
                      {roomVent.room_type === 'bathroom'
                        ? 'เกณฑ์ห้องน้ำ: &ge; 0.20 ตร.ม. หรือ 10%'
                        : `เกณฑ์: &ge; ${roomVent.required_ventilation_percent}% (${((roomVent.floor_area_sq_m * roomVent.required_ventilation_percent) / 100).toFixed(2)} ตร.ม.)`}
                    </span>
                    <span>{roomVent.ventilation_status === 'pass' ? '✅ ผ่าน' : '⚠️ ต่ำกว่าเกณฑ์'}</span>
                  </div>
                </div>

                {/* Openings list */}
                {roomVent.exterior_openings.length > 0 ? (
                  <div style={{ fontSize: 10, color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>ช่องเปิดสู่ภายนอก ({roomVent.exterior_openings.length} ช่อง):</span>
                    {roomVent.exterior_openings.map((op) => (
                      <div key={op.opening_id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        <span>• {op.mark} ({op.width_m.toFixed(2)}&times;{op.height_m.toFixed(2)} ม.)</span>
                        <span>ระบาย {(op.ventilation_ratio * 100).toFixed(0)}% / แสง {(op.daylight_ratio * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
                    ไม่มีช่องเปิดสู่ภายนอกอาคาร
                  </div>
                )}
              </div>
              </details>
            )}

            <button type="button" disabled={roomBoundaryOpen} title={roomBoundaryOpen ? 'ปิดวงผนังและตรวจพื้นที่ก่อนสร้างพื้นตามห้อง' : undefined} onClick={() => onCreateRoomFinish?.('floor', roomObj.id)} style={verticalSelectStyle}>สร้างพื้นสถาปัตย์ตามห้อง</button>
            <button type="button" disabled={roomBoundaryOpen} title={roomBoundaryOpen ? 'ปิดวงผนังและตรวจพื้นที่ก่อนสร้างฝ้าตามห้อง' : undefined} onClick={() => onCreateRoomFinish?.('ceiling', roomObj.id)} style={verticalSelectStyle}>สร้างฝ้าตามห้อง</button>
          </section>
        )
      })()}
    </>
  )
}
