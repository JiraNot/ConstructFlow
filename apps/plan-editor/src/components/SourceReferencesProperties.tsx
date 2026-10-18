import React, { useMemo, useState } from 'react'
import type { ProjectDocument, ProjectSourceReference, SmartObject } from '@constructflow/project-model'

interface Props {
  project: ProjectDocument
  object: SmartObject
  onUpdate: (objectId: string, sourceRefs: ProjectSourceReference[]) => void
}

const sourceKey = (source: ProjectSourceReference) => `${source.kind}:${source.source_id}`

export function SourceReferencesProperties({ project, object, onUpdate }: Props) {
  const [pending, setPending] = useState('')
  const sources = useMemo(() => {
    const options: Array<{ key: string; source: ProjectSourceReference; label: string }> = []
    for (const point of project.site_survey?.points ?? []) options.push({
      key: `site_survey_point:${point.id}`,
      label: `จุดสำรวจ ${point.name} · ${point.source_status === 'measured' ? 'วัดจริง' : 'สมมติ'} · ${point.source_reference}`,
      source: { kind: 'site_survey_point', source_id: point.id, label: `จุดสำรวจ ${point.name} · ${point.source_status === 'measured' ? 'วัดจริง' : 'สมมติ'} · ${point.source_reference}` },
    })
    for (const boundary of project.site_survey?.boundaries ?? []) {
      const points = boundary.point_ids.map(id => project.site_survey?.points.find(point => point.id === id)).filter(Boolean)
      const statuses = new Set(points.map(point => point!.source_status))
      const status = statuses.size > 1 ? 'มีทั้งวัดจริงและสมมติ' : statuses.has('assumed') ? 'มีค่าที่สมมติ' : 'วัดจริง'
      const label = `แนวเขต ${boundary.name} · ${status}`
      options.push({
        key: `site_survey_boundary:${boundary.id}`,
        source: { kind: 'site_survey_boundary', source_id: boundary.id, label },
        label,
      })
    }
    for (const [key, underlay] of Object.entries(project.underlays ?? {})) {
      const scaleLabel = underlay.scale_source === 'calibrated' ? 'ปรับเทียบแล้ว'
        : underlay.scale_source === 'declared_units' ? 'ใช้หน่วยจากไฟล์' : 'ยังใช้สเกลสมมติ'
      const sourceName = underlay.source_layout ? `${underlay.source_file ?? key} · ${underlay.source_layout}` : underlay.source_file ?? key
      const label = `แบบอ้างอิง ${sourceName} · ${scaleLabel}`
      options.push({
        key: `underlay:${key}`,
        source: { kind: 'underlay', source_id: key, label },
        label,
      })
    }
    return options
  }, [project.site_survey, project.underlays])
  const linked = object.source_refs ?? []
  const linkedKeys = new Set(linked.map(sourceKey))
  const available = sources.filter(option => !linkedKeys.has(option.key))

  return <section aria-label="แหล่งข้อมูลอ้างอิง" style={{ borderTop: '1px solid #dce4ed', paddingTop: 10 }}>
    <label style={{ display: 'block', fontSize: 11, color: '#52677d', fontWeight: 600, marginBottom: 5 }}>แหล่งข้อมูลต้นทาง</label>
    {linked.length === 0 && <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>ยังไม่ได้เชื่อมกับข้อมูลสำรวจหรือแบบอ้างอิง</div>}
    <div style={{ display: 'grid', gap: 4, marginBottom: 6 }}>
      {linked.map(source => {
        const option = sources.find(candidate => candidate.key === sourceKey(source))
        const label = option?.label ?? `${source.label ?? `${source.kind} · ${source.source_id}`} (แหล่งข้อมูลไม่ได้แนบแล้ว)`
        return <div key={sourceKey(source)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 3, background: '#f5f8fc', fontSize: 11 }}>
          <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{label}</span>
          <button type="button" aria-label={`ลบแหล่งอ้างอิง ${source.source_id}`} onClick={() => onUpdate(object.id, linked.filter(item => sourceKey(item) !== sourceKey(source)))} style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}>ลบ</button>
        </div>
      })}
    </div>
    <div style={{ display: 'flex', gap: 5 }}>
      <select aria-label="เลือกแหล่งข้อมูลต้นทาง" value={pending} onChange={event => setPending(event.target.value)} disabled={!available.length} style={{ flex: 1, minWidth: 0 }}>
        <option value="">{available.length ? 'เลือกจุดสำรวจ / แนวเขต / แบบอ้างอิง' : 'ไม่มีแหล่งข้อมูลที่เชื่อมได้'}</option>
        {available.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
      <button type="button" disabled={!pending} onClick={() => {
        const option = available.find(item => item.key === pending)
        if (!option) return
        onUpdate(object.id, [...linked, option.source])
        setPending('')
      }}>เชื่อม</button>
    </div>
  </section>
}
