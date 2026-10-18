import React from 'react'
import {
  formatLengthMm,
  resolveColumnVerticalExtent,
  resolveOpeningVerticalExtent,
  resolveWallVerticalExtent,
  type DisplayLengthUnit,
  type ProjectDocument,
  type SmartObject,
} from '@constructflow/project-model'

type GuideView = { label: string; horizontal: number; vertical: number; horizontalLabel: string; verticalLabel: string }
type Guide = { title: string; views: GuideView[] }

const positive = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

function dimensionsFor(project: ProjectDocument, object: SmartObject): Guide | null {
  const data = object.module_data as Record<string, unknown>
  const section = Array.isArray(data.section_mm) ? data.section_mm.map(Number) : []
  const size = Array.isArray(data.size_mm) ? data.size_mm.map(Number) : []
  const unit = (horizontal: number | undefined, vertical: number | undefined, label: string, horizontalLabel: string, verticalLabel: string): GuideView | null =>
    horizontal && vertical ? { label, horizontal, vertical, horizontalLabel, verticalLabel } : null

  switch (object.object_type) {
    case 'architecture.wall': {
      const wall = data as unknown as { length_mm?: number; thickness_mm?: number; height_mm?: number }
      const height = resolveWallVerticalExtent(project, object)?.height_mm ?? wall.height_mm
      const length = positive(wall.length_mm)
      const thickness = positive(wall.thickness_mm)
      return { title: 'ขนาดผนัง', views: [
        unit(length, thickness, 'แปลน', 'ยาว', 'หนา'),
        unit(length, positive(height), 'รูปด้าน', 'ยาว', 'สูง'),
        unit(thickness, positive(height), 'รูปตัด', 'หนา', 'สูง'),
      ].filter((view): view is GuideView => !!view) }
    }
    case 'structure.column': {
      const extent = resolveColumnVerticalExtent(project, object)
      return { title: 'หน้าตัดและความสูงเสา', views: [
        unit(positive(section[0]), positive(section[1]), 'แปลน', 'กว้าง', 'ลึก'),
        unit(positive(section[0]), positive(extent?.height_mm), 'รูปด้าน', 'กว้าง', 'สูง'),
      ].filter((view): view is GuideView => !!view) }
    }
    case 'structure.beam': {
      const span = positive(data.span_mm) ?? (() => {
        const start = data.start_point_mm as number[] | undefined, end = data.end_point_mm as number[] | undefined
        return start && end ? Math.hypot(end[0] - start[0], end[1] - start[1]) : undefined
      })()
      return { title: 'ช่วงคานและหน้าตัด', views: [
        unit(positive(span), positive(section[1]), 'รูปด้าน', 'ช่วง', 'ลึก'),
        unit(positive(section[0]), positive(section[1]), 'รูปตัด', 'กว้าง', 'ลึก'),
      ].filter((view): view is GuideView => !!view) }
    }
    case 'structure.foundation':
      return { title: 'ฐานราก', views: [
        unit(positive(size[0]), positive(size[1]), 'แปลน', 'กว้าง', 'ยาว'),
        unit(positive(size[0]), positive(size[2]), 'รูปตัด', 'กว้าง', 'หนา'),
      ].filter((view): view is GuideView => !!view) }
    case 'door_window.door':
    case 'door_window.window': {
      const extent = resolveOpeningVerticalExtent(project, object)
      const host = project.objects[String(data.wall_id)]
      const hostThickness = host?.object_type === 'architecture.wall' ? positive((host.module_data as Record<string, unknown>).thickness_mm) : undefined
      return { title: object.object_type === 'door_window.door' ? 'ขนาดประตู' : 'ขนาดหน้าต่าง', views: [
        unit(positive(data.width_mm), positive(extent?.height_mm ?? data.height_mm), 'รูปด้าน', 'กว้าง', 'สูง'),
        unit(positive(data.width_mm), hostThickness, 'แปลน', 'กว้าง', 'ผนัง'),
      ].filter((view): view is GuideView => !!view) }
    }
    case 'structure.slab':
    case 'architecture.floor':
    case 'architecture.ceiling':
    case 'roof.system': {
      const boundary = Array.isArray(data.boundary_mm) ? data.boundary_mm as number[][] : []
      const xs = boundary.map(point => Number(point[0])).filter(Number.isFinite)
      const ys = boundary.map(point => Number(point[1])).filter(Number.isFinite)
      const width = xs.length ? Math.max(...xs) - Math.min(...xs) : undefined
      const depth = ys.length ? Math.max(...ys) - Math.min(...ys) : undefined
      const noun = object.object_type === 'roof.system' ? 'หลังคา' : object.object_type === 'structure.slab' ? 'พื้นโครงสร้าง' : object.object_type === 'architecture.ceiling' ? 'ฝ้า' : 'พื้นสถาปัตย์'
      return { title: `ขนาด${noun}`, views: [
        unit(positive(width), positive(depth), 'แปลน', 'กว้าง', 'ยาว'),
        unit(positive(width), positive(data.thickness_mm), 'รูปตัด', 'ช่วง', 'หนา'),
      ].filter((view): view is GuideView => !!view) }
    }
    default:
      return null
  }
}

const DimensionView: React.FC<{ view: GuideView; unit: DisplayLengthUnit }> = ({ view, unit }) => {
  const ratio = view.horizontal / view.vertical
  const width = ratio >= 1 ? 100 : Math.max(34, 100 * ratio)
  const height = ratio >= 1 ? Math.max(26, 54 / ratio) : 54
  return <div className="cf-object-dimension-view" aria-label={`${view.label}: ${view.horizontalLabel} ${formatLengthMm(view.horizontal, unit)}, ${view.verticalLabel} ${formatLengthMm(view.vertical, unit)}`}>
    <strong>{view.label}</strong>
    <svg viewBox="0 0 140 78" role="img" aria-hidden="true">
      <rect x={(140 - width) / 2} y={(64 - height) / 2} width={width} height={height} rx="2" />
      <path d={`M ${(140 - width) / 2} 68 H ${(140 + width) / 2} M 10 ${(64 - height) / 2} V ${(64 + height) / 2}`} />
    </svg>
    <span><b>{formatLengthMm(view.horizontal, unit)}</b> {unit} · {view.horizontalLabel}</span>
    <span><b>{formatLengthMm(view.vertical, unit)}</b> {unit} · {view.verticalLabel}</span>
  </div>
}

export const SelectedObjectDimensionGuide: React.FC<{ project: ProjectDocument; object: SmartObject; displayUnit: DisplayLengthUnit }> = ({ project, object, displayUnit }) => {
  const guide = dimensionsFor(project, object)
  if (!guide?.views.length) return null
  return <section className="cf-object-dimension-guide" aria-label={guide.title}>
    <header><strong>{guide.title}</strong><span>ค่าของชิ้นที่เลือก</span></header>
    <div className="cf-object-dimension-views">{guide.views.map(view => <DimensionView key={view.label} view={view} unit={displayUnit} />)}</div>
  </section>
}
