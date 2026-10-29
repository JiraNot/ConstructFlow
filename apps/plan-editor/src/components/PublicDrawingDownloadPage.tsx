import React, { useEffect, useState } from 'react'
import { AlertTriangle, Check, Download, FileText, LoaderCircle } from 'lucide-react'
import { downloadPublicDrawing, getPublicDrawingDownload, type PublicDrawingDownload } from '../integrations/drawingDownloadLinks.js'
import './drawingDownloadLinks.css'

interface PublicDrawingDownloadPageProps { token: string }

const formatBytes = (value: number) => value < 1_000_000 ? `${Math.max(1, Math.round(value / 1000))} KB` : `${(value / 1_000_000).toFixed(1)} MB`

export const PublicDrawingDownloadPage: React.FC<PublicDrawingDownloadPageProps> = ({ token }) => {
  const [file, setFile] = useState<PublicDrawingDownload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    let active = true
    void getPublicDrawingDownload(token).then(result => { if (active) setFile(result) })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'ลิงก์นี้ใช้ไม่ได้') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  const download = async () => {
    if (!file || busy) return
    setBusy(true); setError('')
    try {
      await downloadPublicDrawing(token, file)
      setDownloaded(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ดาวน์โหลด PDF ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <main className="cf-drawing-download-page">
    <header className="cf-drawing-download-brand"><span><FileText size={20} /></span><div>ConstructFlow<small>ชุดแบบก่อสร้าง</small></div></header>
    <section className="cf-drawing-download-card">
      {loading ? <div className="cf-drawing-download-state"><LoaderCircle className="cf-drawing-share-spin" size={23} /><h1>กำลังตรวจสอบลิงก์</h1><p>รอสักครู่</p></div> : error && !file ? <div className="cf-drawing-download-state is-error"><AlertTriangle size={25} /><h1>เปิดลิงก์นี้ไม่ได้</h1><p>{error}</p><small>ลิงก์อาจหมดอายุ ถูกเพิกถอน หรือไม่ถูกต้อง</small></div> : file ? <>
        <h1>{file.display_name}</h1>
        <p className="cf-drawing-download-intro">ดาวน์โหลดชุดแบบที่แชร์จาก ConstructFlow</p>
        <div className="cf-drawing-download-file"><FileText size={22} /><span><strong>{file.filename}</strong><small>Vector PDF · A3 · {formatBytes(file.byte_length)}</small></span></div>
        <button type="button" className="cf-drawing-download-button" onClick={() => void download()} disabled={busy}>
          {busy ? <><LoaderCircle className="cf-drawing-share-spin" size={18} />กำลังตรวจสอบและเตรียมไฟล์…</> : downloaded ? <><Check size={18} />ดาวน์โหลดอีกครั้ง</> : <><Download size={18} />ดาวน์โหลด PDF</>}
        </button>
        {error && <p className="cf-drawing-download-error" role="alert">{error}</p>}
        <p className="cf-drawing-download-expiry">ลิงก์หมดอายุ {new Date(file.expires_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      </> : null}
    </section>
    <p className="cf-drawing-download-note">ไฟล์นี้เป็น snapshot เมื่อสร้างลิงก์ การแก้แบบภายหลังจะไม่เปลี่ยนไฟล์ที่แชร์</p>
  </main>
}
