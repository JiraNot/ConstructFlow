import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, ExternalLink, FileSpreadsheet, PackagePlus, Pencil, Trash2, Upload } from 'lucide-react'
import type { ProjectTakeoffRate } from '@constructflow/project-model'
import {
  DEFAULT_SUPPLIER_PRODUCT_PRICING_SETTINGS, supplierProductBundleUnitRate, supplierProductGrossMarginPercent, supplierProductUnitRate,
  validateSupplierProduct, validateSupplierProductPricingSettings, type SupplierProduct, type SupplierProductPricingSettings,
} from '@constructflow/takeoff-engine'
import {
  deleteLocalSupplierProduct, deleteLocalSupplierProductGroup, getLocalCompanyPricingSettings, getLocalSupplierLibraryCategoryOrder, importLocalSupplierCatalog,
  listLocalSupplierProductBundles, listLocalSupplierProductGroups, listLocalSupplierProducts,
  orderSupplierLibraryCategoryNames,
  saveLocalCompanyPricingSettings, saveLocalSupplierProduct, saveLocalSupplierProductGroup,
  type LocalSupplierProduct, type LocalSupplierProductGroup,
} from '../projectAutosave.js'
import { SupplierProductBundleLibrary } from './SupplierProductBundleLibrary.js'
import type { SupplierProductBundlePlacement } from '../supplierBundlePlacement.js'
import { SupplierLibraryCategoryManager } from './SupplierLibraryCategoryManager.js'
import { parseSupplierProductSpreadsheet, supplierProductCsvTemplate, type SupplierProductSpreadsheetPreview } from '../supplierProductSpreadsheet.js'

interface SupplierProductLibraryProps {
  rates: Record<string, ProjectTakeoffRate>
  rateLabels: Record<string, string>
  catalogRevision: number
  onApplyRate: (rateKey: string, rate: ProjectTakeoffRate) => void
  onBeginBundlePlacement?: (placement: SupplierProductBundlePlacement) => void
}

const emptyProduct = (rates: Record<string, ProjectTakeoffRate>): LocalSupplierProduct => {
  const rateKey = Object.keys(rates).sort()[0] ?? ''
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), supplier_name: '', supplier_sku: '', name: '', category: 'วัสดุ', rate_key: rateKey,
    unit: rates[rateKey]?.unit ?? 'item', purchase_unit: 'แพ็ก', package_quantity: 1,
    package_price_thb: 0, labor_rate_per_unit: rates[rateKey]?.labor_rate ?? 0,
    created_at: now, updated_at: now,
  }
}

const emptyProductGroup = (): LocalSupplierProductGroup => {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), name: '', product_ids: [], default_product_id: '', created_at: now, updated_at: now }
}

/** Local supplier catalog mapped to model takeoff units; applying a product updates only the open rate draft. */
export const SupplierProductLibrary: React.FC<SupplierProductLibraryProps> = ({ rates, rateLabels, catalogRevision, onApplyRate, onBeginBundlePlacement }) => {
  const [products, setProducts] = useState<LocalSupplierProduct[]>([])
  const [groups, setGroups] = useState<LocalSupplierProductGroup[]>([])
  const [groupSelections, setGroupSelections] = useState<Record<string, string>>({})
  const [groupDraft, setGroupDraft] = useState<LocalSupplierProductGroup | null>(null)
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ทุกหมวด')
  const [showHiddenProducts, setShowHiddenProducts] = useState(false)
  const [draft, setDraft] = useState<LocalSupplierProduct | null>(null)
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<SupplierProductSpreadsheetPreview | null>(null)
  const [spreadsheetSourceFile, setSpreadsheetSourceFile] = useState<File | null>(null)
  const [spreadsheetRateKeyMappings, setSpreadsheetRateKeyMappings] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [pricingSettings, setPricingSettings] = useState<SupplierProductPricingSettings>(DEFAULT_SUPPLIER_PRODUCT_PRICING_SETTINGS)
  const [pricingSettingsDraft, setPricingSettingsDraft] = useState<SupplierProductPricingSettings>(DEFAULT_SUPPLIER_PRODUCT_PRICING_SETTINGS)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const spreadsheetFileRef = useRef<HTMLInputElement>(null)
  const spreadsheetPreviewRef = useRef<HTMLElement>(null)
  const rateKeys = useMemo(() => Object.keys(rates).sort(), [rates])

  const refresh = async () => {
    const [items, productGroups, order] = await Promise.all([listLocalSupplierProducts(), listLocalSupplierProductGroups(), getLocalSupplierLibraryCategoryOrder()])
    setProducts(items)
    setGroups(productGroups)
    setCategoryOrder(order.categories)
  }
  useEffect(() => {
    let active = true
    void Promise.all([listLocalSupplierProducts(), listLocalSupplierProductGroups(), getLocalCompanyPricingSettings(), getLocalSupplierLibraryCategoryOrder()]).then(([items, productGroups, settings, order]) => {
      if (active) { setProducts(items); setGroups(productGroups); setCategoryOrder(order.categories); setPricingSettings(settings); setPricingSettingsDraft(settings) }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'อ่าน Supplier Library ไม่สำเร็จ') })
    return () => { active = false }
  }, [catalogRevision])

  const manageableProducts = useMemo(() => products.filter(product => showHiddenProducts || !product.hide_on_app), [products, showHiddenProducts])
  const categories = useMemo(() => orderSupplierLibraryCategoryNames(
    [...new Set(manageableProducts.map(product => product.category?.trim() || 'ทั่วไป'))], categoryOrder,
  ), [manageableProducts, categoryOrder])
  useEffect(() => {
    if (categoryFilter !== 'ทุกหมวด' && !categories.includes(categoryFilter)) setCategoryFilter('ทุกหมวด')
  }, [categories, categoryFilter])
  useEffect(() => {
    if (spreadsheetPreview) spreadsheetPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [spreadsheetPreview])
  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('th-TH')
    return manageableProducts.filter(product => {
      const category = product.category?.trim() || 'ทั่วไป'
      if (categoryFilter !== 'ทุกหมวด' && category !== categoryFilter) return false
      if (!needle) return true
      return `${product.name} ${product.supplier_name} ${product.supplier_sku} ${product.rate_key} ${category}`
        .toLocaleLowerCase('th-TH').includes(needle)
    })
  }, [manageableProducts, query, categoryFilter])

  const updateDraft = (changes: Partial<LocalSupplierProduct>) => setDraft(current => {
    if (!current) return current
    const nextKey = changes.rate_key ?? current.rate_key
    const nextRate = rates[nextKey]
    return { ...current, ...changes, ...(changes.rate_key ? { unit: nextRate?.unit ?? current.unit } : {}) }
  })

  const save = async () => {
    if (!draft) return
    setBusy(true); setError(''); setMessage('')
    try {
      const now = new Date().toISOString()
      const product: SupplierProduct = { ...draft, category: draft.category?.trim() || undefined, updated_at: now }
      validateSupplierProduct(product)
      const saved = await saveLocalSupplierProduct(product)
      await refresh()
      setDraft(null)
      setMessage(`บันทึก ${saved.supplier_name} · ${saved.supplier_sku} แล้ว`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกสินค้าไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  const saveGroup = async () => {
    if (!groupDraft) return
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = await saveLocalSupplierProductGroup({ ...groupDraft, name: groupDraft.name.trim(), updated_at: new Date().toISOString() })
      await refresh()
      setGroupDraft(null)
      setMessage(`บันทึก Product Group “${saved.name}” แล้ว`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึก Product Group ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const removeGroup = async (group: LocalSupplierProductGroup) => {
    if (!window.confirm(`ลบ Product Group “${group.name}” หรือไม่?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      await deleteLocalSupplierProductGroup(group.id)
      await refresh()
      setMessage(`ลบ Product Group “${group.name}” แล้ว`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ลบ Product Group ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const savePricingPolicy = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      validateSupplierProductPricingSettings(pricingSettingsDraft)
      const saved = await saveLocalCompanyPricingSettings(pricingSettingsDraft)
      setPricingSettings(saved)
      setPricingSettingsDraft(saved)
      setMessage('บันทึกค่า pricing ของ Company Library ในอุปกรณ์นี้แล้ว · ราคา BOQ เดิมจะเปลี่ยนเมื่อเลือกสินค้าแล้วบันทึกราคาโครงการ')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึกค่า pricing ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const remove = async (product: LocalSupplierProduct) => {
    if (!window.confirm(`ลบ ${product.name} · ${product.supplier_sku} ออกจาก Library หรือไม่?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      await deleteLocalSupplierProduct(product.id)
      await refresh()
      setMessage(`ลบ ${product.supplier_sku} แล้ว`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ลบสินค้าไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  const apply = (product: LocalSupplierProduct) => {
    if (product.hide_on_app) { setError('สินค้านี้ถูกซ่อนจากรายการเลือกในแอป · ปิดตัวกรองซ่อนก่อนจึงจะใช้ได้'); return }
    const currentRate = rates[product.rate_key]
    if (!currentRate) { setError(`ไม่พบ rate key ${product.rate_key} ใน Price book ที่เปิดอยู่`); return }
    if (currentRate.unit !== product.unit) { setError('หน่วยสินค้ากับหน่วย takeoff ไม่ตรงกัน กรุณาแก้รายการสินค้า'); return }
    const unitRate = supplierProductUnitRate(product, pricingSettings)
    onApplyRate(product.rate_key, unitRate)
    setError('')
    setMessage(`นำ ${product.supplier_sku} ไปใส่ ${rateLabels[product.rate_key] ?? product.rate_key} แล้ว · กดบันทึกอัตราโครงการเพื่ออัปเดต BOQ`)
  }

  const exportLibrary = () => {
    if (!products.length) return
    const content = JSON.stringify({
      format: 'constructflow.supplier-product-library', schema_version: 2, currency: 'THB',
      products, groups, exported_at: new Date().toISOString(),
    }, null, 2)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'constructflow-supplier-products.cfsupplier.json'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importLibrary = async (file: File | null) => {
    if (!file) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (file.size > 5_000_000) throw new Error('ไฟล์ Supplier Product Library ต้องไม่เกิน 5 MB')
      const payload: unknown = JSON.parse(await file.text())
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('ไฟล์นี้ไม่ใช่ Supplier Product Library ของ ConstructFlow')
      const record = payload as Record<string, unknown>
      if (record.format !== 'constructflow.supplier-product-library' || ![1, 2].includes(Number(record.schema_version)) || record.currency !== 'THB' || !Array.isArray(record.products) || (record.schema_version === 2 && !Array.isArray(record.groups))) {
        throw new Error('รูปแบบหรือรุ่นของ Supplier Product Library ไม่รองรับ')
      }
      if (!record.products.length || record.products.length > 1000) throw new Error('ไฟล์ต้องมีสินค้า 1 ถึง 1,000 รายการ')
      record.products.forEach(validateSupplierProduct)
      const imported = await importLocalSupplierCatalog(
        record.products as LocalSupplierProduct[], [], record.schema_version === 2 ? record.groups as LocalSupplierProductGroup[] : [],
      )
      await refresh()
      setMessage(`นำเข้าสินค้า ${imported.products.length} รายการ และ Product Groups ${imported.groups.length} กลุ่มแล้ว`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'นำเข้า Supplier Product Library ไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const previewSpreadsheet = async (file: File | null, mappings: Record<string, string> = {}) => {
    if (!file) return
    setBusy(true); setError(''); setMessage(''); setSpreadsheetPreview(null); setSpreadsheetSourceFile(file); setSpreadsheetRateKeyMappings(mappings)
    try {
      const existingBundles = await listLocalSupplierProductBundles(products)
      const existingGroups = await listLocalSupplierProductGroups(products)
      const preview = await parseSupplierProductSpreadsheet(file, rates, products, existingBundles, mappings, existingGroups)
      setSpreadsheetPreview(preview)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'อ่าน Supplier spreadsheet ไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (spreadsheetFileRef.current) spreadsheetFileRef.current.value = ''
    }
  }

  const mapSpreadsheetRateKey = (recordType: 'product' | 'bundle', rowNumber: number, rateKey: string) => {
    const mappings = { ...spreadsheetRateKeyMappings, [`${recordType}:${rowNumber}`]: rateKey }
    setSpreadsheetRateKeyMappings(mappings)
    void previewSpreadsheet(spreadsheetSourceFile, mappings)
  }

  const commitSpreadsheet = async () => {
    if (!spreadsheetPreview || spreadsheetPreview.issues.length || (!spreadsheetPreview.products.length && !spreadsheetPreview.groups?.length && !spreadsheetPreview.bundles?.length)) return
    setBusy(true); setError(''); setMessage('')
    try {
      const imported = await importLocalSupplierCatalog(spreadsheetPreview.products, spreadsheetPreview.bundles ?? [], spreadsheetPreview.groups ?? [])
      await refresh()
      setMessage(`นำเข้าหรืออัปเดตสินค้า ${imported.products.length} รายการ, Product Groups ${imported.groups.length} กลุ่ม และ Bundle ${imported.bundles.length} ชุดแล้ว · คง UUID ที่ตรงกับรายการเดิม`)
      setSpreadsheetPreview(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'นำเข้า Supplier spreadsheet ไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  const downloadSpreadsheetTemplate = () => {
    const url = URL.createObjectURL(new Blob([supplierProductCsvTemplate(rates)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'constructflow-supplier-products-template.csv'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <details className="cf-supplier-library">
    <summary><span><b>Supplier / Product Library</b><small>จับคู่ SKU กับอัตรา BOQ · {products.length} รายการ</small></span></summary>
    <div className="cf-supplier-library-body">
      <p className="cf-supplier-library-help">เก็บในอุปกรณ์นี้และย้ายด้วย JSON · ราคาต่อแพ็กแปลงเป็นราคาต่อหน่วยโมเดล ส่วนค่าแรงแยกจากราคาวัสดุ · รองรับราคาขายคงที่หรือ cost + margin</p>
      <section className="cf-supplier-pricing-policy" aria-label="ตั้งค่า gross margin ของบริษัท">
        <div><strong>Pricing · Gross margin</strong><span>ตั้ง margin เริ่มต้นและขั้นต่ำสำหรับราคา supplier</span></div>
        <label>ค่าเริ่มต้น %<input aria-label="Gross margin ค่าเริ่มต้นของบริษัท" type="number" min="0" max="99.9" step="0.1" inputMode="decimal" value={pricingSettingsDraft.default_gross_margin_percent} onChange={event => setPricingSettingsDraft(current => ({ ...current, default_gross_margin_percent: Number(event.target.value) }))} /></label>
        <label>เตือนเมื่อต่ำกว่า %<input aria-label="Gross margin ขั้นต่ำของบริษัท" type="number" min="0" max="99.9" step="0.1" inputMode="decimal" value={pricingSettingsDraft.minimum_gross_margin_percent} onChange={event => setPricingSettingsDraft(current => ({ ...current, minimum_gross_margin_percent: Number(event.target.value) }))} /></label>
        <button type="button" onClick={() => void savePricingPolicy()} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกค่า pricing'}</button>
        <p>ราคาขาย = ต้นทุน ÷ (1 − margin) · สินค้าปรับ margin เองหรือปิด margin ได้ · ค่าเป็นนโยบายในอุปกรณ์นี้</p>
      </section>
      <div className="cf-supplier-library-toolbar">
        <input type="search" aria-label="ค้นหา Supplier Product" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาสินค้า ผู้จำหน่าย หรือ SKU" />
        <button type="button" onClick={() => { setDraft(emptyProduct(rates)); setError(''); setMessage('') }} disabled={busy || !rateKeys.length}><PackagePlus size={14} />เพิ่มสินค้า</button>
        <button type="button" onClick={exportLibrary} disabled={!products.length || busy}><Download size={14} />ส่งออก</button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={14} />นำเข้า</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="นำเข้า Supplier Product Library JSON" onChange={event => void importLibrary(event.currentTarget.files?.[0] ?? null)} />
        <button type="button" onClick={downloadSpreadsheetTemplate} disabled={busy || !rateKeys.length}><FileSpreadsheet size={14} />แบบตาราง</button>
        <button type="button" onClick={() => spreadsheetFileRef.current?.click()} disabled={busy}><Upload size={14} />นำเข้า CSV/XLSX</button>
        <input ref={spreadsheetFileRef} type="file" accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden aria-label="นำเข้า Supplier Product spreadsheet CSV หรือ Excel" onChange={event => void previewSpreadsheet(event.currentTarget.files?.[0] ?? null)} />
      </div>
      {spreadsheetPreview && <section ref={spreadsheetPreviewRef} className="cf-supplier-import-preview" aria-label="ตรวจสอบสินค้าก่อนนำเข้า" aria-live="polite" aria-atomic="true">
        <div className="cf-supplier-import-preview-heading"><strong>{spreadsheetPreview.source_format === 'arcsite' ? 'ArcSite Product Environment · ตรวจสอบก่อนนำเข้า' : 'ตรวจสอบก่อนนำเข้า'} · {spreadsheetPreview.source_rows} แถว</strong><span>{spreadsheetPreview.products.length} สินค้า + {spreadsheetPreview.groups?.length ?? 0} Product Groups + {spreadsheetPreview.bundles?.length ?? 0} Bundle พร้อม · UUID เดิมจะคงไว้</span></div>
        {!!spreadsheetPreview.notices?.length && <ul className="cf-supplier-import-notices">{spreadsheetPreview.notices.map((notice, index) => <li key={`${index}-${notice}`}>{notice}</li>)}</ul>}
        {!!spreadsheetPreview.rate_key_mappings?.length && <div className="cf-supplier-import-mappings" aria-label="จับคู่กับ Rate Key ของ ConstructFlow"><strong>จับคู่สินค้าและ Bundle เข้ากับ BOQ ของโครงการ</strong><span>เลือกกลุ่ม BOQ ที่ถูกต้องก่อนนำเข้า · หน่วยต้องตรงกับรายการ</span>{spreadsheetPreview.rate_key_mappings.map(mapping => <label key={`${mapping.record_type}:${mapping.row_number}`}>{mapping.record_type === 'bundle' ? 'Bundle' : 'สินค้า'} แถว {mapping.row_number} · {mapping.product_name} · {mapping.source_unit}<select value={spreadsheetRateKeyMappings[`${mapping.record_type}:${mapping.row_number}`] ?? ''} onChange={event => mapSpreadsheetRateKey(mapping.record_type, mapping.row_number, event.target.value)} disabled={busy}><option value="">เลือก Rate Key</option>{mapping.candidates.map(key => <option key={key} value={key}>{rateLabels[key] ?? key} · {rates[key].unit}</option>)}</select></label>)}</div>}
        {spreadsheetPreview.issues.length > 0 ? <ul className="cf-supplier-import-issues">{spreadsheetPreview.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul> : <>
          {!!spreadsheetPreview.products.length && <div className="cf-supplier-import-table-wrap"><table><thead><tr><th>สินค้า</th><th>ผู้จำหน่าย / SKU</th><th>หมวด</th><th>Rate Key</th><th>ต้นทุน → ราคาขาย / หน่วย</th><th>ซ่อนจากแอป</th><th>ซ่อนในข้อเสนอ</th></tr></thead><tbody>
            {spreadsheetPreview.products.slice(0, 8).map(product => <tr key={product.id}><td>{product.name}</td><td>{product.supplier_name} · {product.supplier_sku}</td><td>{product.category ?? 'ทั่วไป'}</td><td>{rateLabels[product.rate_key] ?? product.rate_key}</td><td>฿{(product.package_price_thb / product.package_quantity).toLocaleString('th-TH', { maximumFractionDigits: 4 })} → ฿{supplierProductUnitRate(product, pricingSettings).material_sell_rate?.toLocaleString('th-TH', { maximumFractionDigits: 4 })} / {product.unit}</td><td>{product.hide_on_app ? 'ซ่อน' : 'แสดง'}</td><td>{product.hide_on_proposal ? 'ซ่อนรายละเอียด' : 'แสดงรายละเอียด'}</td></tr>)}
          </tbody></table>{spreadsheetPreview.products.length > 8 && <small>แสดง 8 จาก {spreadsheetPreview.products.length} รายการแรก</small>}</div>}
          {!!spreadsheetPreview.groups?.length && <div className="cf-supplier-import-table-wrap"><table><thead><tr><th>Product Group</th><th>ตัวเลือก</th><th>ตัวเลือกเริ่มต้น</th><th>หน่วย</th></tr></thead><tbody>
            {spreadsheetPreview.groups.slice(0, 8).map(group => { const members = group.product_ids.map(id => products.find(item => item.id === id) ?? spreadsheetPreview.products.find(item => item.id === id)).filter(Boolean); return <tr key={group.id}><td>{group.name}</td><td>{members.map(item => item!.name).join(' · ')}</td><td>{members.find(item => item!.id === group.default_product_id)?.name ?? '—'}</td><td>{members[0]?.unit ?? '—'}</td></tr> })}
          </tbody></table>{spreadsheetPreview.groups.length > 8 && <small>แสดง 8 จาก {spreadsheetPreview.groups.length} Product Groups</small>}</div>}
          {!!spreadsheetPreview.bundles?.length && <div className="cf-supplier-import-table-wrap"><table><thead><tr><th>Bundle</th><th>หมวด</th><th>Rate Key</th><th>จำนวนองค์ประกอบ</th><th>ต้นทุน → ราคาขาย / หน่วย</th><th>ซ่อนจากแอป</th></tr></thead><tbody>
            {spreadsheetPreview.bundles.slice(0, 8).map(bundle => { const rate = supplierProductBundleUnitRate(bundle, [...products, ...spreadsheetPreview.products], pricingSettings, [...groups, ...(spreadsheetPreview.groups ?? [])]); return <tr key={bundle.id}><td>{bundle.name}</td><td>{bundle.category ?? 'ทั่วไป'}</td><td>{rateLabels[bundle.rate_key] ?? bundle.rate_key}</td><td>{bundle.components.length}</td><td>฿{rate.material_rate.toLocaleString('th-TH', { maximumFractionDigits: 4 })} → ฿{rate.material_sell_rate?.toLocaleString('th-TH', { maximumFractionDigits: 4 })} / {bundle.unit}</td><td>{bundle.hide_on_app ? 'ซ่อน' : 'แสดง'}</td></tr> })}
          </tbody></table>{spreadsheetPreview.bundles.length > 8 && <small>แสดง 8 จาก {spreadsheetPreview.bundles.length} Bundles แรก</small>}</div>}
        </>}
        <div className="cf-supplier-import-preview-actions"><button type="button" onClick={() => { setSpreadsheetPreview(null); setSpreadsheetSourceFile(null); setSpreadsheetRateKeyMappings({}) }} disabled={busy}>ยกเลิก</button><button type="button" onClick={() => void commitSpreadsheet()} disabled={busy || !!spreadsheetPreview.issues.length || !!spreadsheetPreview.rate_key_mappings?.length || (!spreadsheetPreview.products.length && !spreadsheetPreview.groups?.length && !spreadsheetPreview.bundles?.length)}>นำเข้า {spreadsheetPreview.products.length} สินค้า + {spreadsheetPreview.groups?.length ?? 0} กลุ่ม + {spreadsheetPreview.bundles?.length ?? 0} Bundle</button></div>
      </section>}
      <div className="cf-supplier-categories-heading"><strong>หมวดสินค้า</strong><SupplierLibraryCategoryManager products={products} categoryOrder={categoryOrder} onChanged={refresh} /></div>
      <div className="cf-supplier-category-tabs" role="tablist" aria-label="หมวด Supplier Product">
        {['ทุกหมวด', ...categories].map(category => {
          const count = category === 'ทุกหมวด' ? manageableProducts.length : manageableProducts.filter(product => (product.category?.trim() || 'ทั่วไป') === category).length
          return <button type="button" role="tab" aria-selected={categoryFilter === category} className={categoryFilter === category ? 'is-active' : ''} key={category} onClick={() => setCategoryFilter(category)}>{category}<span>{count}</span></button>
        })}
      </div>
      <label className="cf-library-hidden-toggle"><input type="checkbox" checked={showHiddenProducts} onChange={event => setShowHiddenProducts(event.target.checked)} />แสดงสินค้าที่ซ่อนจากแอป ({products.filter(product => product.hide_on_app).length})</label>
      {draft && <div className="cf-supplier-product-editor">
        <div className="cf-supplier-product-form">
          <label>ชื่อสินค้า<input value={draft.name} maxLength={160} onChange={event => updateDraft({ name: event.target.value })} /></label>
          <label>หมวดหมู่<input value={draft.category ?? ''} maxLength={80} placeholder="เช่น วัสดุ, ค่าแรง, สุขภัณฑ์" onChange={event => updateDraft({ category: event.target.value || undefined })} /></label>
          <label>ผู้จำหน่าย<input value={draft.supplier_name} maxLength={120} onChange={event => updateDraft({ supplier_name: event.target.value })} /></label>
          <label>SKU / รหัสสินค้า<input value={draft.supplier_sku} maxLength={100} onChange={event => updateDraft({ supplier_sku: event.target.value })} /></label>
          <label>กลุ่ม BOQ<select value={draft.rate_key} onChange={event => updateDraft({ rate_key: event.target.value })}>{rateKeys.map(key => <option key={key} value={key}>{rateLabels[key] ?? key} · {rates[key].unit}</option>)}</select></label>
          <label>หน่วยซื้อ<input value={draft.purchase_unit} maxLength={40} placeholder="ถุง / กล่อง / เส้น" onChange={event => updateDraft({ purchase_unit: event.target.value })} /></label>
          <label>ปริมาณต่อหน่วยซื้อ ({draft.unit})<input type="number" min="0.0001" step="any" value={draft.package_quantity} onChange={event => updateDraft({ package_quantity: Number(event.target.value) })} /></label>
          <label>ราคาต่อหน่วยซื้อ ฿<input type="number" min="0" step="0.01" value={draft.package_price_thb} onChange={event => updateDraft({ package_price_thb: Number(event.target.value) })} /></label>
          <label>ค่าแรงต่อหน่วย {draft.unit} ฿<input type="number" min="0" step="0.01" value={draft.labor_rate_per_unit} onChange={event => updateDraft({ labor_rate_per_unit: Number(event.target.value) })} /></label>
          <label>ราคาขายวัสดุคงที่ / {draft.unit} ฿<input type="number" min="0" step="0.01" value={draft.input_unit_sell_rate_thb ?? ''} placeholder="ใช้ cost + margin ด้านล่าง" onChange={event => updateDraft({ input_unit_sell_rate_thb: event.target.value === '' ? undefined : Number(event.target.value) })} /><small>ถ้ากรอก จะใช้ราคานี้แทน gross margin</small></label>
          <label>วิธีตั้งราคาขายวัสดุ<select aria-label="วิธีตั้งราคาขายวัสดุ" value={draft.input_unit_sell_rate_thb !== undefined ? 'fixed' : draft.gross_margin_percent === undefined ? 'default' : draft.gross_margin_percent === null ? 'none' : 'custom'} onChange={event => {
            const mode = event.target.value
            if (mode === 'fixed') return
            updateDraft({ gross_margin_percent: mode === 'default' ? undefined : mode === 'none' ? null : supplierProductGrossMarginPercent(draft, pricingSettings), input_unit_sell_rate_thb: undefined })
          }}><option value="default">Cost + margin ค่าเริ่มต้นบริษัท ({pricingSettings.default_gross_margin_percent}%)</option><option value="custom">Cost + margin กำหนดเอง</option><option value="none">ขายเท่าต้นทุนวัสดุ</option>{draft.input_unit_sell_rate_thb !== undefined && <option value="fixed">ราคาขายคงที่จากช่องด้านบน</option>}</select></label>
          {draft.gross_margin_percent !== undefined && draft.gross_margin_percent !== null && <label>Margin ของสินค้านี้ %<input type="number" min="0" max="99.9" step="0.1" inputMode="decimal" value={draft.gross_margin_percent} onChange={event => updateDraft({ gross_margin_percent: Number(event.target.value) })} /></label>}
          <fieldset className="cf-library-visibility"><legend>การแสดงผล</legend>
            <label><input type="checkbox" checked={draft.hide_on_app === true} onChange={event => updateDraft({ hide_on_app: event.target.checked })} />ซ่อนจากรายการเลือกในแอป</label>
            <label><input type="checkbox" checked={draft.hide_on_proposal === true} onChange={event => updateDraft({ hide_on_proposal: event.target.checked })} />ซ่อนรายละเอียดในข้อเสนอ · คงรวมยอด</label>
          </fieldset>
          <label className="cf-supplier-wide">ลิงก์สินค้า HTTPS<input type="url" value={draft.product_url ?? ''} maxLength={2000} placeholder="https://…" onChange={event => updateDraft({ product_url: event.target.value || undefined })} /></label>
          <label className="cf-supplier-wide">หมายเหตุ<textarea value={draft.notes ?? ''} maxLength={1000} rows={2} onChange={event => updateDraft({ notes: event.target.value || undefined })} /></label>
        </div>
        {(() => {
          let rate: ProjectTakeoffRate | null = null
          try {
            if (draft.package_quantity > 0) rate = supplierProductUnitRate({
              ...draft,
              name: draft.name || 'สินค้า preview',
              supplier_name: draft.supplier_name || 'ผู้จำหน่าย preview',
              supplier_sku: draft.supplier_sku || 'SKU preview',
            }, pricingSettings)
          } catch { /* Keep the form usable while the user edits invalid values. */ }
          const margin = rate?.product_gross_margin_percent ?? 0
          return <div className="cf-supplier-product-preview">ต้นทุนวัสดุ <b>฿{rate?.material_rate.toLocaleString('th-TH', { maximumFractionDigits: 4 }) ?? '—'} / {draft.unit}</b> · ราคาขาย <b>฿{rate?.material_sell_rate?.toLocaleString('th-TH', { maximumFractionDigits: 4 }) ?? '—'} / {draft.unit}</b> · Margin {rate ? `${margin.toLocaleString('th-TH')}%` : 'ตรวจข้อมูลราคา'}{rate && margin < pricingSettings.minimum_gross_margin_percent && <span className="cf-supplier-margin-warning">ต่ำกว่า minimum {pricingSettings.minimum_gross_margin_percent}%</span>}</div>
        })()}
        <div className="cf-supplier-product-actions"><button type="button" onClick={() => setDraft(null)} disabled={busy}>ยกเลิก</button><button type="button" onClick={() => void save()} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกสินค้า'}</button></div>
      </div>}
      {visibleProducts.length ? <div className="cf-supplier-products">
        {visibleProducts.map(product => <article className="cf-supplier-product" key={product.id}>
          <div className="cf-supplier-product-info"><strong>{product.name}</strong><span>{product.category?.trim() || 'ทั่วไป'} · {product.supplier_name} · SKU {product.supplier_sku}</span>{(() => {
            const rate = supplierProductUnitRate(product, pricingSettings)
            const margin = rate.product_gross_margin_percent ?? 0
            return <><small>{rateLabels[product.rate_key] ?? product.rate_key} · ต้นทุน ฿{rate.material_rate.toLocaleString('th-TH', { maximumFractionDigits: 4 })} → ขาย ฿{rate.material_sell_rate?.toLocaleString('th-TH', { maximumFractionDigits: 4 })} / {product.unit} · {product.input_unit_sell_rate_thb !== undefined ? 'ราคาขายคงที่' : `Margin ${margin.toLocaleString('th-TH')}%`}</small>{margin < pricingSettings.minimum_gross_margin_percent && <small className="cf-supplier-margin-warning">ต่ำกว่า minimum margin {pricingSettings.minimum_gross_margin_percent}%</small>}</>
          })()}
            {(product.hide_on_app || product.hide_on_proposal) && <small className="cf-library-visibility-note">{[product.hide_on_app && 'ซ่อนจากรายการเลือก', product.hide_on_proposal && 'ซ่อนรายละเอียดในข้อเสนอ'].filter(Boolean).join(' · ')}</small>}
            {product.product_url && <a href={product.product_url} target="_blank" rel="noreferrer"><ExternalLink size={12} />หน้าสินค้า</a>}
          </div>
          <div className="cf-supplier-product-actions"><button type="button" onClick={() => apply(product)} disabled={busy || product.hide_on_app === true || !rates[product.rate_key]} title="ใส่ราคาใน rate editor">ใช้</button><button type="button" aria-label={`แก้ไข ${product.supplier_sku}`} onClick={() => { setDraft(structuredClone(product)); setError(''); setMessage('') }} disabled={busy}><Pencil size={14} /></button><button type="button" className="is-delete" aria-label={`ลบ ${product.supplier_sku}`} onClick={() => void remove(product)} disabled={busy}><Trash2 size={14} /></button></div>
        </article>)}
      </div> : <p className="cf-supplier-empty">{!products.length ? 'ยังไม่มีสินค้า · เพิ่มสินค้าแล้วจับคู่กับ rate key เพื่อใช้ราคาผู้จำหน่ายใน BOQ' : !manageableProducts.length ? 'สินค้าทั้งหมดถูกซ่อนจากตัวเลือก · เปิด “แสดงสินค้าที่ซ่อนจากแอป” เพื่อจัดการ' : 'ไม่พบสินค้าที่ตรงกับคำค้นหรือหมวดที่เลือก'}</p>}
      <details className="cf-supplier-bundle-library cf-supplier-group-library">
        <summary><span><b>Product Groups</b><small>เลือก SKU หนึ่งตัวเลือก · {groups.length} กลุ่ม</small></span></summary>
        <div className="cf-supplier-bundle-body">
          <p className="cf-supplier-library-help">ใช้กลุ่มสินค้าเป็นตัวเลือกใน Bundle ได้ หรือเลือก SKU ที่นี่เพื่อใช้ราคาใน BOQ · การใช้จากหน้านี้ตั้งอัตราของ Rate Key ทั้งโครงการ</p>
          <div className="cf-supplier-library-toolbar"><button type="button" onClick={() => { setGroupDraft(emptyProductGroup()); setError(''); setMessage('') }} disabled={busy || !products.length}><PackagePlus size={14} />สร้าง Product Group</button></div>
          {groupDraft && <section className="cf-supplier-product-editor">
            <div className="cf-supplier-product-form cf-supplier-group-form">
              <label>ชื่อ Product Group<input value={groupDraft.name} maxLength={160} onChange={event => setGroupDraft(current => current ? { ...current, name: event.target.value } : current)} /></label>
              <fieldset className="cf-supplier-group-member-field"><legend>SKU สมาชิก · หน่วยต้องตรงกัน</legend><div className="cf-supplier-group-members" role="group" aria-label="เลือก SKU สมาชิก Product Group">{products.filter(product => !groupDraft.product_ids.length || groupDraft.product_ids.some(id => products.find(item => item.id === id)?.unit === product.unit) || groupDraft.product_ids.includes(product.id)).map(product => <label key={product.id}><input type="checkbox" checked={groupDraft.product_ids.includes(product.id)} onChange={event => setGroupDraft(current => {
                if (!current) return current
                const productIds = event.target.checked ? [...current.product_ids, product.id] : current.product_ids.filter(id => id !== product.id)
                return { ...current, product_ids: productIds, default_product_id: productIds.includes(current.default_product_id) ? current.default_product_id : productIds[0] ?? '' }
              })} /><span>{product.name} · {product.supplier_sku} · {product.unit}</span></label>)}</div><small>เลือกได้หลาย SKU โดยทุกตัวเลือกต้องใช้หน่วยโมเดลเดียวกัน</small></fieldset>
              <label>ตัวเลือกเริ่มต้น<select value={groupDraft.default_product_id} onChange={event => setGroupDraft(current => current ? { ...current, default_product_id: event.target.value } : current)}><option value="">เลือก SKU เริ่มต้น</option>{groupDraft.product_ids.map(id => products.find(product => product.id === id)).filter((product): product is LocalSupplierProduct => !!product).map(product => <option key={product.id} value={product.id}>{product.name} · {product.supplier_sku}</option>)}</select></label>
            </div>
            <div className="cf-supplier-product-actions"><button type="button" onClick={() => setGroupDraft(null)} disabled={busy}>ยกเลิก</button><button type="button" onClick={() => void saveGroup()} disabled={busy || !groupDraft.name.trim() || !groupDraft.product_ids.length || !groupDraft.default_product_id}>{busy ? 'กำลังบันทึก…' : 'บันทึกกลุ่ม'}</button></div>
          </section>}
          {groups.length ? <div className="cf-supplier-bundles">{groups.map(group => {
            const members = group.product_ids.map(id => products.find(product => product.id === id)).filter((product): product is LocalSupplierProduct => !!product)
            const selectedId = groupSelections[group.id] ?? group.default_product_id
            const selected = members.find(product => product.id === selectedId) ?? members[0]
            const hasSingleRateKey = new Set(members.map(product => product.rate_key)).size === 1
            return <article className="cf-supplier-bundle" key={group.id}><div className="cf-supplier-product-info"><strong>{group.name}</strong><span>{members.length} ตัวเลือก · {selected ? `${rateLabels[selected.rate_key] ?? selected.rate_key} · ${selected.unit}` : 'ไม่พบ SKU'}</span>{selected && <small>ต้นทุน ฿{supplierProductUnitRate(selected, pricingSettings).material_rate.toLocaleString('th-TH', { maximumFractionDigits: 4 })} → ขาย ฿{supplierProductUnitRate(selected, pricingSettings).material_sell_rate?.toLocaleString('th-TH', { maximumFractionDigits: 4 })} / {selected.unit}</small>}{!hasSingleRateKey && <small>สมาชิกอยู่คนละ Rate Key · เลือกใช้เป็นองค์ประกอบใน Bundle เพื่อคำนวณรวม</small>}</div><div className="cf-supplier-product-actions"><select aria-label={`ตัวเลือกสินค้าใน ${group.name}`} value={selected?.id ?? ''} onChange={event => setGroupSelections(current => ({ ...current, [group.id]: event.target.value }))}>{members.map(product => <option key={product.id} value={product.id}>{product.name} · {product.supplier_sku}</option>)}</select><button type="button" onClick={() => selected && apply(selected)} disabled={!selected || !hasSingleRateKey || selected.hide_on_app === true || !rates[selected.rate_key]}>ใช้กับ BOQ</button><button type="button" aria-label={`แก้ไข Product Group ${group.name}`} onClick={() => { setGroupDraft(structuredClone(group)); setError(''); setMessage('') }} disabled={busy}><Pencil size={14} /></button><button type="button" className="is-delete" aria-label={`ลบ Product Group ${group.name}`} onClick={() => void removeGroup(group)} disabled={busy}><Trash2 size={14} /></button></div></article>
          })}</div> : <p className="cf-supplier-empty">นำเข้า Product Groups จาก workbook เพื่อเลือก SKU ทางเลือกและใช้เป็นองค์ประกอบใน Bundle</p>}
        </div>
      </details>
      <SupplierProductBundleLibrary
        products={products}
        categoryOrder={categoryOrder}
        pricingSettings={pricingSettings}
        groups={groups}
        rates={rates}
        rateLabels={rateLabels}
        onApplyRate={(key, rate) => {
          onApplyRate(key, rate)
          setMessage(`ใช้ Product Bundle กับ ${rateLabels[key] ?? key} แล้ว · กดบันทึกราคาโครงการเพื่อคำนวณ BOQ ใหม่`)
          setError('')
        }}
        onBeginPlacement={onBeginBundlePlacement}
        onLibraryChanged={refresh}
      />
      {(message || error) && <p className={`cf-supplier-status${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}</p>}
    </div>
  </details>
}
