import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, FolderPen, Merge, Pencil, Tags, X } from 'lucide-react'
import type { LocalSupplierProduct, LocalSupplierProductBundle } from '../projectAutosave.js'
import {
  listLocalSupplierProductBundles,
  orderSupplierLibraryCategoryNames,
  renameLocalSupplierLibraryCategory,
  saveLocalSupplierLibraryCategoryOrder,
} from '../projectAutosave.js'

interface SupplierLibraryCategoryManagerProps {
  products: LocalSupplierProduct[]
  categoryOrder: string[]
  onChanged: () => Promise<void>
}

interface CategorySummary {
  name: string
  productCount: number
  bundleCount: number
}

const categoryName = (value?: string) => value?.trim() || 'ทั่วไป'
const categoryKey = (value: string) => value.trim().toLocaleLowerCase('th-TH')

/** Rename or merge derived labels across the local Supplier Product and Bundle libraries. */
export const SupplierLibraryCategoryManager: React.FC<SupplierLibraryCategoryManagerProps> = ({ products, categoryOrder, onChanged }) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [bundles, setBundles] = useState<LocalSupplierProductBundle[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const categories = useMemo(() => {
    const summary = new Map<string, CategorySummary>()
    const get = (name: string) => {
      const key = categoryKey(name)
      let row = summary.get(key)
      if (!row) {
        row = { name, productCount: 0, bundleCount: 0 }
        summary.set(key, row)
      }
      return row
    }
    products.forEach(product => { get(categoryName(product.category)).productCount += 1 })
    bundles.forEach(bundle => { get(categoryName(bundle.category)).bundleCount += 1 })
    const orderedNames = orderSupplierLibraryCategoryNames([...summary.values()].map(item => item.name), categoryOrder)
    return orderedNames.map(name => summary.get(categoryKey(name))!).filter(Boolean)
  }, [products, bundles, categoryOrder])

  useEffect(() => {
    if (!isOpen) return
    let active = true
    void listLocalSupplierProductBundles(products).then(items => {
      if (active) { setBundles(items); setError('') }
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'อ่านหมวด Product Bundle ไม่สำเร็จ')
    })
    return () => { active = false }
  }, [isOpen, products])

  const openManager = () => {
    setMessage('')
    setError('')
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      setIsOpen(true)
    }
  }

  const closeManager = () => {
    if (dialogRef.current?.open) dialogRef.current.close()
  }

  const renameOrMerge = async (from: string) => {
    const to = (drafts[from] ?? from).trim()
    if (!to || categoryKey(to) === categoryKey(from)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const targetAlreadyExists = categories.some(category => categoryKey(category.name) === categoryKey(to))
      const result = await renameLocalSupplierLibraryCategory(from, to)
      await onChanged()
      setDrafts(current => ({ ...current, [from]: result.category }))
      setMessage(`${targetAlreadyExists ? 'รวมเข้าหมวด' : 'เปลี่ยนชื่อหมวด'} “${from}” แล้ว · สินค้า ${result.products} · Bundle ${result.bundles}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เปลี่ยนหมวดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const moveCategory = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= categories.length || busy) return
    const nextOrder = categories.map(category => category.name)
    ;[nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]]
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await saveLocalSupplierLibraryCategoryOrder(nextOrder)
      await onChanged()
      setMessage('บันทึกลำดับหมวดแล้ว · ใช้ร่วมกับสินค้าและ Bundle')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกลำดับหมวดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <button type="button" className="cf-supplier-category-manage-button" onClick={openManager}>
      <FolderPen size={14} />จัดการหมวด
    </button>
    <dialog
      ref={dialogRef}
      className="cf-supplier-category-dialog"
      aria-labelledby="cf-supplier-category-title"
      onClose={() => setIsOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) closeManager() }}
    >
      <header className="cf-supplier-category-dialog-header">
        <div><span><Tags size={17} /> Supplier Library</span><h2 id="cf-supplier-category-title">จัดการหมวดสินค้าและ Bundle</h2></div>
        <button type="button" aria-label="ปิดหน้าจัดการหมวด" onClick={closeManager}><X size={19} /></button>
      </header>
      <p className="cf-supplier-category-dialog-help">เปลี่ยนชื่อหรือรวมหมวดได้จากจุดเดียว ระบบจะอัปเดตสินค้ากับ Bundle ในธุรกรรมเดียว โดยคง UUID และข้อมูลราคาเดิม</p>
      <div className="cf-supplier-category-dialog-list">
        {categories.map((category, index) => {
          const target = (drafts[category.name] ?? category.name).trim()
          const targetExists = categories.some(item => categoryKey(item.name) === categoryKey(target))
          const unchanged = categoryKey(target) === categoryKey(category.name)
          return <form className="cf-supplier-category-row" key={category.name} onSubmit={event => { event.preventDefault(); void renameOrMerge(category.name) }}>
            <div className="cf-supplier-category-row-current">
              <strong>{category.name}</strong>
              <small>สินค้า {category.productCount} · Bundle {category.bundleCount}</small>
              <div className="cf-supplier-category-reorder" aria-label={`ลำดับหมวด ${category.name}`}>
                <button type="button" aria-label={`เลื่อนหมวด ${category.name} ขึ้น`} onClick={() => void moveCategory(index, -1)} disabled={busy || index === 0}><ArrowUp size={15} /></button>
                <button type="button" aria-label={`เลื่อนหมวด ${category.name} ลง`} onClick={() => void moveCategory(index, 1)} disabled={busy || index === categories.length - 1}><ArrowDown size={15} /></button>
              </div>
            </div>
            <label>
              <span>ชื่อใหม่หรือหมวดปลายทาง</span>
              <input
                aria-label={`เปลี่ยนหรือรวมหมวด ${category.name}`}
                list="cf-supplier-category-options"
                maxLength={80}
                value={drafts[category.name] ?? category.name}
                onChange={event => setDrafts(current => ({ ...current, [category.name]: event.target.value }))}
              />
            </label>
            <button type="submit" disabled={busy || unchanged}>
              {targetExists ? <Merge size={14} /> : <Pencil size={14} />}
              {targetExists ? 'รวมหมวด' : 'เปลี่ยนชื่อ'}
            </button>
          </form>
        })}
        {!categories.length && <p className="cf-supplier-category-empty">ยังไม่มีหมวด · หมวดจะปรากฏเมื่อเพิ่มสินค้า หรือสร้าง Bundle</p>}
      </div>
      <datalist id="cf-supplier-category-options">{categories.map(category => <option key={category.name} value={category.name} />)}</datalist>
      {(message || error) && <p className={`cf-supplier-category-status${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}</p>}
      <footer className="cf-supplier-category-dialog-footer"><span>หมวด “ทั่วไป” รวมรายการที่ยังไม่ได้กำหนดหมวด</span><button type="button" onClick={closeManager}>เสร็จสิ้น</button></footer>
    </dialog>
  </>
}
