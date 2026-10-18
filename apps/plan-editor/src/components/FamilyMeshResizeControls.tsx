import type { FamilyMesh, FamilyMeshResizeMode } from '@constructflow/project-model'

const axes = [
  { key: 'X', label: 'กว้าง' },
  { key: 'Y', label: 'ลึก' },
  { key: 'Z', label: 'สูง' },
] as const

const modes: [FamilyMeshResizeMode, string][] = [
  ['stretch', 'ยืดตามขนาด'],
  ['fixed', 'คงขนาด'],
  ['fit', 'รักษาสัดส่วน'],
  ['repeat', 'จัดซ้ำ'],
]

export function FamilyMeshResizeControls({ mesh, referenceSize, onChange }: { mesh: FamilyMesh; referenceSize: [number, number, number]; onChange: (next: FamilyMesh) => void }) {
  const behavior = mesh.resize_behavior ?? ['stretch', 'stretch', 'stretch']
  const spacing = mesh.repeat_spacing_mm ?? [0, 0, 0]
  return <details className="cf-family-resize">
    <summary>การปรับขนาดและลวดลาย</summary>
    <p>ตั้งแยกตามแกนได้ เช่น วงกลมคงขนาด แล้วจัดซ้ำตามแนวกว้าง · เริ่มต้นยังยืดตามขนาดเดิม</p>
    {axes.map(({ key, label }, axis) => <div className="cf-family-formrow" key={key}>
      <strong>{key} · {label}</strong>
      <select aria-label={`${mesh.name || 'ชิ้นส่วน'} ${key} การปรับขนาด`} value={behavior[axis]} onChange={event => {
        const next = [...behavior] as [FamilyMeshResizeMode, FamilyMeshResizeMode, FamilyMeshResizeMode]
        next[axis] = event.target.value as FamilyMeshResizeMode
        onChange({ ...mesh, reference_size_mm: mesh.reference_size_mm ?? referenceSize, resize_behavior: next })
      }}>{modes.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
      {behavior[axis] === 'repeat' && <label>ช่องไฟ (มม.)<input aria-label={`${mesh.name || 'ชิ้นส่วน'} ${key} ช่องไฟซ้ำ`} type="number" min="0" step="1" value={spacing[axis]} onChange={event => {
        const next = [...spacing] as [number, number, number]
        next[axis] = Math.max(0, Number(event.target.value) || 0)
        onChange({ ...mesh, repeat_spacing_mm: next })
      }}/></label>}
    </div>)}
    <small>จัดซ้ำจะวางชิ้นส่วนเต็มจำนวนให้กึ่งกลางพื้นที่และคงรูปเดิม · ใช้กับชิ้นส่วนแยก เช่น ลูกฟัก วงกลม หรือซี่บาน</small>
  </details>
}
