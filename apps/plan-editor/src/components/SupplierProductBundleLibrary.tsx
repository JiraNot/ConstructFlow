import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, PackagePlus, Pencil, Trash2, Upload } from 'lucide-react'
import type { ProjectTakeoffRate } from '@constructflow/project-model'
import {
  supplierProductBundleUnitRate, validateSupplierProductBundle, validateSupplierProductGroup, type SupplierProductBundleComponent,
  type SupplierProductPricingSettings,
} from '@constructflow/takeoff-engine'
import {
  deleteLocalSupplierProductBundle, importLocalSupplierCatalog, listLocalSupplierProductBundles, orderSupplierLibraryCategoryNames, saveLocalSupplierProductBundle,
  type LocalSupplierProduct, type LocalSupplierProductBundle, type LocalSupplierProductGroup,
} from '../projectAutosave.js'
import type { SupplierProductBundlePlacement } from '../supplierBundlePlacement.js'

interface SupplierProductBundleLibraryProps {
  products: LocalSupplierProduct[]
  groups: LocalSupplierProductGroup[]
  categoryOrder: string[]
  rates: Record<string, ProjectTakeoffRate>
  rateLabels: Record<string, string>
  pricingSettings: SupplierProductPricingSettings
  onApplyRate: (rateKey: string, rate: ProjectTakeoffRate) => void
  onBeginPlacement?: (placement: SupplierProductBundlePlacement) => void
  onLibraryChanged: () => Promise<void>
}

const visualTypeForUnit = (unit: string): 'shape' | 'length' | 'area' | undefined =>
  unit === 'item' ? 'shape' : unit === 'm' ? 'length' : unit === 'm2' ? 'area' : undefined

const unitForVisualType = (visualType: 'shape' | 'length' | 'area') =>
  visualType === 'shape' ? 'item' : visualType === 'length' ? 'm' : 'm2'

const createBundle = (products: LocalSupplierProduct[], rates: Record<string, ProjectTakeoffRate>): LocalSupplierProductBundle => {
  const rateKey = ['item', 'm', 'm2'].map(unit => Object.keys(rates).sort().find(key => rates[key]?.unit === unit)).find(Boolean)
    ?? Object.keys(rates).sort()[0] ?? ''
  const unit = rates[rateKey]?.unit ?? 'item'
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), name: '', visual_type: visualTypeForUnit(unit), labor_calculation_mode: 'fixed', category: 'ชุดวัสดุ', rate_key: rateKey, unit,
    labor_rate_per_output_unit: rates[rateKey]?.labor_rate ?? 0,
    components: products.find(product => !product.hide_on_app) ? [{ product_id: products.find(product => !product.hide_on_app)!.id, purchase_units_per_output_unit: 1, waste_percent: 0 }] : [],
    created_at: now, updated_at: now,
  }
}

const isGeometryDependentArea = (bundle: LocalSupplierProductBundle) =>
  bundle.visual_type === 'area' && bundle.components.some(component => component.quantity_mode === 'perimeter')

/** Reusable bill of supplier products priced per canonical BOQ output unit. */
export const SupplierProductBundleLibrary: React.FC<SupplierProductBundleLibraryProps> = ({ products, groups, categoryOrder, rates, rateLabels, pricingSettings, onApplyRate, onBeginPlacement, onLibraryChanged }) => {
  const [bundles, setBundles] = useState<LocalSupplierProductBundle[]>([])
  const [draft, setDraft] = useState<LocalSupplierProductBundle | null>(null)
  const [placementDraft, setPlacementDraft] = useState<LocalSupplierProductBundle | null>(null)
  const [placementSelections, setPlacementSelections] = useState<Record<string, string>>({})
  const [categoryFilter, setCategoryFilter] = useState('ทุกหมวด')
  const [showHiddenBundles, setShowHiddenBundles] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const ratesKeys = useMemo(() => Object.keys(rates).sort(), [rates])
  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products])
  const selectableProducts = useMemo(() => products.filter(product => !product.hide_on_app), [products])
  const manageableBundles = useMemo(() => bundles.filter(bundle => showHiddenBundles || !bundle.hide_on_app), [bundles, showHiddenBundles])
  const categories = useMemo(() => orderSupplierLibraryCategoryNames(
    [...new Set(manageableBundles.map(bundle => bundle.category?.trim() || 'ทั่วไป'))], categoryOrder,
  ), [manageableBundles, categoryOrder])
  const visibleBundles = useMemo(() => manageableBundles.filter(bundle => categoryFilter === 'ทุกหมวด' || (bundle.category?.trim() || 'ทั่วไป') === categoryFilter), [manageableBundles, categoryFilter])
  useEffect(() => {
    if (categoryFilter !== 'ทุกหมวด' && !categories.includes(categoryFilter)) setCategoryFilter('ทุกหมวด')
  }, [categories, categoryFilter])

  const refresh = async () => setBundles(await listLocalSupplierProductBundles(products))
  useEffect(() => {
    let active = true
    void listLocalSupplierProductBundles(products).then(items => { if (active) { setBundles(items); setError('') } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'อ่าน Product Bundle Library ไม่สำเร็จ') })
    return () => { active = false }
  }, [products])

  const updateDraft = (changes: Partial<LocalSupplierProductBundle>) => setDraft(current => {
    if (!current) return current
    const next = { ...current, ...changes }
    if (changes.rate_key) {
      const rate = rates[changes.rate_key]
      next.unit = rate?.unit ?? current.unit
      next.visual_type = visualTypeForUnit(next.unit)
    } else if ('visual_type' in changes && changes.visual_type) {
      next.unit = unitForVisualType(changes.visual_type)
      next.rate_key = ratesKeys.find(key => rates[key]?.unit === next.unit) ?? next.rate_key
    }
    return next
  })

  const updateComponent = (index: number, changes: Partial<SupplierProductBundleComponent>) => setDraft(current => current ? {
    ...current,
    components: current.components.map((component, itemIndex) => itemIndex === index ? { ...component, ...changes } : component),
  } : current)

  const addComponent = () => setDraft(current => {
    if (!current) return current
    const unused = products.find(product => !product.hide_on_app && !current.components.some(component => component.product_id === product.id))
    return unused ? { ...current, components: [...current.components, { product_id: unused.id, purchase_units_per_output_unit: 1, waste_percent: 0 }] } : current
  })

  const previewRate = useMemo(() => {
    if (!draft) return null
    try { return supplierProductBundleUnitRate(draft, products, pricingSettings, groups) } catch { return null }
  }, [draft, products, pricingSettings, groups])

  const save = async () => {
    if (!draft) return
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = await saveLocalSupplierProductBundle({ ...draft, category: draft.category?.trim() || undefined, updated_at: new Date().toISOString() })
      await refresh()
      setDraft(null)
      setMessage(`บันทึก Bundle “${saved.name}” แล้ว`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึก Bundle ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const remove = async (bundle: LocalSupplierProductBundle) => {
    if (!window.confirm(`ลบ Bundle “${bundle.name}” หรือไม่?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      await deleteLocalSupplierProductBundle(bundle.id)
      await refresh()
      setMessage(`ลบ Bundle “${bundle.name}” แล้ว`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ลบ Bundle ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const apply = (bundle: LocalSupplierProductBundle) => {
    const currentRate = rates[bundle.rate_key]
    if (!currentRate) { setError(`ไม่พบ rate key ${bundle.rate_key} ใน Price book ที่เปิดอยู่`); return }
    if (currentRate.unit !== bundle.unit) { setError('หน่วย Bundle กับหน่วย takeoff ไม่ตรงกัน กรุณาแก้ Bundle'); return }
    try {
      onApplyRate(bundle.rate_key, supplierProductBundleUnitRate(bundle, products, pricingSettings, groups))
      setError('')
      setMessage(`ใช้ Bundle “${bundle.name}” กับ ${rateLabels[bundle.rate_key] ?? bundle.rate_key} แล้ว · บันทึกราคาโครงการเพื่ออัปเดต BOQ`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'คำนวณราคา Bundle ไม่สำเร็จ') }
  }

  const beginPlacement = () => {
    if (!placementDraft || !onBeginPlacement) return
    try {
      const selectedBundle = {
        ...placementDraft,
        components: placementDraft.components.map(component => ({
          ...component,
          ...(component.product_group_id && placementSelections[component.product_group_id]
            ? { product_id: placementSelections[component.product_group_id] }
            : {}),
        })),
      }
      const visualType = selectedBundle.visual_type ?? visualTypeForUnit(selectedBundle.unit)
      if (!visualType) throw new Error(`Bundle “${selectedBundle.name}” ใช้หน่วย ${selectedBundle.unit} จึงวางเป็นจุด แนว หรือพื้นที่ไม่ได้`)
      const configured: LocalSupplierProductBundle = { ...selectedBundle, visual_type: visualType, unit: unitForVisualType(visualType) }
      const geometryDependent = isGeometryDependentArea(configured)
      const unitRate: ProjectTakeoffRate = geometryDependent
        ? {
            material_rate: 0, labor_rate: 0, unit: configured.unit, material_sell_rate: 0, product_gross_margin_percent: 0,
            supplier_product_bundle_id: configured.id,
            ...(configured.hide_on_app !== undefined ? { hide_on_app: configured.hide_on_app } : {}),
            ...(configured.hide_on_proposal !== undefined ? { hide_on_proposal: configured.hide_on_proposal } : {}),
          }
        : supplierProductBundleUnitRate(configured, products, pricingSettings, groups)
      const components = configured.components.map(component => {
        const product = productById.get(component.product_id)
        if (!product) throw new Error(`ไม่พบ SKU ${component.product_id} ใน Library`)
        const group = component.product_group_id ? groups.find(item => item.id === component.product_group_id) : undefined
        const unitCost = product.package_price_thb / product.package_quantity
        const margin = product.gross_margin_percent === undefined ? pricingSettings.default_gross_margin_percent : product.gross_margin_percent ?? 0
        const unitSell = product.input_unit_sell_rate_thb ?? unitCost / (1 - margin / 100)
        return {
          product_id: product.id, product_name: product.name, supplier_name: product.supplier_name, supplier_sku: product.supplier_sku,
          ...(component.product_group_id ? { product_group_id: component.product_group_id, product_group_name: group?.name ?? 'Product Group' } : {}),
          purchase_units_per_output_unit: component.purchase_units_per_output_unit, waste_percent: component.waste_percent,
          ...(component.quantity_mode ? { quantity_mode: component.quantity_mode } : {}),
          purchase_unit: product.purchase_unit, unit_cost_thb: Number(unitCost.toFixed(4)), unit_sell_thb: Number(unitSell.toFixed(4)),
          unit_labor_thb: Number(product.labor_rate_per_unit.toFixed(4)),
        }
      })
      onBeginPlacement({ bundle: configured, unit_rate: unitRate, components })
      setPlacementDraft(null)
      setPlacementSelections({})
      setMessage(geometryDependent
        ? `เลือก “${configured.name}” แล้ว · ราคาจะคำนวณจากพื้นที่และเส้นรอบรูปจริงหลังวาง`
        : `เลือก “${configured.name}” แล้ว · แตะจุดเริ่มต้นบนแปลนเพื่อวาง`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'เตรียม Bundle สำหรับวางไม่สำเร็จ') }
  }

  const exportBundles = () => {
    if (!bundles.length) return
    const content = JSON.stringify({
      format: 'constructflow.supplier-product-bundles', schema_version: 2, currency: 'THB',
      groups: groups.filter(group => bundles.some(bundle => bundle.components.some(component => component.product_group_id === group.id))),
      bundles, exported_at: new Date().toISOString(),
    }, null, 2)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'constructflow-product-bundles.cfbundle.json'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importBundles = async (file: File | null) => {
    if (!file) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (file.size > 5_000_000) throw new Error('ไฟล์ Product Bundle Library ต้องไม่เกิน 5 MB')
      const payload: unknown = JSON.parse(await file.text())
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('ไฟล์นี้ไม่ใช่ Product Bundle Library ของ ConstructFlow')
      const record = payload as Record<string, unknown>
      if (record.format !== 'constructflow.supplier-product-bundles' || ![1, 2].includes(Number(record.schema_version)) || record.currency !== 'THB' || !Array.isArray(record.bundles) || (record.schema_version === 2 && !Array.isArray(record.groups))) {
        throw new Error('รูปแบบหรือรุ่นของ Product Bundle Library ไม่รองรับ')
      }
      if (!record.bundles.length || record.bundles.length > 500) throw new Error('ไฟล์ต้องมี Bundle 1 ถึง 500 ชุด')
      const importedGroups = (record.groups ?? []) as LocalSupplierProductGroup[]
      importedGroups.forEach(validateSupplierProductGroup)
      record.bundles.forEach(bundle => validateSupplierProductBundle(bundle))
      const imported = await importLocalSupplierCatalog([], record.bundles as LocalSupplierProductBundle[], importedGroups)
      await onLibraryChanged()
      await refresh()
      setMessage(`นำเข้า Product Groups ${imported.groups.length} กลุ่ม และ Bundle ${imported.bundles.length} ชุดแล้ว`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'นำเข้า Bundle ไม่สำเร็จ') }
    finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return <details className="cf-supplier-bundle-library">
    <summary><span><b>Product Bundles</b><small>ชุด SKU ที่รวมเป็นอัตรา BOQ · {bundles.length} ชุด</small></span></summary>
    <div className="cf-supplier-bundle-body">
      <p className="cf-supplier-library-help">กำหนดแพ็กต่อหน่วย BOQ พร้อมเผื่อเศษ แล้วยอดวัสดุจะรวมเป็น Rate Key เดียว เลือกคิดค่าแรงเป็นอัตราต่อหน่วยหรือรวมจากแรงงาน SKU · Area Bundle คิดตามพื้นที่หรือเส้นรอบรูปจริง · นำเข้าสินค้าก่อน Bundle</p>
      <div className="cf-supplier-library-toolbar">
        <button type="button" onClick={() => { setDraft(createBundle(products, rates)); setError(''); setMessage('') }} disabled={busy || !selectableProducts.length || !ratesKeys.length}><PackagePlus size={14} />สร้าง Bundle</button>
        <button type="button" onClick={exportBundles} disabled={busy || !bundles.length}><Download size={14} />ส่งออก</button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={14} />นำเข้า</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="นำเข้า Product Bundle JSON" onChange={event => void importBundles(event.currentTarget.files?.[0] ?? null)} />
      </div>
      <div className="cf-supplier-category-tabs" role="tablist" aria-label="หมวด Product Bundle">
        {['ทุกหมวด', ...categories].map(category => {
          const count = category === 'ทุกหมวด' ? manageableBundles.length : manageableBundles.filter(bundle => (bundle.category?.trim() || 'ทั่วไป') === category).length
          return <button type="button" role="tab" aria-selected={categoryFilter === category} className={categoryFilter === category ? 'is-active' : ''} key={category} onClick={() => setCategoryFilter(category)}>{category}<span>{count}</span></button>
        })}
      </div>
      <label className="cf-library-hidden-toggle"><input type="checkbox" checked={showHiddenBundles} onChange={event => setShowHiddenBundles(event.target.checked)} />แสดง Bundle ที่ซ่อนจากแอป ({bundles.filter(bundle => bundle.hide_on_app).length})</label>
      {placementDraft && <div className="cf-supplier-bundle-editor" role="dialog" aria-label={`ตั้งค่า Bundle ${placementDraft.name} ก่อนวาง`}>
        <div className="cf-bundle-components-heading"><b>ตั้งค่าชุดวัสดุสำหรับชิ้นนี้</b><button type="button" onClick={() => setPlacementDraft(null)}>ยกเลิก</button></div>
        <p>ตัวเลือกนี้ใช้กับวัตถุชิ้นใหม่เท่านั้น และไม่เปลี่ยน Bundle ใน Library</p>
        {placementDraft.components.map((component, index) => {
          const group = component.product_group_id ? groups.find(item => item.id === component.product_group_id) : undefined
          const selectedProduct = productById.get(placementSelections[group?.id ?? ''] ?? component.product_id)
          return <div className="cf-bundle-component" key={`${component.product_id}-${index}`}>
            <span>{group?.name ?? selectedProduct?.name ?? `SKU ${index + 1}`} · {component.purchase_units_per_output_unit} / {placementDraft.unit}</span>
            {group ? <label>ตัวเลือก SKU<select aria-label={`ตัวเลือกสำหรับ ${group.name} ของ Bundle ${placementDraft.name}`} value={placementSelections[group.id] ?? component.product_id} onChange={event => setPlacementSelections(current => ({ ...current, [group.id]: event.target.value }))}>{group.product_ids.map(id => productById.get(id)).filter((item): item is LocalSupplierProduct => !!item).map(item => <option key={item.id} value={item.id}>{item.name} · {item.supplier_sku} · ฿{(item.package_price_thb / item.package_quantity).toLocaleString('th-TH', { maximumFractionDigits: 2 })}/{item.purchase_unit}</option>)}</select></label> : <span>{selectedProduct?.supplier_sku ?? 'ไม่พบ SKU'}</span>}
          </div>
        })}
        <div className="cf-supplier-product-actions"><button type="button" onClick={() => setPlacementDraft(null)}>ยกเลิก</button><button type="button" onClick={beginPlacement}>วางบนแบบ</button></div>
      </div>}
      {draft && <div className="cf-supplier-bundle-editor">
        <div className="cf-supplier-bundle-form">
          <label>ชื่อ Bundle<input value={draft.name} maxLength={160} onChange={event => updateDraft({ name: event.target.value })} /></label>
          <label>รูปแบบบนแปลน<select value={draft.visual_type ?? ''} onChange={event => updateDraft({ visual_type: event.target.value ? event.target.value as 'shape' | 'length' | 'area' : undefined })}><option value="">ไม่ผูกกับรูปทรง</option><option value="shape">จุด / จำนวนชิ้น</option><option value="length">แนวเส้น / เมตร</option><option value="area">พื้นที่ / ตารางเมตร</option></select></label>
          <label>หมวดหมู่<input value={draft.category ?? ''} maxLength={80} placeholder="เช่น ชุดวัสดุ, งานระบบ" onChange={event => updateDraft({ category: event.target.value || undefined })} /></label>
          <label>กลุ่ม BOQ<select value={draft.rate_key} onChange={event => updateDraft({ rate_key: event.target.value })}>{ratesKeys.map(key => <option key={key} value={key}>{rateLabels[key] ?? key} · {rates[key].unit}</option>)}</select></label>
          <label>ค่าแรงต่อ {draft.unit} ฿<input type="number" min="0" step="0.01" value={draft.labor_rate_per_output_unit} onChange={event => updateDraft({ labor_rate_per_output_unit: Number(event.target.value) })} /></label>
          <label>วิธีคิดค่าแรง<select value={draft.labor_calculation_mode ?? 'fixed'} onChange={event => updateDraft({ labor_calculation_mode: event.target.value as 'fixed' | 'components' })}><option value="fixed">กำหนดค่าแรงต่อหน่วยเอง</option><option value="components">รวมค่าแรงจาก SKU ในชุด</option></select></label>
          <label className="cf-bundle-wide">หมายเหตุ<textarea value={draft.notes ?? ''} maxLength={1000} rows={2} onChange={event => updateDraft({ notes: event.target.value || undefined })} /></label>
          <fieldset className="cf-library-visibility"><legend>การแสดงผล</legend>
            <label><input type="checkbox" checked={draft.hide_on_app === true} onChange={event => updateDraft({ hide_on_app: event.target.checked })} />ซ่อนจากรายการเลือกในแอป</label>
            <label><input type="checkbox" checked={draft.hide_on_proposal === true} onChange={event => updateDraft({ hide_on_proposal: event.target.checked })} />ซ่อนรายละเอียดในข้อเสนอ · คงรวมยอด</label>
          </fieldset>
        </div>
        <div className="cf-bundle-components-heading"><b>องค์ประกอบ SKU</b><button type="button" onClick={addComponent} disabled={busy || draft.components.length >= Math.min(100, products.length) || selectableProducts.every(product => draft.components.some(item => item.product_id === product.id))}>เพิ่ม SKU</button></div>
        <div className="cf-bundle-components">
          {draft.components.map((component, index) => {
            const product = productById.get(component.product_id)
            const usedElsewhere = new Set(draft.components.filter((_, itemIndex) => itemIndex !== index).map(item => item.product_id))
            return <div className="cf-bundle-component" key={`${component.product_id}-${index}`}>
              <label>Product Group<select value={component.product_group_id ?? ''} onChange={event => {
                const group = groups.find(item => item.id === event.target.value)
                updateComponent(index, group ? { product_group_id: group.id, product_id: group.default_product_id } : { product_group_id: undefined })
              }}><option value="">เลือก SKU เดียว</option>{groups.filter(group => group.product_ids.some(id => productById.get(id)?.unit === product?.unit)).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              <label>SKU ที่เลือก<select value={component.product_id} onChange={event => updateComponent(index, { product_id: event.target.value })}>{(component.product_group_id ? groups.find(group => group.id === component.product_group_id)?.product_ids.map(id => productById.get(id)).filter((item): item is LocalSupplierProduct => !!item) ?? [] : products).filter(item => (!item.hide_on_app || item.id === component.product_id) && (!usedElsewhere.has(item.id) || item.id === component.product_id)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.supplier_sku}{item.hide_on_app ? ' · ซ่อนจากแอป' : ''}</option>)}</select></label>
              <label>แพ็ก / {draft.unit}<input type="number" min="0.0001" step="any" value={component.purchase_units_per_output_unit} onChange={event => updateComponent(index, { purchase_units_per_output_unit: Number(event.target.value) })} /></label>
              <label>เผื่อเศษ %<input type="number" min="0" max="200" step="0.1" value={component.waste_percent} onChange={event => updateComponent(index, { waste_percent: Number(event.target.value) })} /></label>
              {draft.visual_type === 'area' && <label>คิดปริมาณจาก<select value={component.quantity_mode ?? 'area'} onChange={event => updateComponent(index, { quantity_mode: event.target.value as 'area' | 'perimeter' })}><option value="area">พื้นที่ (m²)</option><option value="perimeter">เส้นรอบรูป (m)</option></select></label>}
              <span className="cf-bundle-component-cost">{product ? `${((product.package_price_thb / product.package_quantity) * component.purchase_units_per_output_unit * (1 + component.waste_percent / 100)).toLocaleString('th-TH', { maximumFractionDigits: 2 })} ฿/${draft.unit}` : 'ไม่พบ SKU'}</span>
              <button type="button" aria-label={`นำ SKU ลำดับที่ ${index + 1} ออกจาก Bundle`} onClick={() => setDraft(current => current ? { ...current, components: current.components.filter((_, itemIndex) => itemIndex !== index) } : current)} disabled={draft.components.length <= 1}>×</button>
            </div>
          })}
        </div>
        <div className="cf-supplier-product-preview">{isGeometryDependentArea(draft)
          ? <>ราคาต่อ m² <b>คำนวณหลังวาง</b> จากพื้นที่และเส้นรอบรูปจริง · ค่าแรง {draft.labor_calculation_mode === 'components' ? <b>รวมจากแรงงาน SKU ตามขอบเขตจริง</b> : <b>฿{draft.labor_rate_per_output_unit.toLocaleString('th-TH', { maximumFractionDigits: 2 })} / {draft.unit}</b>}</>
          : <>วัสดุต้นทุน <b>฿{previewRate?.material_rate.toLocaleString('th-TH', { maximumFractionDigits: 4 }) ?? '—'} / {draft.unit}</b> · ราคาขาย <b>฿{previewRate?.material_sell_rate?.toLocaleString('th-TH', { maximumFractionDigits: 4 }) ?? '—'} / {draft.unit}</b> · Margin {previewRate?.product_gross_margin_percent?.toLocaleString('th-TH') ?? '—'}% · ค่าแรง <b>฿{draft.labor_rate_per_output_unit.toLocaleString('th-TH', { maximumFractionDigits: 2 })} / {draft.unit}</b></>}</div>
        <div className="cf-supplier-product-actions"><button type="button" onClick={() => setDraft(null)} disabled={busy}>ยกเลิก</button><button type="button" onClick={() => void save()} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก Bundle'}</button></div>
      </div>}
      {visibleBundles.length ? <div className="cf-supplier-bundles">
        {visibleBundles.map(bundle => {
          const geometryDependent = isGeometryDependentArea(bundle)
          const canPlaceOnCanvas = !!onBeginPlacement && !!(bundle.visual_type ?? visualTypeForUnit(bundle.unit))
          let unitRate: ProjectTakeoffRate | null = null
          try { unitRate = supplierProductBundleUnitRate(bundle, products, pricingSettings, groups) } catch { /* The card below exposes an unavailable rate. */ }
          return <article className="cf-supplier-bundle" key={bundle.id}>
            <div className="cf-supplier-product-info"><strong>{bundle.name}</strong><span>{bundle.category?.trim() || 'ทั่วไป'} · {rateLabels[bundle.rate_key] ?? bundle.rate_key} · {bundle.components.length} SKU · {geometryDependent ? 'ราคาต่อพื้นที่คำนวณจากขอบเขตจริง' : `ต้นทุน ฿${unitRate?.material_rate.toLocaleString('th-TH', { maximumFractionDigits: 4 }) ?? '—'} → ขาย ฿${unitRate?.material_sell_rate?.toLocaleString('th-TH', { maximumFractionDigits: 4 }) ?? '—'}`} · ค่าแรง {bundle.labor_calculation_mode === 'components' ? 'จาก SKU' : `฿${bundle.labor_rate_per_output_unit.toLocaleString('th-TH', { maximumFractionDigits: 2 })} / ${bundle.unit}`}</span><small>{bundle.components.map(component => `${component.product_group_id ? `${groups.find(group => group.id === component.product_group_id)?.name ?? 'กลุ่มหาย'}: ` : ''}${productById.get(component.product_id)?.supplier_sku ?? 'SKU หาย'}${component.quantity_mode === 'perimeter' ? ' · เส้นรอบรูป' : ''}`).join(' · ')}</small>{(bundle.hide_on_app || bundle.hide_on_proposal) && <small className="cf-library-visibility-note">{[bundle.hide_on_app && 'ซ่อนจากรายการเลือก', bundle.hide_on_proposal && 'ซ่อนรายละเอียดในข้อเสนอ'].filter(Boolean).join(' · ')}</small>}</div>
            <div className="cf-supplier-product-actions"><button type="button" onClick={() => apply(bundle)} disabled={busy || bundle.hide_on_app === true || !unitRate || !rates[bundle.rate_key] || rates[bundle.rate_key].unit !== bundle.unit}>ใช้</button>{canPlaceOnCanvas && <button type="button" onClick={() => { setPlacementDraft(structuredClone(bundle)); setPlacementSelections({}); setError(''); setMessage('') }} disabled={busy || bundle.hide_on_app === true || (!unitRate && !geometryDependent) || (bundle.visual_type !== undefined && bundle.visual_type !== visualTypeForUnit(bundle.unit))}>วางบนแบบ</button>}<button type="button" aria-label={`แก้ไข Bundle ${bundle.name}`} onClick={() => { setDraft(structuredClone(bundle)); setError(''); setMessage('') }} disabled={busy}><Pencil size={14} /></button><button type="button" className="is-delete" aria-label={`ลบ Bundle ${bundle.name}`} onClick={() => void remove(bundle)} disabled={busy}><Trash2 size={14} /></button></div>
          </article>
        })}
      </div> : <p className="cf-supplier-empty">{!bundles.length ? products.length ? 'ยังไม่มี Bundle · รวม SKU หลายรายการแล้วกำหนดเป็นต้นทุนต่อหน่วย BOQ' : 'เพิ่ม Supplier SKU ก่อนสร้าง Bundle' : !manageableBundles.length ? 'Bundle ทั้งหมดถูกซ่อนจากตัวเลือก · เปิด “แสดง Bundle ที่ซ่อนจากแอป” เพื่อจัดการ' : `ไม่มี Bundle ในหมวด “${categoryFilter}”`}</p>}
      {(message || error) && <p className={`cf-supplier-status${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}</p>}
    </div>
  </details>
}
