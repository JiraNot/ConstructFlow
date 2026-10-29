import type { FieldFormField } from '@constructflow/project-model'

export interface FieldFormSpreadsheetPreview {
  fields: FieldFormField[]
  issues: string[]
  source_rows: number
}

type SpreadsheetRow = string[]
type ColumnName = 'question' | 'type' | 'required' | 'options' | 'group'

const MAX_ROWS = 100
const MAX_ISSUES = 30

function normalizeHeader(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('th-TH').replace(/[\s_.\-/()[\]]+/g, '')
}

const headerAliases: Record<ColumnName, Set<string>> = {
  question: new Set(['question', 'questiontext', 'field', 'fieldlabel', 'label', 'คำถาม', 'ชื่อช่อง', 'ป้ายกำกับ']),
  type: new Set(['type', 'inputtype', 'fieldtype', 'questiontype', 'ชนิด', 'ชนิดข้อมูล', 'ประเภทข้อมูล']),
  required: new Set(['required', 'mandatory', 'จำเป็น', 'บังคับ']),
  options: new Set(['options', 'choices', 'dropdownoptions', 'ตัวเลือก']),
  group: new Set(['group', 'section', 'category', 'กลุ่ม', 'หมวด']),
}

function detectDelimiter(headerLine: string): string {
  let inQuotes = false
  const counts = new Map([[',', 0], [';', 0], ['\t', 0]])
  for (let index = 0; index < headerLine.length; index += 1) {
    const character = headerLine[index]
    if (character === '"') {
      if (inQuotes && headerLine[index + 1] === '"') index += 1
      else inQuotes = !inQuotes
    } else if (!inQuotes && counts.has(character)) counts.set(character, (counts.get(character) ?? 0) + 1)
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? ','
}

function parseDelimitedRows(source: string, delimiter: string): SpreadsheetRow[] {
  const text = source.replace(/^\uFEFF/, '')
  const rows: SpreadsheetRow[] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (quoted || cell.length === 0) quoted = !quoted
      else cell += character
    } else if (!quoted && character === delimiter) {
      row.push(cell); cell = ''
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += character
  }
  if (quoted) throw new Error('ไฟล์ CSV มีเครื่องหมายอัญประกาศที่ปิดไม่ครบ')
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  if (typeof value === 'object') {
    const record = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> }
    if (Array.isArray(record.richText)) return record.richText.map(part => String(part.text ?? '')).join('')
    if (record.text !== undefined) return String(record.text)
    if (record.result !== undefined) return String(record.result)
    return ''
  }
  return String(value).trim()
}

function parseRequired(value: string, rowNumber: number, issues: string[]): boolean {
  const normalized = value.trim().toLocaleLowerCase('th-TH')
  if (!normalized) return false
  if (['yes', 'y', 'true', '1', 'required', 'ใช่', 'จำเป็น', 'บังคับ'].includes(normalized)) return true
  if (['no', 'n', 'false', '0', 'optional', 'ไม่', 'ไม่จำเป็น', 'ไม่บังคับ'].includes(normalized)) return false
  issues.push(`แถว ${rowNumber}: Required ใช้ค่า yes/no, true/false หรือ 1/0`)
  return false
}

function parseInputType(value: string): FieldFormField['input_type'] | null {
  const normalized = normalizeHeader(value)
  if (['text', 'singleline', 'shorttext', 'ข้อความ', 'ข้อความสั้น'].includes(normalized)) return 'text'
  if (['paragraph', 'longtext', 'multiline', 'textarea', 'ข้อความยาว', 'ย่อหน้า'].includes(normalized)) return 'long_text'
  if (['number', 'numeric', 'ตัวเลข', 'จำนวน'].includes(normalized)) return 'number'
  if (['dropdown', 'select', 'choice', 'รายการเลือก', 'ดรอปดาวน์'].includes(normalized)) return 'select'
  if (['switch', 'checkbox', 'boolean', 'yesno', 'toggle', 'ช่องทำเครื่องหมาย', 'สวิตช์'].includes(normalized)) return 'checkbox'
  if (['date', 'วันที่'].includes(normalized)) return 'date'
  if (['section', 'header', 'sectionheader', 'groupheader', 'หัวข้อ', 'หมวด', 'ส่วน'].includes(normalized)) return 'section'
  return null
}

function buildPreview(rows: SpreadsheetRow[]): FieldFormSpreadsheetPreview {
  const issues: string[] = []
  const fields: FieldFormField[] = []
  const appendIssue = (message: string) => { if (issues.length < MAX_ISSUES) issues.push(message) }
  if (rows.length - 1 > MAX_ROWS) return { fields, issues: ['นำเข้าได้ไม่เกิน 100 แถวต่อแม่แบบ'], source_rows: rows.length - 1 }
  const header = rows[0] ?? []
  const columns = new Map<ColumnName, number>()
  header.forEach((value, index) => {
    const normalized = normalizeHeader(value)
    const match = (Object.keys(headerAliases) as ColumnName[]).find(name => headerAliases[name].has(normalized))
    if (!match) return
    if (columns.has(match)) appendIssue(`หัวตารางมีคอลัมน์ ${match} ซ้ำ`)
    else columns.set(match, index)
  })
  if (!columns.has('question')) appendIssue('ไม่พบคอลัมน์ Question หรือ ชื่อช่อง')
  if (!columns.has('type')) appendIssue('ไม่พบคอลัมน์ Type หรือ ชนิดข้อมูล')
  if (issues.length) return { fields, issues, source_rows: Math.max(0, rows.length - 1) }

  const columnValue = (row: SpreadsheetRow, name: ColumnName) => row[columns.get(name) ?? -1]?.trim() ?? ''
  let previousGroup = ''
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    if (row.every(value => !value.trim())) continue
    const rowNumber = index + 1
    const label = columnValue(row, 'question')
    const rawType = columnValue(row, 'type')
    if (!label) { appendIssue(`แถว ${rowNumber}: Question ห้ามเว้นว่าง`); continue }
    if (label.length > 200) { appendIssue(`แถว ${rowNumber}: Question ยาวเกิน 200 ตัวอักษร`); continue }
    const inputType = parseInputType(rawType)
    if (!inputType) { appendIssue(`แถว ${rowNumber}: ไม่รู้จัก Type “${rawType || 'ว่าง'}”`); continue }
    const group = inputType === 'section' ? '' : columnValue(row, 'group')
    if (group && group !== previousGroup) fields.push({ id: `section_${crypto.randomUUID()}`, label: group, input_type: 'section', required: false })
    previousGroup = group
    if (inputType === 'section') {
      if (columnValue(row, 'required').trim()) appendIssue(`แถว ${rowNumber}: Section ไม่รองรับ Required`)
      if (columnValue(row, 'options').trim()) appendIssue(`แถว ${rowNumber}: Section ไม่รองรับ Options`)
      fields.push({ id: `section_${crypto.randomUUID()}`, label, input_type: 'section', required: false })
      previousGroup = label
      continue
    }
    const required = parseRequired(columnValue(row, 'required'), rowNumber, issues)
    const options = inputType === 'select' ? columnValue(row, 'options').split(',').map(option => option.trim()).filter(Boolean) : undefined
    if (inputType === 'select' && !options?.length) appendIssue(`แถว ${rowNumber}: Dropdown ต้องมี Options คั่นด้วยเครื่องหมายจุลภาค`)
    if (options && (new Set(options).size !== options.length || options.length > 100 || options.some(option => option.length > 200))) appendIssue(`แถว ${rowNumber}: Options ซ้ำหรือเกินขนาดที่รองรับ`)
    if (inputType !== 'select' && columnValue(row, 'options').trim()) appendIssue(`แถว ${rowNumber}: Options ใช้ได้เฉพาะ Type dropdown`)
    fields.push({ id: `field_${crypto.randomUUID()}`, label, input_type: inputType, required, ...(options ? { options } : {}) })
  }
  if (!fields.length && !issues.length) appendIssue('ไม่พบคำถามใน spreadsheet')
  if (fields.length > MAX_ROWS) appendIssue(`Spreadsheet สร้าง ${fields.length} ช่อง ซึ่งเกินขีดจำกัด ${MAX_ROWS} ช่องต่อแม่แบบ`)
  return { fields: issues.length ? [] : fields, issues, source_rows: Math.max(0, rows.length - 1) }
}

export async function parseFieldFormSpreadsheet(file: File): Promise<FieldFormSpreadsheetPreview> {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('en-US') ?? ''
  if (file.size > 10_000_000) throw new Error('ไฟล์ spreadsheet ต้องมีขนาดไม่เกิน 10 MB')
  let rows: SpreadsheetRow[]
  if (extension === 'csv' || file.type === 'text/csv') {
    const source = await file.text()
    const headerLine = source.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
    rows = parseDelimitedRows(source, detectDelimiter(headerLine))
  } else if (['xlsx', 'xlsm'].includes(extension)) {
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const sheet = workbook.worksheets[0]
    if (!sheet) return { fields: [], issues: ['ไม่พบ worksheet ในไฟล์ Excel'], source_rows: 0 }
    rows = []
    sheet.eachRow({ includeEmpty: false }, row => {
      const values: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => { values[columnNumber - 1] = cellText(cell.value) })
      rows[row.number - 1] = values
    })
  } else {
    throw new Error('รองรับไฟล์ .csv, .xlsx และ .xlsm')
  }
  return buildPreview(rows)
}

export function fieldFormCsvTemplate(): string {
  return '\uFEFFQuestion,Type,Required,Options,Group\r\n"ผู้ตรวจหน้างาน",text,yes,,"ข้อมูลการตรวจ"\r\n"วันที่เข้าตรวจ",date,yes,,"ข้อมูลการตรวจ"\r\n"ผลตรวจ",dropdown,yes,"ผ่าน,แก้ไข,ไม่ผ่าน","ผลการตรวจ"\r\n"รายละเอียด",paragraph,no,,"ผลการตรวจ"\r\n"ดำเนินการแล้ว",switch,no,,"ติดตามงาน"\r\n'
}
