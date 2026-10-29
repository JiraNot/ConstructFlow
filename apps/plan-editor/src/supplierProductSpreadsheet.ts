import { validateSupplierProduct, validateSupplierProductBundle, validateSupplierProductGroupProducts, type SupplierProduct, type SupplierProductBundle, type SupplierProductGroup } from '@constructflow/takeoff-engine'
import type { ProjectTakeoffRate } from '@constructflow/project-model'
import type { LocalSupplierProduct, LocalSupplierProductBundle, LocalSupplierProductGroup } from './projectAutosave.js'

export interface SupplierProductSpreadsheetPreview {
  products: LocalSupplierProduct[]
  groups?: LocalSupplierProductGroup[]
  bundles?: LocalSupplierProductBundle[]
  issues: string[]
  source_rows: number
  source_format?: 'constructflow' | 'arcsite'
  notices?: string[]
  rate_key_mappings?: Array<{ record_type: 'product' | 'bundle'; row_number: number; product_name: string; source_unit: string; candidates: string[] }>
}

type Row = string[]
type Column = 'supplier' | 'sku' | 'name' | 'category' | 'rate_key' | 'unit' | 'purchase_unit' | 'package_quantity' | 'package_price' | 'labor_rate' | 'gross_margin' | 'fixed_material_sell_rate' | 'hide_on_app' | 'hide_on_proposal' | 'product_url' | 'notes'

const MAX_ROWS = 1000
const MAX_ISSUES = 30

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('th-TH').replace(/[\s_.\-/()[\]%]/g, '')
}

const aliases: Record<Column, Set<string>> = {
  supplier: new Set(['supplier', 'suppliername', 'vendor', 'vendorname', 'ผู้จำหน่าย', 'ร้านค้า']),
  sku: new Set(['sku', 'suppliersku', 'productcode', 'itemcode', 'รหัสสินค้า', 'รหัสsku']),
  name: new Set(['name', 'product', 'productname', 'item', 'itemname', 'ชื่อสินค้า', 'สินค้า']),
  category: new Set(['category', 'productcategory', 'group', 'หมวด', 'หมวดหมู่']),
  rate_key: new Set(['ratekey', 'boqkey', 'takeoffkey', 'กลุ่มboq', 'รหัสboq']),
  unit: new Set(['unit', 'takeoffunit', 'measurementunit', 'โมเดลยูนิต', 'หน่วยโมเดล']),
  purchase_unit: new Set(['purchaseunit', 'packunit', 'buyunit', 'หน่วยซื้อ', 'หน่วยบรรจุ']),
  package_quantity: new Set(['packagequantity', 'quantityperpackage', 'qtyperpack', 'ปริมาณต่อแพ็ก', 'จำนวนต่อหน่วยซื้อ']),
  package_price: new Set(['packageprice', 'packagepricethb', 'priceperpackage', 'ราคาต่อแพ็ก', 'ราคาต่อหน่วยซื้อ']),
  labor_rate: new Set(['laborrate', 'laborrateperunit', 'ค่าแรงต่อหน่วย', 'ค่าแรง']),
  gross_margin: new Set(['grossmargin', 'grossmarginpercent', 'marginpercent', 'margin', 'grossmargin%', 'มาร์จิน', 'กำไรขั้นต้น']),
  fixed_material_sell_rate: new Set(['fixedmaterialsellratethb', 'materialsellrate', 'unitpricethb', 'fixedsellrate', 'ราคาขายวัสดุต่อหน่วย', 'ราคาขายคงที่']),
  hide_on_app: new Set(['hideonapp', 'hidefromapp', 'ซ่อนในแอป', 'ซ่อนจากแอป', 'ซ่อนจากรายการเลือก']),
  hide_on_proposal: new Set(['hideonproposal', 'hideonoutput', 'ซ่อนในข้อเสนอ', 'ซ่อนจากข้อเสนอ']),
  product_url: new Set(['producturl', 'url', 'link', 'ลิงก์สินค้า', 'ลิงก์']),
  notes: new Set(['notes', 'note', 'หมายเหตุ']),
}

function detectDelimiter(line: string): string {
  let quoted = false
  const counts = new Map([[',', 0], [';', 0], ['\t', 0]])
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ','
}

function parseDelimited(source: string, delimiter: string): Row[] {
  const text = source.replace(/^\uFEFF/, '')
  const rows: Row[] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (quoted || !cell.length) quoted = !quoted
      else cell += char
    } else if (!quoted && char === delimiter) {
      row.push(cell); cell = ''
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (quoted) throw new Error('ไฟล์ CSV มีเครื่องหมายอัญประกาศที่ปิดไม่ครบ')
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const cell = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> }
    if (Array.isArray(cell.richText)) return cell.richText.map(part => String(part.text ?? '')).join('')
    if (cell.text !== undefined) return String(cell.text)
    if (cell.result !== undefined) return String(cell.result)
    return ''
  }
  return String(value).trim()
}

function buildPreview(rows: Row[], rates: Record<string, ProjectTakeoffRate>, existing: LocalSupplierProduct[]): SupplierProductSpreadsheetPreview {
  const issues: string[] = []
  const products: LocalSupplierProduct[] = []
  const addIssue = (message: string) => { if (issues.length < MAX_ISSUES) issues.push(message) }
  const sourceRows = Math.max(0, rows.length - 1)
  if (sourceRows > MAX_ROWS) return { products, issues: [`นำเข้าได้ไม่เกิน ${MAX_ROWS} แถวต่อครั้ง`], source_rows: sourceRows }

  const columns = new Map<Column, number>()
  ;(rows[0] ?? []).forEach((value, index) => {
    const key = normalize(value)
    const matched = (Object.keys(aliases) as Column[]).find(column => aliases[column].has(key))
    if (!matched) return
    if (columns.has(matched)) addIssue(`หัวตารางมีคอลัมน์ ${matched} ซ้ำ`)
    else columns.set(matched, index)
  })
  const required: Column[] = ['supplier', 'sku', 'name', 'rate_key', 'unit', 'purchase_unit', 'package_quantity', 'package_price', 'labor_rate']
  for (const column of required) if (!columns.has(column)) addIssue(`ไม่พบคอลัมน์ ${column}`)
  if (issues.length) return { products, issues, source_rows: sourceRows }

  const value = (row: Row, column: Column) => row[columns.get(column) ?? -1]?.trim() ?? ''
  const existingBySku = new Map(existing.map(product => [`${product.supplier_name.trim().toLocaleLowerCase('th-TH')}\u0000${product.supplier_sku.trim().toLocaleLowerCase('th-TH')}`, product]))
  const seenSkus = new Set<string>()
  const now = new Date().toISOString()
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    if (row.every(cell => !cell.trim())) continue
    const rowNumber = index + 1
    const supplier = value(row, 'supplier')
    const sku = value(row, 'sku')
    const name = value(row, 'name')
    const rateKey = value(row, 'rate_key')
    const unit = value(row, 'unit')
    const purchaseUnit = value(row, 'purchase_unit')
    const packageQuantity = Number(value(row, 'package_quantity'))
    const packagePrice = Number(value(row, 'package_price'))
    const laborRate = Number(value(row, 'labor_rate'))
    const rawFixedSellRate = value(row, 'fixed_material_sell_rate')
    const fixedSellRate = rawFixedSellRate ? Number(rawFixedSellRate) : undefined
    const category = value(row, 'category')
    const rawMargin = value(row, 'gross_margin')
    const margin = rawMargin ? Number(rawMargin.replace(/%$/, '').trim()) : undefined
    let invalid = false
    const fail = (message: string) => { invalid = true; addIssue(`แถว ${rowNumber}: ${message}`) }
    if (!supplier || supplier.length > 120) fail('ชื่อผู้จำหน่ายต้องมี 1–120 ตัวอักษร')
    if (!sku || sku.length > 100) fail('SKU ต้องมี 1–100 ตัวอักษร')
    if (!name || name.length > 160) fail('ชื่อสินค้าต้องมี 1–160 ตัวอักษร')
    if (!category || category.length > 80) fail('หมวดหมู่ต้องมี 1–80 ตัวอักษร')
    if (!rateKey || !rates[rateKey]) fail(`ไม่พบ Rate Key “${rateKey || 'ว่าง'}” ในชุดราคาปัจจุบัน`)
    if (!['item', 'm', 'm2', 'm3', 'kg'].includes(unit)) fail(`หน่วย “${unit || 'ว่าง'}” ต้องเป็น item, m, m2, m3 หรือ kg`)
    else if (rates[rateKey] && rates[rateKey].unit !== unit) fail(`หน่วย ${unit} ไม่ตรงกับ ${rateKey} (${rates[rateKey].unit})`)
    if (!purchaseUnit || purchaseUnit.length > 40) fail('หน่วยซื้อ/หน่วยบรรจุต้องมี 1–40 ตัวอักษร')
    if (!Number.isFinite(packageQuantity) || packageQuantity <= 0 || packageQuantity > 1_000_000_000) fail('ปริมาณต่อหน่วยซื้อต้องเป็นตัวเลขมากกว่า 0')
    if (!Number.isFinite(packagePrice) || packagePrice < 0 || packagePrice > 1_000_000_000_000) fail('ราคาต่อหน่วยซื้อต้องเป็น THB ตั้งแต่ 0 ขึ้นไป')
    if (!Number.isFinite(laborRate) || laborRate < 0 || laborRate > 1_000_000_000) fail('ค่าแรงต่อหน่วยต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
    if (margin !== undefined && (!Number.isFinite(margin) || margin < 0 || margin >= 100)) fail('Gross margin ต้องอยู่ระหว่าง 0 ถึงน้อยกว่า 100%')
    if (fixedSellRate !== undefined && (!Number.isFinite(fixedSellRate) || fixedSellRate < 0 || fixedSellRate > 1_000_000_000_000)) fail('ราคาขายวัสดุต่อหน่วยต้องเป็น THB ตั้งแต่ 0 ขึ้นไป')
    if (fixedSellRate !== undefined && Number.isFinite(packagePrice / packageQuantity) && fixedSellRate + 0.0001 < packagePrice / packageQuantity) fail('ราคาขายคงที่ต่ำกว่าต้นทุนวัสดุต่อหน่วย')
    const parseVisibility = (column: 'hide_on_app' | 'hide_on_proposal'): boolean | undefined => {
      if (!columns.has(column)) return undefined
      const flag = value(row, column).trim().toLocaleLowerCase('th-TH')
      if (!flag || ['n', 'no', 'false', '0', 'ไม่'].includes(flag)) return false
      if (['y', 'yes', 'true', '1', 'ใช่'].includes(flag)) return true
      fail(`${column === 'hide_on_app' ? 'Hide on App' : 'Hide on Proposal'} ใช้ค่า Y/N, yes/no หรือ true/false`)
      return false
    }
    const hideOnApp = parseVisibility('hide_on_app')
    const hideOnProposal = parseVisibility('hide_on_proposal')
    const productUrl = value(row, 'product_url')
    if (productUrl) {
      try { if (new URL(productUrl).protocol !== 'https:') fail('ลิงก์สินค้าต้องใช้ HTTPS') }
      catch { fail('ลิงก์สินค้าไม่ถูกต้อง') }
    }
    const notes = value(row, 'notes')
    if (notes.length > 1000) fail('หมายเหตุยาวเกิน 1,000 ตัวอักษร')
    const skuKey = `${supplier.trim().toLocaleLowerCase('th-TH')}\u0000${sku.trim().toLocaleLowerCase('th-TH')}`
    if (seenSkus.has(skuKey)) fail(`SKU ${sku} ของ ${supplier} ซ้ำในไฟล์`)
    seenSkus.add(skuKey)
    if (invalid) continue

    const previous = existingBySku.get(skuKey)
    const product: LocalSupplierProduct = {
      id: previous?.id ?? crypto.randomUUID(),
      supplier_name: supplier,
      supplier_sku: sku,
      name,
      ...(category ? { category } : {}),
      rate_key: rateKey,
      unit: unit as SupplierProduct['unit'],
      purchase_unit: purchaseUnit,
      package_quantity: packageQuantity,
      package_price_thb: packagePrice,
      labor_rate_per_unit: laborRate,
      ...(margin !== undefined ? { gross_margin_percent: margin } : {}),
      ...(fixedSellRate !== undefined ? { input_unit_sell_rate_thb: fixedSellRate } : columns.has('fixed_material_sell_rate') ? {} : previous?.input_unit_sell_rate_thb !== undefined ? { input_unit_sell_rate_thb: previous.input_unit_sell_rate_thb } : {}),
      ...(hideOnApp !== undefined ? { hide_on_app: hideOnApp } : previous?.hide_on_app !== undefined ? { hide_on_app: previous.hide_on_app } : {}),
      ...(hideOnProposal !== undefined ? { hide_on_proposal: hideOnProposal } : previous?.hide_on_proposal !== undefined ? { hide_on_proposal: previous.hide_on_proposal } : {}),
      ...(productUrl ? { product_url: productUrl } : {}),
      ...(notes ? { notes } : {}),
      created_at: previous?.created_at ?? now,
      updated_at: now,
    }
    try { validateSupplierProduct(product); products.push(product) }
    catch (error) { fail(error instanceof Error ? error.message : 'ข้อมูลสินค้าไม่ถูกต้อง') }
  }
  if (!products.length && !issues.length) addIssue('ไม่พบรายการสินค้าใน spreadsheet')
  return { products: issues.length ? [] : products, issues, source_rows: sourceRows, source_format: 'constructflow' }
}

type ArcSiteUnit = { quantityUnit: LocalSupplierProduct['unit']; outputUnitsPerSourceUnit: number; dimension: 'length' | 'area' | 'volume' | 'item' }

const arcSiteUnits: Record<string, ArcSiteUnit> = {
  M: { quantityUnit: 'm', outputUnitsPerSourceUnit: 1, dimension: 'length' },
  MM: { quantityUnit: 'm', outputUnitsPerSourceUnit: 0.001, dimension: 'length' },
  FT: { quantityUnit: 'm', outputUnitsPerSourceUnit: 0.3048, dimension: 'length' },
  IN: { quantityUnit: 'm', outputUnitsPerSourceUnit: 0.0254, dimension: 'length' },
  YARD: { quantityUnit: 'm', outputUnitsPerSourceUnit: 0.9144, dimension: 'length' },
  M2: { quantityUnit: 'm2', outputUnitsPerSourceUnit: 1, dimension: 'area' },
  MM2: { quantityUnit: 'm2', outputUnitsPerSourceUnit: 0.000001, dimension: 'area' },
  SQFT: { quantityUnit: 'm2', outputUnitsPerSourceUnit: 0.09290304, dimension: 'area' },
  SQIN: { quantityUnit: 'm2', outputUnitsPerSourceUnit: 0.00064516, dimension: 'area' },
  SQYARD: { quantityUnit: 'm2', outputUnitsPerSourceUnit: 0.83612736, dimension: 'area' },
  SQYARDS: { quantityUnit: 'm2', outputUnitsPerSourceUnit: 0.83612736, dimension: 'area' },
  M3: { quantityUnit: 'm3', outputUnitsPerSourceUnit: 1, dimension: 'volume' },
  MM3: { quantityUnit: 'm3', outputUnitsPerSourceUnit: 0.000000001, dimension: 'volume' },
  CUFT: { quantityUnit: 'm3', outputUnitsPerSourceUnit: 0.028316846592, dimension: 'volume' },
  CUIN: { quantityUnit: 'm3', outputUnitsPerSourceUnit: 0.000016387064, dimension: 'volume' },
  CUYARD: { quantityUnit: 'm3', outputUnitsPerSourceUnit: 0.764554857984, dimension: 'volume' },
  CUYARDS: { quantityUnit: 'm3', outputUnitsPerSourceUnit: 0.764554857984, dimension: 'volume' },
  EACH: { quantityUnit: 'item', outputUnitsPerSourceUnit: 1, dimension: 'item' },
}

function stableUuid(value: string): string {
  const hexadecimal = cryptoHash(`${value}\u0000a`) + cryptoHash(`${value}\u0000b`)
  const digits = hexadecimal.split('')
  digits[12] = '5'
  digits[16] = ((Number.parseInt(digits[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  const uuid = digits.join('')
  return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`
}

function importArcSiteProductGroups(
  rows: Row[], products: LocalSupplierProduct[], existing: LocalSupplierProductGroup[], notices: string[],
): LocalSupplierProductGroup[] {
  const normalizedValue = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('th-TH')
  const columns = new Map<string, number>()
  ;(rows[0] ?? []).forEach((value, index) => columns.set(normalize(value), index))
  const groupNameIndex = columns.get(normalize('Group Name'))
  const productNameIndex = columns.get(normalize('Name'))
  const defaultIndex = columns.get(normalize('Default Option'))
  const idIndex = columns.get(normalize('ID (Do not change)')) ?? columns.get(normalize('ID'))
  if (rows.slice(1).some(row => row.some(cell => cell.trim())) && (groupNameIndex === undefined || productNameIndex === undefined)) {
    notices.push('ไม่ได้นำเข้า Product Groups · แท็บต้องมีคอลัมน์ Group Name และ Name')
    return []
  }
  const sourceGroups: Array<{ name: string; sourceId: string; names: string[]; defaultName?: string }> = []
  let current: typeof sourceGroups[number] | undefined
  const byKey = new Map<string, typeof sourceGroups[number]>()
  for (const row of rows.slice(1)) {
    if (row.every(value => !value.trim())) { current = undefined; continue }
    const name = groupNameIndex === undefined ? '' : row[groupNameIndex]?.trim() ?? ''
    const memberName = productNameIndex === undefined ? '' : row[productNameIndex]?.trim() ?? ''
    if (name) {
      const sourceId = idIndex === undefined ? '' : row[idIndex]?.trim() ?? ''
      const key = sourceId ? `id:${sourceId}` : `name:${normalizedValue(name)}`
      current = byKey.get(key)
      if (!current) { current = { name, sourceId, names: [] }; byKey.set(key, current); sourceGroups.push(current) }
    }
    if (!current || !memberName) continue
    current.names.push(memberName)
    const defaultOption = defaultIndex === undefined ? '' : row[defaultIndex]?.trim() ?? ''
    if (defaultOption && !['n', 'no', 'false', '0'].includes(normalizedValue(defaultOption))) {
      current.defaultName = ['y', 'yes', 'true', '1'].includes(normalizedValue(defaultOption)) ? memberName : defaultOption
    }
  }
  const arcProducts = [...new Map(products.filter(product => normalizedValue(product.supplier_name) === 'arcsite library').map(product => [product.id, product])).values()]
  const byName = new Map<string, LocalSupplierProduct[]>()
  for (const product of arcProducts) byName.set(normalizedValue(product.name), [...(byName.get(normalizedValue(product.name)) ?? []), product])
  const priorBySource = new Map(existing.map(group => [group.id, group]))
  const priorByName = new Map(existing.map(group => [normalizedValue(group.name), group]))
  const imported: LocalSupplierProductGroup[] = []
  for (const source of sourceGroups) {
    const matches = source.names.map(name => byName.get(normalizedValue(name)) ?? [])
    if (!source.name || source.name.length > 160 || !matches.length || matches.some(found => found.length !== 1)) {
      notices.push(`ไม่ได้นำเข้า Product Group “${source.name || 'ไม่มีชื่อ'}” · SKU ต้องมีอยู่และชื่อสมาชิกต้องระบุได้ไม่ซ้ำ`)
      continue
    }
    const members = matches.map(found => found[0]!)
    const memberIds = [...new Set(members.map(product => product.id))]
    const defaultMatch = source.defaultName ? members.find(product => normalizedValue(product.name) === normalizedValue(source.defaultName!)) : undefined
    const previousId = source.sourceId ? stableUuid(`arcsite-product-group:${source.sourceId}`) : undefined
    const previous = (previousId && priorBySource.get(previousId)) || priorByName.get(normalizedValue(source.name))
    const now = new Date().toISOString()
    const group: LocalSupplierProductGroup = {
      id: previous?.id ?? previousId ?? stableUuid(`arcsite-product-group:${normalizedValue(source.name)}`),
      name: source.name, product_ids: memberIds,
      default_product_id: defaultMatch?.id ?? (memberIds.includes(previous?.default_product_id ?? '') ? previous!.default_product_id : memberIds[0]!),
      created_at: previous?.created_at ?? now, updated_at: now,
    }
    try { validateSupplierProductGroupProducts(group, products); imported.push(group) }
    catch (error) { notices.push(`ไม่ได้นำเข้า Product Group “${source.name}” · ${error instanceof Error ? error.message : 'ข้อมูลไม่ถูกต้อง'}`) }
  }
  return imported
}

interface ArcSiteBundleRow {
  row_number: number
  category: string
  name: string
  visual_type: string
  unit: string
  hide_on_app: string
  hide_on_proposal: string
  bundle_id: string
  components: Array<{ name: string; quantity: string; optional: string; area_input: string }>
}

function importArcSiteShapeBundles(
  bundleRows: Row[],
  products: LocalSupplierProduct[],
  groups: LocalSupplierProductGroup[],
  rates: Record<string, ProjectTakeoffRate>,
  existingBundles: LocalSupplierProductBundle[],
  rateKeyOverrides: Record<string, string>,
  rateKeyMappings: NonNullable<SupplierProductSpreadsheetPreview['rate_key_mappings']>,
  notices: string[],
  addIssue: (message: string) => void,
): LocalSupplierProductBundle[] {
  const normalizedValue = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('th-TH')
  const columns = (rows: Row[]) => {
    const result = new Map<string, number>()
    ;(rows[0] ?? []).forEach((value, index) => result.set(normalize(value), index))
    return result
  }
  const groupsByName = new Map(groups.map(group => [normalizedValue(group.name), group]))
  const bundleColumn = columns(bundleRows)
  const findColumn = (...names: string[]) => names.map(name => bundleColumn.get(normalize(name))).find(index => index !== undefined)
  const column = {
    category: findColumn('Category'), name: findColumn('Bundle name'), visualType: findColumn('How would you draw it on canvas? (Visual Type)', 'Visual Type'),
    unit: findColumn('Unit'), hideOnApp: findColumn('Hide on App'), hideOnProposal: findColumn('Hide on Proposals', 'Hide on Proposal'),
    componentName: findColumn('Component Name'), quantity: findColumn('Quantity'), optional: findColumn('Optional'),
    areaInput: findColumn('Use Area or perimeter (only for Area Bundle)'), bundleId: findColumn('K (Do not change)', 'ID (Do not change)', 'ID'),
  }
  const populatedRows = bundleRows.slice(1).filter(row => row.some(value => value.trim()))
  if (!populatedRows.length) return []
  for (const key of ['category', 'name', 'visualType', 'unit', 'componentName', 'quantity'] as const) {
    if (column[key] === undefined) {
      addIssue(`ArcSite Bundles tab: ไม่พบคอลัมน์ ${key}`)
      return []
    }
  }
  const cell = (row: Row, key: keyof typeof column) => {
    const index = column[key]
    return index === undefined ? '' : row[index]?.trim() ?? ''
  }
  const sourceBundles: ArcSiteBundleRow[] = []
  const byIdentity = new Map<string, ArcSiteBundleRow>()
  let current: ArcSiteBundleRow | undefined
  for (let index = 1; index < bundleRows.length; index += 1) {
    const row = bundleRows[index] ?? []
    if (row.every(value => !value.trim())) { current = undefined; continue }
    const rowNumber = index + 1
    const name = cell(row, 'name')
    if (name) {
      const category = cell(row, 'category')
      const sourceId = cell(row, 'bundleId')
      const key = sourceId ? `id:${sourceId}` : `name:${normalizedValue(category)}\u0000${normalizedValue(name)}`
      current = byIdentity.get(key)
      if (!current) {
        current = {
          row_number: rowNumber, category, name, visual_type: cell(row, 'visualType'), unit: cell(row, 'unit'),
          hide_on_app: cell(row, 'hideOnApp'), hide_on_proposal: cell(row, 'hideOnProposal'), bundle_id: sourceId, components: [],
        }
        byIdentity.set(key, current)
        sourceBundles.push(current)
      }
    }
    const componentName = cell(row, 'componentName')
    if (componentName) {
      if (!current) { addIssue(`ArcSite Bundles แถว ${rowNumber}: Component Name ไม่มี Bundle ที่ครอบอยู่`); continue }
      current.components.push({ name: componentName, quantity: cell(row, 'quantity'), optional: cell(row, 'optional'), area_input: cell(row, 'areaInput') })
    }
  }
  if (sourceBundles.length > 500) { addIssue('นำเข้าได้ไม่เกิน 500 Product Bundles ต่อครั้ง'); return [] }
  const arcProducts = [...new Map(products
    .filter(product => normalizedValue(product.supplier_name) === 'arcsite library')
    .map(product => [product.id, product])).values()]
  const productsByName = new Map<string, LocalSupplierProduct[]>()
  for (const product of arcProducts) {
    const key = normalizedValue(product.name)
    productsByName.set(key, [...(productsByName.get(key) ?? []), product])
  }
  const existingArcSiteBundles = existingBundles.filter(bundle => bundle.notes?.includes('ArcSite bundle source:'))
  const imported: LocalSupplierProductBundle[] = []
  let skippedUnsupportedVisual = 0
  let skippedUnsupported = 0
  for (const source of sourceBundles) {
    const fail = (message: string) => addIssue(`ArcSite Bundle “${source.name || `แถว ${source.row_number}`}”: ${message}`)
    const visualType = source.visual_type.trim().toLocaleUpperCase('en-US').replace(/[\s._/\-]/g, '')
    const unit = source.unit.normalize('NFKC').trim().toLocaleUpperCase('en-US').replace(/[\s._/\-]/g, '')
    const isShapeBundle = visualType === 'SHAPE' && ['SHAPE', 'EACH'].includes(unit)
    const bundleUnitInfo = arcSiteUnits[unit]
    const isLengthBundle = ['LENGTH', 'LINEARC'].includes(visualType) && bundleUnitInfo?.dimension === 'length'
    const isAreaBundle = visualType === 'AREA' && bundleUnitInfo?.dimension === 'area'
    if (!isShapeBundle && !isLengthBundle && !isAreaBundle) { skippedUnsupportedVisual += 1; continue }
    if (!source.name || source.name.length > 160 || !source.category || source.category.length > 80) { fail('Bundle name และ Category ต้องมีค่าตามข้อกำหนด'); continue }
    if (!source.components.length) { fail('ต้องมี Component Name อย่างน้อยหนึ่งรายการ'); continue }
    if (source.components.some(component => normalizedValue(component.optional) && !['n', 'no', 'false', '0'].includes(normalizedValue(component.optional)))) {
      skippedUnsupported += 1
      continue
    }
    const components: LocalSupplierProductBundle['components'] = []
    let laborRate = 0
    let unsupportedReason = ''
    for (const component of source.components) {
      const componentName = normalizedValue(component.name)
      const productGroup = groupsByName.get(componentName)
      const matches = productsByName.get(componentName) ?? []
      if (!productGroup && matches.length !== 1) { unsupportedReason = matches.length ? `ชื่อ SKU “${component.name}” ซ้ำ` : `ไม่พบ SKU หรือ Product Group “${component.name}” ในแท็บ Products / Product Groups`; break }
      const product = productGroup ? products.find(item => item.id === productGroup.default_product_id) : matches[0]!
      if (!product) { unsupportedReason = `Product Group “${component.name}” ไม่มี default SKU ที่นำเข้าได้`; break }
      const sourceUnit = product.purchase_unit.normalize('NFKC').trim().toLocaleUpperCase('en-US').replace(/[\s._/\-]/g, '')
      const unitInfo = arcSiteUnits[sourceUnit]
      const quantity = Number(component.quantity.replace(/,/g, ''))
      if (!unitInfo || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) { unsupportedReason = `Quantity ของ “${component.name}” ไม่ใช่ตัวคูณตัวเลขที่รองรับ`; break }
      if (components.some(item => item.product_id === product.id)) { unsupportedReason = `SKU “${component.name}” ซ้ำใน Bundle`; break }
      const areaInput = normalizedValue(component.area_input)
      const isPerimeterComponent = isAreaBundle && ['perimeter', 'perimeterlength', 'length', 'เส้นรอบรูป'].includes(areaInput)
      const outputUnits = isPerimeterComponent ? 1 : (isLengthBundle || isAreaBundle) ? bundleUnitInfo?.outputUnitsPerSourceUnit ?? 1 : 1
      const unitsPerBundleUnit = Number((quantity * unitInfo.outputUnitsPerSourceUnit / outputUnits).toFixed(8))
      if (!(unitsPerBundleUnit > 0) || unitsPerBundleUnit > 1_000_000) { unsupportedReason = `Quantity ของ “${component.name}” เล็กเกินไปหรือมากเกินไปหลังแปลงหน่วย`; break }
      components.push({ product_id: product.id, ...(productGroup ? { product_group_id: productGroup.id } : {}), purchase_units_per_output_unit: unitsPerBundleUnit, waste_percent: 0 })
      if (areaInput && isAreaBundle) {
        if (['area', 'พื้นที่'].includes(areaInput)) components[components.length - 1]!.quantity_mode = 'area'
        else if (['perimeter', 'perimeterlength', 'length', 'เส้นรอบรูป'].includes(areaInput)) components[components.length - 1]!.quantity_mode = 'perimeter'
        else { unsupportedReason = `Area or perimeter ของ “${component.name}” ต้องเป็น Area หรือ Perimeter`; break }
      } else if (areaInput && !isAreaBundle) {
        unsupportedReason = `Area or perimeter ของ “${component.name}” ใช้ได้กับ Area Bundle เท่านั้น`; break
      }
      laborRate += product.labor_rate_per_unit * unitsPerBundleUnit
    }
    if (unsupportedReason) { skippedUnsupported += 1; notices.push(`ไม่ได้นำเข้า Bundle “${source.name}”: ${unsupportedReason}`); continue }
    const bundleQuantityUnit = (isLengthBundle || isAreaBundle) ? bundleUnitInfo?.quantityUnit ?? (isAreaBundle ? 'm2' : 'm') : 'item'
    const rateCandidates = Object.keys(rates).filter(key => rates[key]?.unit === bundleQuantityUnit).sort()
    const mappingKey = `bundle:${source.row_number}`
    const rateKey = rateKeyOverrides[mappingKey] || (rateCandidates.length === 1 ? rateCandidates[0] : '')
    if (!rateKey && rateCandidates.length > 1) {
      rateKeyMappings.push({ record_type: 'bundle', row_number: source.row_number, product_name: source.name, source_unit: isLengthBundle ? `${source.visual_type} · ${source.unit} → m` : 'Shape · Each', candidates: rateCandidates })
      continue
    }
    if (!rateKey) { skippedUnsupported += 1; notices.push(`ไม่ได้นำเข้า Bundle “${source.name}”: ไม่พบ BOQ Rate Key หน่วย ${bundleQuantityUnit}`); continue }
    const hideOnApp = parseArcSiteFlag(source.hide_on_app, 'Hide on App', fail)
    const hideOnProposal = parseArcSiteFlag(source.hide_on_proposal, 'Hide on Proposals', fail)
    const sourceMarker = source.bundle_id ? `ArcSite bundle source: ${source.bundle_id}` : `ArcSite bundle source: ${normalizedValue(source.category)}|${normalizedValue(source.name)}`
    const previous = existingArcSiteBundles.find(bundle => bundle.notes === sourceMarker)
    const bundle: LocalSupplierProductBundle = {
      id: previous?.id ?? stableUuid(`arcsite-bundle:${sourceMarker}`), name: source.name,
      visual_type: isShapeBundle ? 'shape' : isLengthBundle ? 'length' : 'area', category: source.category,
      labor_calculation_mode: 'components',
      rate_key: rateKey, unit: bundleQuantityUnit, labor_rate_per_output_unit: Number(laborRate.toFixed(4)), components,
      hide_on_app: hideOnApp, hide_on_proposal: hideOnProposal,
      notes: sourceMarker.slice(0, 1000), created_at: previous?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    try { validateSupplierProductBundle(bundle, groups); imported.push(bundle) }
    catch (error) { fail(error instanceof Error ? error.message : 'ข้อมูล Bundle ไม่ถูกต้อง') }
  }
  if (skippedUnsupportedVisual) notices.push(`ข้าม Bundle ที่ Visual Type หรือ Unit ไม่รองรับ ${skippedUnsupportedVisual} ชุด`)
  if (imported.some(bundle => bundle.unit === 'm')) notices.push('นำเข้า Length/Line Bundle เป็นอัตราต่อเมตรแล้ว · ต้องจับคู่ BOQ Rate Key หน่วย m; Bundle ยังเป็นสูตรราคาใน Library ไม่ใช่วัตถุที่วางบน Canvas')
  if (skippedUnsupported) notices.push(`ข้าม Bundle ที่มี Optional components, SKU/Quantity ที่แปลงตรงไม่ได้, หรือองค์ประกอบที่ยังไม่มีใน Products จำนวน ${skippedUnsupported} ชุด`)
  return imported
}

function parseArcSiteFlag(value: string, label: string, fail: (message: string) => void): boolean {
  const flag = normalize(value)
  if (!flag || ['n', 'no', 'false', '0'].includes(flag)) return false
  if (['y', 'yes', 'true', '1'].includes(flag)) return true
  fail(`${label} ใช้ค่า Y/N, yes/no หรือ true/false`)
  return false
}

function importArcSiteWorkbook(
  productRows: Row[],
  groupRows: Row[],
  bundleRows: Row[],
  rates: Record<string, ProjectTakeoffRate>,
  existing: LocalSupplierProduct[],
  existingBundles: LocalSupplierProductBundle[],
  rateKeyOverrides: Record<string, string>,
  existingGroups: LocalSupplierProductGroup[],
): SupplierProductSpreadsheetPreview {
  const issues: string[] = []
  const notices: string[] = []
  const products: LocalSupplierProduct[] = []
  const rateKeyMappings: NonNullable<SupplierProductSpreadsheetPreview['rate_key_mappings']> = []
  const addIssue = (message: string) => { if (issues.length < MAX_ISSUES) issues.push(message) }
  const meaningfulRows = (rows: Row[]) => rows.slice(1).filter(row => row.some(value => value.trim())).length
  const productCount = meaningfulRows(productRows)
  const groupCount = meaningfulRows(groupRows)
  const bundleCount = meaningfulRows(bundleRows)
  if (productCount > MAX_ROWS) return { products, issues: [`นำเข้าได้ไม่เกิน ${MAX_ROWS} สินค้าต่อครั้ง`], source_rows: productCount, source_format: 'arcsite' }
  if (groupCount > 500) return { products, issues: ['นำเข้าได้ไม่เกิน 500 Product Groups ต่อครั้ง'], source_rows: productCount + groupCount + bundleCount, source_format: 'arcsite' }
  notices.push('สินค้าที่นำเข้าจะใช้ชื่อผู้จำหน่าย “ArcSite Library” · แก้ชื่อได้ภายหลังใน Supplier Library')

  const columns = new Map<string, number>()
  ;(productRows[0] ?? []).forEach((value, index) => columns.set(normalize(value), index))
  const findColumn = (...names: string[]) => names.map(name => columns.get(normalize(name))).find(index => index !== undefined)
  const column = {
    category: findColumn('Category'), name: findColumn('Name'), sku: findColumn('SKU'), description: findColumn('Description (optional)', 'Description'),
    unit: findColumn('Unit'), pricePart: findColumn('Price Part'), priceOptions: findColumn('Price Options'), pricingMethod: findColumn('Pricing Method'),
    unitPrice: findColumn('Unit Price'), unitCost: findColumn('Unit Cost'), taxExempt: findColumn('Tax Exempt'), hideOnApp: findColumn('Hide on App'),
    hideOnProposal: findColumn('Hide on Proposals', 'Hide on Proposal'), productId: findColumn('Product ID (Do not change)', 'Product ID'),
    visualType: findColumn('How would you draw it on canvas? (Visual Type)', 'Visual Type'), rateKey: findColumn('CF Rate Key', 'Rate Key'),
  }
  for (const key of ['category', 'name', 'unit', 'pricingMethod', 'unitPrice', 'unitCost', 'visualType'] as const) if (column[key] === undefined) addIssue(`ArcSite Products tab: ไม่พบคอลัมน์ ${key}`)
  if (issues.length) return { products: [], issues, source_rows: productCount, source_format: 'arcsite', notices }

  const cell = (row: Row, key: keyof typeof column) => {
    const index = column[key]
    return index === undefined ? '' : row[index]?.trim() ?? ''
  }
  const existingBySku = new Map(existing.map(product => [`${product.supplier_name.trim().toLocaleLowerCase('th-TH')}\u0000${product.supplier_sku.trim().toLocaleLowerCase('th-TH')}`, product]))
  const seen = new Set<string>()
  let taxExemptRows = 0
  let pricePartRows = 0
  let fixedPriceRows = 0
  let calculatedPriceRows = 0
  let convertedUnitRows = 0
  const now = new Date().toISOString()
  for (let index = 1; index < productRows.length; index += 1) {
    const row = productRows[index] ?? []
    if (row.every(value => !value.trim())) continue
    const rowNumber = index + 1
    const name = cell(row, 'name')
    const category = cell(row, 'category')
    const sourceUnit = cell(row, 'unit').normalize('NFKC').trim().toLocaleUpperCase('en-US').replace(/[\s._/\-]/g, '')
    const visualType = cell(row, 'visualType').trim().toLocaleUpperCase('en-US').replace(/[\s._\-]/g, '')
    const unitInfo = arcSiteUnits[sourceUnit]
    const pricingMethod = normalize(cell(row, 'pricingMethod'))
    const rawPrice = cell(row, 'unitPrice')
    const rawCost = cell(row, 'unitCost')
    const unitPrice = rawPrice ? Number(rawPrice.replace(/,/g, '')) : undefined
    const unitCost = rawCost ? Number(rawCost.replace(/,/g, '')) : undefined
    const fail = (message: string) => addIssue(`ArcSite Products แถว ${rowNumber}: ${message}`)
    if (!name || name.length > 160) fail('Name ต้องมี 1–160 ตัวอักษร')
    if (!category || category.length > 80) fail('Category ต้องมี 1–80 ตัวอักษร')
    if (!unitInfo) fail(`Unit “${cell(row, 'unit') || 'ว่าง'}” ยังไม่มีหน่วยเมตริกที่เทียบตรงได้`)
    const expectedDimension = visualType === 'AREA' || visualType === 'VERTICALSURFACE' ? 'area' : visualType === 'VOLUME' ? 'volume' : ['ICON/SHAPE', 'NOVISUAL'].includes(visualType) ? 'item' : visualType === 'LINE/ARC' ? 'length' : undefined
    if (!expectedDimension) fail(`Visual Type “${cell(row, 'visualType') || 'ว่าง'}” ไม่รองรับ`)
    else if (unitInfo && expectedDimension !== unitInfo.dimension) fail(`Visual Type ${cell(row, 'visualType')} ไม่ตรงกับ Unit ${cell(row, 'unit')}`)
    if (!Number.isFinite(unitCost) || unitCost === undefined || unitCost < 0 || unitCost > 1_000_000_000_000) fail('Unit Cost ต้องเป็นตัวเลข THB ตั้งแต่ 0 ขึ้นไป เพื่อไม่ให้ต้นทุน BOQ หาย')
    if (pricingMethod === normalize('Input Price') && (!Number.isFinite(unitPrice) || unitPrice === undefined || unitPrice < 0 || unitPrice > 1_000_000_000_000)) fail('Pricing Method เป็น Input Price แต่ Unit Price ไม่ถูกต้อง')
    else if (![normalize('Input Price'), normalize('Calculated Price')].includes(pricingMethod)) fail(`Pricing Method “${cell(row, 'pricingMethod') || 'ว่าง'}” ไม่รองรับ`)
    if (pricingMethod === normalize('Input Price')) fixedPriceRows += 1
    if (pricingMethod === normalize('Calculated Price')) calculatedPriceRows += 1
    if (unitPrice !== undefined && (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1_000_000_000_000)) fail('Unit Price ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
    if (unitInfo && unitInfo.outputUnitsPerSourceUnit !== 1) convertedUnitRows += 1
    if (cell(row, 'pricePart') || cell(row, 'priceOptions')) pricePartRows += 1
    const taxExempt = normalize(cell(row, 'taxExempt'))
    if (taxExempt && !['n', 'no', 'false', '0', 'y', 'yes', 'true', '1'].includes(taxExempt)) fail('Tax Exempt ใช้ค่า Y/N, yes/no หรือ true/false')
    if (['y', 'yes', 'true', '1'].includes(taxExempt)) taxExemptRows += 1

    const explicitRateKey = cell(row, 'rateKey')
    const candidates = unitInfo ? Object.keys(rates).filter(key => rates[key]?.unit === unitInfo.quantityUnit).sort() : []
    const rateKey = explicitRateKey || rateKeyOverrides[`product:${rowNumber}`] || (candidates.length === 1 ? candidates[0] : '')
    if (!explicitRateKey && !rateKey && candidates.length > 1) rateKeyMappings.push({ record_type: 'product', row_number: rowNumber, product_name: name || `แถว ${rowNumber}`, source_unit: cell(row, 'unit'), candidates })
    if (unitInfo && rateKey && (!rates[rateKey] || rates[rateKey].unit !== unitInfo.quantityUnit)) fail(`CF Rate Key “${rateKey}” ไม่มีใน Price book หรือหน่วยไม่ตรงกับ ${unitInfo.quantityUnit}`)
    else if (unitInfo && !rateKey && !rateKeyMappings.some(mapping => mapping.record_type === 'product' && mapping.row_number === rowNumber)) fail(`ไม่พบ rate key ที่หน่วย ${unitInfo.quantityUnit} · เพิ่มคอลัมน์ CF Rate Key หรือจับคู่จากรายการ`)

    const rawSku = cell(row, 'sku')
    const arcsiteId = cell(row, 'productId')
    const sku = rawSku || (arcsiteId ? `ARC-${arcsiteId}` : `ARC-${cryptoHash(`${category}\u0000${name}`)}`)
    if (!sku || sku.length > 100) fail('SKU หรือ Product ID ยาวเกิน 100 ตัวอักษร')
    const key = `${'arcsite library'}\u0000${sku.trim().toLocaleLowerCase('th-TH')}`
    if (seen.has(key)) fail(`SKU ${sku} ซ้ำในไฟล์`)
    seen.add(key)
    const parseFlag = (value: string, label: string): boolean => {
      const flag = normalize(value)
      if (!flag || ['n', 'no', 'false', '0'].includes(flag)) return false
      if (['y', 'yes', 'true', '1'].includes(flag)) return true
      fail(`${label} ใช้ค่า Y/N, yes/no หรือ true/false`)
      return false
    }
    const hideOnApp = parseFlag(cell(row, 'hideOnApp'), 'Hide on App')
    const hideOnProposal = parseFlag(cell(row, 'hideOnProposal'), 'Hide on Proposals')
    if (!unitInfo || !rateKey || !rates[rateKey] || rates[rateKey].unit !== unitInfo.quantityUnit || !name || !category || !Number.isFinite(unitCost) || unitCost === undefined || unitCost < 0 || (pricingMethod === normalize('Input Price') && (!Number.isFinite(unitPrice) || unitPrice === undefined))) continue
    const previous = existingBySku.get(key)
    const product: LocalSupplierProduct = {
      id: previous?.id ?? crypto.randomUUID(), supplier_name: 'ArcSite Library', supplier_sku: sku.trim(), name,
      category, rate_key: rateKey, unit: unitInfo.quantityUnit, purchase_unit: cell(row, 'unit').trim().slice(0, 40),
      package_quantity: unitInfo.outputUnitsPerSourceUnit, package_price_thb: unitCost!, labor_rate_per_unit: 0,
      ...(pricingMethod === normalize('Input Price') && unitPrice !== undefined ? { input_unit_sell_rate_thb: Number((unitPrice / unitInfo.outputUnitsPerSourceUnit).toFixed(4)) } : {}),
      ...(pricingMethod !== normalize('Input Price') && previous?.input_unit_sell_rate_thb !== undefined ? {} : {}),
      hide_on_app: hideOnApp,
      hide_on_proposal: hideOnProposal,
      ...(cell(row, 'description') ? { notes: `ArcSite: ${cell(row, 'description')}`.slice(0, 1000) } : {}),
      ...(!cell(row, 'description') && previous?.notes ? { notes: previous.notes } : {}),
      created_at: previous?.created_at ?? now, updated_at: now,
    }
    try { validateSupplierProduct(product); products.push(product) }
    catch (error) { fail(error instanceof Error ? error.message : 'ข้อมูลสินค้าไม่ถูกต้อง') }
  }
  if (taxExemptRows) notices.push(`พบ Tax Exempt = Y ใน ${taxExemptRows} แถว · ยังไม่นำเข้าธงนี้ เพราะ ConstructFlow กำหนด VAT ในระดับเอกสาร`)
  if (pricePartRows) notices.push(`พบ Price Part/Price Options ${pricePartRows} รายการ · เป็นฟิลด์ราคาหลายตัวที่ยังไม่ถูกรวมใน preview`)
  if (fixedPriceRows) notices.push(`Pricing Method = Input Price ${fixedPriceRows} แถว · ใช้ Unit Price เป็นราคาขายคงที่ และ Unit Cost เป็นต้นทุนวัสดุ`)
  if (calculatedPriceRows) notices.push(`Pricing Method = Calculated Price ${calculatedPriceRows} แถว · ใช้ Unit Cost และ gross margin เริ่มต้นที่ตั้งไว้ใน ConstructFlow; workbook ไม่ได้ระบุ margin ต่อสินค้า`)
  if (convertedUnitRows) notices.push(`แปลงหน่วยจากไฟล์ ArcSite เป็น m / m² / m³ สำหรับ ${convertedUnitRows} แถว · ตรวจสอบ Rate Key และผลแปลงใน preview ก่อนยืนยัน`)
  const groups = importArcSiteProductGroups(groupRows, [...existing, ...products], existingGroups, notices)
  const groupNames = new Map(existingGroups.map(group => [group.name.trim().toLocaleLowerCase('th-TH'), group.id]))
  for (const group of groups) {
    const name = group.name.trim().toLocaleLowerCase('th-TH')
    const owner = groupNames.get(name)
    if (owner && owner !== group.id) addIssue(`Product Group “${group.name}” ซ้ำกับกลุ่มที่มีอยู่`)
    groupNames.set(name, group.id)
  }
  const allGroups = [...existingGroups.filter(group => !groups.some(item => item.id === group.id)), ...groups]
  const bundles = importArcSiteShapeBundles(bundleRows, [...existing, ...products], allGroups, rates, existingBundles, rateKeyOverrides, rateKeyMappings, notices, addIssue)
  if (!products.length && !groups.length && !bundles.length && !rateKeyMappings.length && !issues.length) addIssue('ไม่พบ Products, Product Groups หรือ Shape Bundles ที่พร้อมนำเข้า')
  return { products: issues.length ? [] : products, groups: issues.length ? [] : groups, bundles: issues.length ? [] : bundles, issues, source_rows: productCount + groupCount + bundleCount, source_format: 'arcsite', notices, rate_key_mappings: rateKeyMappings }
}

function cryptoHash(value: string): string {
  let hashA = 2166136261
  let hashB = 0x9e3779b9
  for (const [index, character] of [...value.normalize('NFKC')].entries()) {
    hashA = Math.imul(hashA ^ character.charCodeAt(0), 16777619)
    hashB = Math.imul(hashB ^ (character.charCodeAt(0) + index), 2246822519)
  }
  return `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`
}

export async function parseSupplierProductSpreadsheet(
  file: File,
  rates: Record<string, ProjectTakeoffRate>,
  existing: LocalSupplierProduct[],
  existingBundles: LocalSupplierProductBundle[] = [],
  rateKeyOverrides: Record<string, string> = {},
  existingGroups: LocalSupplierProductGroup[] = [],
): Promise<SupplierProductSpreadsheetPreview> {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('en-US') ?? ''
  if (file.size > 10_000_000) throw new Error('ไฟล์ spreadsheet ต้องมีขนาดไม่เกิน 10 MB')
  let rows: Row[]
  if (extension === 'csv' || file.type === 'text/csv') {
    const source = await file.text()
    const firstLine = source.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
    rows = parseDelimited(source, detectDelimiter(firstLine))
  } else if (['xlsx', 'xlsm'].includes(extension)) {
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const readSheet = (sheet: (typeof workbook.worksheets)[number] | undefined): Row[] => {
      if (!sheet) return []
      const sheetRows: Row[] = []
      sheet.eachRow({ includeEmpty: false }, row => {
        const values: string[] = []
        row.eachCell({ includeEmpty: true }, (cell, columnNumber) => { values[columnNumber - 1] = cellText(cell.value) })
        sheetRows[row.number - 1] = values
      })
      return sheetRows
    }
    const arcSiteProducts = workbook.worksheets.find(sheet => normalize(sheet.name) === 'products')
    const arcSiteGroups = workbook.worksheets.find(sheet => normalize(sheet.name) === 'productgroups')
    const arcSiteBundles = workbook.worksheets.find(sheet => normalize(sheet.name) === 'bundles')
    if (arcSiteProducts && (arcSiteGroups || arcSiteBundles)) {
      return importArcSiteWorkbook(readSheet(arcSiteProducts), readSheet(arcSiteGroups), readSheet(arcSiteBundles), rates, existing, existingBundles, rateKeyOverrides, existingGroups)
    }
    const sheet = workbook.worksheets[0]
    if (!sheet) return { products: [], issues: ['ไม่พบ worksheet ในไฟล์ Excel'], source_rows: 0 }
    rows = readSheet(sheet)
  } else {
    throw new Error('รองรับไฟล์ .csv, .xlsx และ .xlsm')
  }
  return buildPreview(rows, rates, existing)
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function supplierProductCsvTemplate(rates: Record<string, ProjectTakeoffRate>): string {
  const header = ['Supplier', 'SKU', 'Name', 'Category', 'Rate Key', 'Unit', 'Purchase Unit', 'Package Quantity', 'Package Price THB', 'Labor Rate', 'Gross Margin %', 'Fixed Material Sell Rate THB', 'Hide on App', 'Hide on Proposal', 'Product URL', 'Notes']
  const example = ['ร้านตัวอย่าง', 'MAT-001', 'ตัวอย่างวัสดุ', 'วัสดุ', Object.keys(rates).sort()[0] ?? 'concrete', rates[Object.keys(rates).sort()[0] ?? '']?.unit ?? 'm3', 'ถุง', 1, 0, 0, '', '', '', '', '', '']
  return `\uFEFF${[header, example].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
