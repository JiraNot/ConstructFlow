import React, { useRef, useState, useSyncExternalStore } from 'react'
import { CommandBus } from '../commands/CommandBus.js'
import { inspectModulePackageFile } from '../app/modulePackageFile.mjs'
import { loadSandboxedModulePackage } from '../app/modulePackageSandbox.js'
import type { ModuleManifest } from '@constructflow/module-sdk'

type PendingPackage = { fileName: string; source: string; byteLength: number; sha256: string | null }

/** Imports trusted, single-file module bundles only after explicit per-package consent. */
export const ExtensionPackageManager: React.FC = () => {
  const fileRef = useRef<HTMLInputElement>(null)
  const unloaders = useRef(new Map<string, () => void>())
  const [pending, setPending] = useState<PendingPackage | null>(null)
  const [trusted, setTrusted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  useSyncExternalStore(
    listener => CommandBus.subscribeToModules(listener),
    () => CommandBus.getModuleRegistryRevision(),
    () => 0,
  )
  const registered = CommandBus.getRegisteredModules() as ModuleManifest[]

  const inspectFile = async (file?: File) => {
    setPending(null); setTrusted(false); setFeedback('')
    if (!file) return
    try {
      const source = await file.text()
      const metadata = inspectModulePackageFile(file.name, source)
      let sha256: string | null = null
      if (globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
        sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
      }
      setPending({ ...metadata, source, sha256 })
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'อ่านแพ็กเกจ extension ไม่สำเร็จ')
    }
  }

  const install = async () => {
    if (!pending || !trusted || busy) return
    setBusy(true); setFeedback('')
    try {
      const module = await loadSandboxedModulePackage(pending.source)
      const unregister = CommandBus.registerModule(module)
      unloaders.current.set(module.manifest.id, unregister)
      setFeedback(`ติดตั้ง ${module.manifest.id}@${module.manifest.version} แล้ว · ทำงานใน session นี้`)
      setPending(null); setTrusted(false)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'ติดตั้ง extension ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const unload = (id: string) => {
    const unregister = unloaders.current.get(id)
    if (!unregister) return
    try {
      unregister()
      unloaders.current.delete(id)
      setFeedback(`ถอด ${id} ออกจาก session แล้ว`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'ถอด extension ไม่สำเร็จ')
    }
  }

  return <section aria-label="ตัวจัดการแพ็กเกจ extension" style={{ border: '1px solid #334155', borderRadius: 6, padding: 10, marginBottom: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <strong style={{ fontSize: 12 }}>Extension packages</strong>
      <button type="button" onClick={() => fileRef.current?.click()}>นำเข้า .cfe.mjs</button>
      <input ref={fileRef} type="file" accept=".cfe.mjs,text/javascript" aria-label="เลือกแพ็กเกจ extension" hidden onChange={event => { void inspectFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
    </div>
    <p style={{ color: '#94a3b8', fontSize: 10, margin: '5px 0' }}>คำสั่งแพ็กเกจทำงานใน worker แยก ไม่มี DOM, storage หรือ network API · รองรับ command handlers และ UI actions</p>
    {pending && <div style={{ marginTop: 8, padding: 8, background: '#0f172a', borderRadius: 4 }}>
      <strong style={{ fontSize: 11 }}>{pending.fileName} · {(pending.byteLength / 1024).toFixed(1)} KB</strong>
      {pending.sha256 && <div style={{ color: '#94a3b8', fontSize: 9, overflowWrap: 'anywhere', marginTop: 4 }}>SHA-256: {pending.sha256}</div>}
      <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer', fontSize: 10 }}>ตรวจ source ก่อนติดตั้ง</summary>
        <pre style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 9, color: '#cbd5e1' }}>{pending.source.slice(0, 20_000)}{pending.source.length > 20_000 ? '\n…แสดง source สูงสุด 20 KB…' : ''}</pre>
      </details>
      <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 8, color: '#fbbf24', fontSize: 10 }}>
        <input aria-label="เชื่อถือและอนุญาตให้รัน extension" type="checkbox" checked={trusted} onChange={event => setTrusted(event.target.checked)} />
        <span>ฉันเชื่อถือผู้เผยแพร่และอนุญาตให้ extension รัน command handlers ใน sandbox</span>
      </label>
      <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
        <button type="button" disabled={!trusted || busy} onClick={() => void install()}>{busy ? 'กำลังติดตั้ง…' : 'เชื่อถือและติดตั้ง'}</button>
        <button type="button" disabled={busy} onClick={() => { setPending(null); setTrusted(false) }}>ยกเลิก</button>
      </div>
    </div>}
    {registered.length > 0 && <ul style={{ paddingLeft: 18, margin: '8px 0 0', display: 'grid', gap: 4 }}>
      {registered.map(module => <li key={module.id} style={{ fontSize: 10, color: '#cbd5e1' }}>
        <code>{module.id}@{module.version}</code>{unloaders.current.has(module.id) && <button type="button" aria-label={`ถอด ${module.id}`} onClick={() => unload(module.id)} style={{ marginLeft: 6 }}>ถอด</button>}
      </li>)}
    </ul>}
    {feedback && <p role="status" style={{ color: feedback.includes('ไม่') || feedback.includes('required') || feedback.includes('requires') ? '#fca5a5' : '#86efac', fontSize: 10, margin: '7px 0 0' }}>{feedback}</p>}
  </section>
}
