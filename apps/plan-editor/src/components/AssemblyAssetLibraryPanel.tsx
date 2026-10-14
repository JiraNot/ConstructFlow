import React, { useMemo, useRef } from 'react'
import type { AssemblyAsset } from '../app/assemblyAssetLibrary.mjs'
import { exportAssemblyAssets } from '../app/assemblyAssetLibrary.mjs'

const presetLabels: Record<AssemblyAsset['preset'], string> = {
  carport: 'โรงจอดรถ', kitchen: 'ครัวไทย', terrace: 'เทอเรส',
}

export interface AssemblyAssetLibraryPanelProps {
  assets: readonly AssemblyAsset[]
  search: string
  name: string
  feedback: string
  onSearchChange: (value: string) => void
  onNameChange: (value: string) => void
  onSave: () => void
  onApply: (asset: AssemblyAsset) => void
  onDelete: (assetId: string) => void
  onImport: (source: string) => void
}

/** Personal, portable parametric assemblies; generated model edits still use CommandBus. */
export const AssemblyAssetLibraryPanel: React.FC<AssemblyAssetLibraryPanelProps> = ({
  assets, search, name, feedback, onSearchChange, onNameChange, onSave, onApply, onDelete, onImport,
}) => {
  const importRef = useRef<HTMLInputElement>(null)
  const visibleAssets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return assets.filter(asset => !query || `${asset.name} ${presetLabels[asset.preset]}`.toLocaleLowerCase().includes(query))
  }, [assets, search])

  const exportLibrary = () => {
    if (!assets.length) return
    const blob = new Blob([exportAssemblyAssets([...assets])], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'constructflow-assemblies.cfassets'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <section aria-label="คลังชุดประกอบส่วนตัว" style={{ padding: '10px 14px', borderBottom: '1px solid #dce4ed', background: '#fff' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
      <strong style={{ fontSize: 12, color: '#24364b' }}>คลังชุดประกอบส่วนตัว ({assets.length})</strong>
      <input aria-label="ค้นหาชุดประกอบ" value={search} onChange={event => onSearchChange(event.target.value)} placeholder="ค้นหาชุดประกอบ" style={{ minWidth: 140, flex: 1 }} />
      <input ref={importRef} type="file" accept=".cfassets,application/json" aria-label="นำเข้าคลังชุดประกอบ" style={{ display: 'none' }} onChange={event => {
        const file = event.currentTarget.files?.[0]
        if (file) void file.text().then(onImport).catch(error => onImport(`!${error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ'}`))
        event.currentTarget.value = ''
      }} />
      <button type="button" onClick={() => importRef.current?.click()}>นำเข้าคลัง</button>
      <button type="button" onClick={exportLibrary} disabled={!assets.length}>ส่งออกคลัง</button>
    </div>
    <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
      <input aria-label="ชื่อชุดประกอบที่จะบันทึก" value={name} onChange={event => onNameChange(event.target.value)} placeholder="ตั้งชื่อจากค่าที่กำลังแก้" maxLength={80} style={{ flex: 1 }} />
      <button type="button" onClick={onSave} disabled={!name.trim() || assets.length >= 100}>บันทึกชุดนี้</button>
    </div>
    {visibleAssets.length > 0 && <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 6, listStyle: 'none', margin: '8px 0 0', padding: 0, maxHeight: 104, overflowY: 'auto' }}>
      {visibleAssets.map(asset => <li key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid #dce4ed', borderRadius: 4, padding: '4px 6px', minWidth: 0 }}>
        <button type="button" aria-label={`ใช้ชุดประกอบ ${asset.name}`} onClick={() => onApply(asset)} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
          {asset.name} · {presetLabels[asset.preset]} · {asset.parameters.width_m.toFixed(2)} × {asset.parameters.length_m.toFixed(2)} m
        </button>
        <button type="button" aria-label={`ลบชุดประกอบ ${asset.name}`} onClick={() => onDelete(asset.id)}>ลบ</button>
      </li>)}
    </ul>}
    {assets.length > 0 && !visibleAssets.length && <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: 11 }}>ไม่พบชุดประกอบที่ค้นหา</p>}
    {feedback && <p role="status" style={{ margin: '7px 0 0', color: feedback.startsWith('!') ? '#b91c1c' : '#15803d', fontSize: 11 }}>{feedback.replace(/^!/, '')}</p>}
  </section>
}
