import { FIELD_FORM_TEMPLATES, serializeProject, validateFieldFormTemplate, validateProjectTakeoffRates, validateProposalConditionalTextRule, type FieldFormTemplate, type ProjectDocument, type ProjectTakeoffRate, type ProposalConditionalTextRule } from '@constructflow/project-model'
import type { ProjectCommandTransaction } from '@constructflow/command-schema'
import {
  DEFAULT_SUPPLIER_PRODUCT_PRICING_SETTINGS, validateSupplierProduct, validateSupplierProductBundle, validateSupplierProductGroup, validateSupplierProductGroupProducts, validateSupplierProductPricingSettings,
  type SupplierProduct, type SupplierProductBundle, type SupplierProductGroup, type SupplierProductPricingSettings,
} from '@constructflow/takeoff-engine'
import type { LocalProjectFileHandle } from './projectFileIO.js'

const DATABASE_NAME = 'constructflow-local-projects'
const DATABASE_VERSION = 15
const STORE_NAME = 'snapshots'
const PROJECT_LIBRARY_STORE_NAME = 'project-library'
const REVISION_STORE_NAME = 'revisions'
const TAKEOFF_PRICE_BOOK_STORE_NAME = 'takeoff-price-books'
const FIELD_PHOTO_ASSET_STORE_NAME = 'field-photo-assets'
const FIELD_FORM_TEMPLATE_STORE_NAME = 'field-form-templates'
const PROPOSAL_TEMPLATE_STORE_NAME = 'proposal-templates'
const SUPPLIER_PRODUCT_STORE_NAME = 'supplier-products'
const SUPPLIER_PRODUCT_BUNDLE_STORE_NAME = 'supplier-product-bundles'
const SUPPLIER_PRODUCT_GROUP_STORE_NAME = 'supplier-product-groups'
const COMPANY_PRICING_SETTINGS_STORE_NAME = 'company-pricing-settings'
const DISCOUNT_RULE_STORE_NAME = 'discount-rules'
const SUPPLIER_CATEGORY_ORDER_STORE_NAME = 'supplier-category-order'
const INTEGRATION_ACTIVITY_STORE_NAME = 'integration-activity'
const INTEGRATION_SETTINGS_STORE_NAME = 'integration-settings'
const ACTIVE_PROJECT_KEY = 'active-project'
const ACTIVE_PROJECT_POINTER_KIND = 'constructflow-active-project-pointer'
const LOCAL_DEVICE_ID_KEY = 'local-device-id'
const PROJECT_REVISION_BUNDLE_FORMAT = 'constructflow.project-revisions'
const COMPANY_LIBRARY_BUNDLE_FORMAT = 'constructflow.company-library'
const MAX_REVISION_BUNDLE_BYTES = 100_000_000
const MAX_REVISION_BUNDLE_ITEMS = 500
const MAX_SUPPLIER_LIBRARY_CATEGORIES = 1500
export const LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT = 'constructflow:collaboration-token-changed'
export const LOCAL_FIELD_PHOTO_ASSETS_CHANGED_EVENT = 'constructflow:field-photo-assets-changed'
export const LOCAL_PROJECT_REVISIONS_CHANGED_EVENT = 'constructflow:project-revisions-changed'

export function notifyLocalFieldPhotoAssetsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_FIELD_PHOTO_ASSETS_CHANGED_EVENT))
}

function notifyCollaborationTokenChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT))
}

function notifyLocalProjectRevisionsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_PROJECT_REVISIONS_CHANGED_EVENT))
}

export interface LocalProjectRevision {
  id: string
  project_id: string
  label: string
  project_json: string
  created_at: string
  object_count: number
  level_count: number
  phase_counts: Record<string, number>
  /** Device that first supplied this revision during a portable history transfer. */
  origin_device_id?: string
  /** Source revision UUID when this snapshot was preserved after an ID collision. */
  source_revision_id?: string
  /** Revision UUIDs with different snapshots that share this revision's source identity. */
  conflict_with_revision_ids?: string[]
}

export interface LocalProjectRevisionBundle {
  format: typeof PROJECT_REVISION_BUNDLE_FORMAT
  schema_version: 1
  project_id: string
  source_device_id: string
  exported_at: string
  revisions: LocalProjectRevision[]
}

export interface LocalProjectRevisionImportResult {
  imported: number
  deduplicated: number
  conflicts: number
  revision_ids: string[]
}

export interface LocalIntegrationActivity {
  id: string
  project_id: string
  connector_id: 'sketchup' | 'autocad-dxf' | 'openbim-ifc' | 'zapier' | 'webhook'
  status: 'pending' | 'dispatched' | 'succeeded' | 'failed'
  artifact_name: string
  message: string
  created_at: string
  /** Stable idempotency key retained when the same outbound event is retried. */
  event_id?: string
  /** Frozen form payload used for retries; kept only in this device's IndexedDB. */
  payload_json?: string
  /** Secret Catch Hook URL is local-only and removed when the connection is disconnected. */
  target_url?: string
}

export interface LocalZapierWebhookSettings {
  id: 'zapier'
  url: string
  updated_at: string
}

export interface LocalCustomWebhookSettings {
  id: 'custom-webhook'
  url: string
  signing_secret: string
  updated_at: string
}

export interface LocalCollaborationSettings {
  id: 'collaboration'
  token: string
  updated_at: string
}

export interface LocalProjectCommandSyncState {
  project_id: string
  cursor: number | null
  joined: boolean
  pending: ProjectCommandTransaction[]
  project_fingerprint?: string
  baseline_expected_fingerprint?: string
  joined_head?: number
  blocked_reason?: string
  updated_at: string
}

/** Reusable local commercial rates, independent from BIM type definitions and individual projects. */
export interface LocalTakeoffPriceBook {
  id: string
  name: string
  rates: Record<string, ProjectTakeoffRate>
  created_at: string
  updated_at: string
}

/** Reusable proposal boilerplate saved locally, independent from project-specific quote snapshots. */
export interface LocalProposalTemplate {
  id: string
  name: string
  notes: string
  terms: string
  validity_days: number
  conditional_text_rules?: ProposalConditionalTextRule[]
  created_at: string
  updated_at: string
}

/** Reusable, fixed-percentage proposal discount shared through the Company Library. */
export interface LocalDiscountRule {
  id: string
  name: string
  discount_percent: number
  notes: string
  created_at: string
  updated_at: string
}

/** Company-owned reusable field questions; project records snapshot the definition when created. */
export interface LocalFieldFormTemplate extends FieldFormTemplate {
  created_at: string
  updated_at: string
}

export type LocalSupplierProduct = SupplierProduct
export type LocalSupplierProductBundle = SupplierProductBundle
export type LocalSupplierProductGroup = SupplierProductGroup

/** Portable snapshot of the independent commercial libraries; it contains no project model or customer data. */
export interface LocalCompanyLibraryBundle {
  format: typeof COMPANY_LIBRARY_BUNDLE_FORMAT
  schema_version: 1 | 2 | 3 | 4 | 5 | 6 | 7
  currency: 'THB'
  exported_at: string
  pricing_settings?: SupplierProductPricingSettings
  pricing_settings_updated_at?: string
  price_books: LocalTakeoffPriceBook[]
  proposal_templates: LocalProposalTemplate[]
  /** Required in schema 5; absent in legacy bundles. */
  discount_rules?: LocalDiscountRule[]
  field_form_templates?: LocalFieldFormTemplate[]
  /** Required in schema 6; one shared order for supplier products and bundles. */
  supplier_category_order?: string[]
  supplier_category_order_updated_at?: string
  supplier_products: LocalSupplierProduct[]
  supplier_product_groups: LocalSupplierProductGroup[]
  supplier_product_bundles: LocalSupplierProductBundle[]
}

export interface LocalCompanyLibraryImportResult {
  price_books: number
  proposal_templates: number
  discount_rules: number
  field_form_templates: number
  supplier_products: number
  supplier_product_groups: number
  supplier_product_bundles: number
}

const COMPANY_PRICING_SETTINGS_KEY = 'default'
const SUPPLIER_CATEGORY_ORDER_KEY = 'default'

export interface LocalSupplierLibraryCategoryOrder {
  id: 'default'
  categories: string[]
  updated_at?: string
}

interface LocalFieldPhotoAssetRecord {
  storage_id: string
  project_id: string
  asset_id: string
  data_url: string
}

export interface LocalProjectSnapshot {
  projectJson: string
  savedProjectJson: string | null
  replacementBaselineJson: string | null
  fileHandle?: LocalProjectFileHandle | null
  savedAt: number
}

export interface LocalProjectLibraryEntry {
  project_id: string
  name: string
  updated_at: string
  saved_at: number
  object_count: number
  level_count: number
  archived: boolean
  tags: string[]
}

interface ActiveProjectPointer {
  kind: typeof ACTIVE_PROJECT_POINTER_KIND
  project_id: string
}

export interface LoadedLocalProjectSnapshot extends LocalProjectSnapshot {
  /** The validated parsed document, reused by the editor instead of parsing the same JSON twice. */
  project: ProjectDocument
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('เบราว์เซอร์นี้ไม่รองรับ IndexedDB'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
      if (!database.objectStoreNames.contains(PROJECT_LIBRARY_STORE_NAME)) database.createObjectStore(PROJECT_LIBRARY_STORE_NAME)
      if (!database.objectStoreNames.contains(REVISION_STORE_NAME)) database.createObjectStore(REVISION_STORE_NAME)
      if (!database.objectStoreNames.contains(TAKEOFF_PRICE_BOOK_STORE_NAME)) database.createObjectStore(TAKEOFF_PRICE_BOOK_STORE_NAME)
      if (!database.objectStoreNames.contains(FIELD_PHOTO_ASSET_STORE_NAME)) database.createObjectStore(FIELD_PHOTO_ASSET_STORE_NAME)
      if (!database.objectStoreNames.contains(FIELD_FORM_TEMPLATE_STORE_NAME)) database.createObjectStore(FIELD_FORM_TEMPLATE_STORE_NAME)
      if (!database.objectStoreNames.contains(PROPOSAL_TEMPLATE_STORE_NAME)) database.createObjectStore(PROPOSAL_TEMPLATE_STORE_NAME)
      if (!database.objectStoreNames.contains(SUPPLIER_PRODUCT_STORE_NAME)) database.createObjectStore(SUPPLIER_PRODUCT_STORE_NAME)
      if (!database.objectStoreNames.contains(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME)) database.createObjectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME)
      if (!database.objectStoreNames.contains(SUPPLIER_PRODUCT_GROUP_STORE_NAME)) database.createObjectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME)
      if (!database.objectStoreNames.contains(COMPANY_PRICING_SETTINGS_STORE_NAME)) database.createObjectStore(COMPANY_PRICING_SETTINGS_STORE_NAME)
      if (!database.objectStoreNames.contains(DISCOUNT_RULE_STORE_NAME)) database.createObjectStore(DISCOUNT_RULE_STORE_NAME)
      if (!database.objectStoreNames.contains(SUPPLIER_CATEGORY_ORDER_STORE_NAME)) database.createObjectStore(SUPPLIER_CATEGORY_ORDER_STORE_NAME)
      if (!database.objectStoreNames.contains(INTEGRATION_ACTIVITY_STORE_NAME)) database.createObjectStore(INTEGRATION_ACTIVITY_STORE_NAME)
      if (!database.objectStoreNames.contains(INTEGRATION_SETTINGS_STORE_NAME)) database.createObjectStore(INTEGRATION_SETTINGS_STORE_NAME)
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('เปิดพื้นที่บันทึกในเครื่องไม่สำเร็จ'))
    request.onblocked = () => reject(new Error('พื้นที่บันทึกในเครื่องกำลังถูกใช้งานจากแท็บอื่น'))
  })
}

export async function listLocalFieldPhotoAssets(projectId: string): Promise<Record<string, string>> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FIELD_PHOTO_ASSET_STORE_NAME, 'readonly')
    const request = transaction.objectStore(FIELD_PHOTO_ASSET_STORE_NAME).getAll()
    request.onsuccess = () => {
      const assets = (request.result as LocalFieldPhotoAssetRecord[]).filter(record => record.project_id === projectId)
      if (assets.some(asset => !asset.asset_id || typeof asset.data_url !== 'string' || !asset.data_url.startsWith('data:image/'))) {
        reject(new Error('พบไฟล์ภาพหน้างานที่เสียหาย'))
        return
      }
      resolve(Object.fromEntries(assets.map(asset => [asset.asset_id, asset.data_url])))
    }
    request.onerror = () => reject(request.error ?? new Error('อ่านรูปถ่ายหน้างานไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่านรูปถ่ายหน้างานไม่สำเร็จ')) }
  })
}

/** Add project-scoped field photos to a portable .cfproj without changing the canonical BIM model. */
export async function createPortableProjectFileContents(projectJson: string, projectId: string): Promise<{ contents: string; bundledPhotoCount: number; missingPhotoCount: number }> {
  const project = JSON.parse(projectJson) as ProjectDocument
  const inspections = project.field_photo_inspections ?? []
  if (!inspections.length) return { contents: projectJson, bundledPhotoCount: 0, missingPhotoCount: 0 }

  const storedAssets = await listLocalFieldPhotoAssets(projectId)
  const referencedIds = inspections.map(inspection => inspection.image_asset_id)
  const bundledAssets: Record<string, string> = {}
  let totalImageChars = 0
  for (const assetId of referencedIds) {
    const dataUrl = storedAssets[assetId]
    if (!dataUrl) continue
    if (!dataUrl.startsWith('data:image/') || dataUrl.length > 28_000_000) throw new Error(`ไฟล์ภาพ ${assetId} มีรูปแบบหรือขนาดที่ไม่รองรับ`)
    totalImageChars += dataUrl.length
    if (totalImageChars > 80_000_000) throw new Error('รูปถ่ายที่แนบในไฟล์โครงการมีขนาดรวมเกินประมาณ 60 MB')
    bundledAssets[assetId] = dataUrl
  }

  const portableProject = {
    ...project,
    _constructflow_media_bundle: {
      schema_version: 1,
      field_photo_assets: bundledAssets,
    },
  }
  return {
    contents: JSON.stringify(portableProject, null, 2),
    bundledPhotoCount: Object.keys(bundledAssets).length,
    missingPhotoCount: referencedIds.length - Object.keys(bundledAssets).length,
  }
}

export async function saveLocalFieldPhotoAssets(projectId: string, assets: Array<{ asset_id: string; data_url: string }>): Promise<void> {
  if (!projectId.trim() || projectId.length > 100 || !Array.isArray(assets) || assets.length > 200) throw new Error('รายการไฟล์ภาพหน้างานไม่ถูกต้อง')
  const ids = new Set<string>()
  let totalImageChars = 0
  for (const asset of assets) {
    if (!asset || typeof asset.asset_id !== 'string' || !asset.asset_id.trim() || ids.has(asset.asset_id)) throw new Error('พบ ID ไฟล์ภาพว่างหรือซ้ำ')
    if (typeof asset.data_url !== 'string' || !asset.data_url.startsWith('data:image/') || asset.data_url.length > 28_000_000) throw new Error(`ไฟล์ภาพ ${asset.asset_id} ต้องมีขนาดไม่เกินประมาณ 20 MB`)
    ids.add(asset.asset_id)
    totalImageChars += asset.data_url.length
  }
  if (totalImageChars > 80_000_000) throw new Error('ภาพหน้างานรวมกันมีขนาดเกินพื้นที่ที่รองรับต่อโครงการ')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FIELD_PHOTO_ASSET_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(FIELD_PHOTO_ASSET_STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => {
      const existing = (request.result as LocalFieldPhotoAssetRecord[]).filter(record => record.project_id === projectId)
      let totalImageChars = existing.reduce((total, asset) => total + asset.data_url.length, 0)
      for (const asset of assets) {
        const previous = existing.find(item => item.asset_id === asset.asset_id)
        if (previous) totalImageChars -= previous.data_url.length
        totalImageChars += asset.data_url.length
      }
      if (totalImageChars > 80_000_000) {
        transaction.abort()
        reject(new Error('รูปถ่ายโครงการนี้มีขนาดรวมเกินประมาณ 60 MB ที่รองรับในอุปกรณ์นี้'))
        return
      }
      for (const asset of assets) {
        const record: LocalFieldPhotoAssetRecord = { storage_id: `${projectId}:${asset.asset_id}`, project_id: projectId, ...structuredClone(asset) }
        store.put(record, record.storage_id)
      }
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึกรูปถ่ายหน้างานไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึกรูปถ่ายหน้างานถูกยกเลิก')) }
  })
}

export async function deleteLocalFieldPhotoAssets(projectId: string, assetIds: string[]): Promise<void> {
  if (!projectId.trim() || projectId.length > 100 || !Array.isArray(assetIds) || assetIds.length > 200) throw new Error('รายการไฟล์ภาพหน้างานสำหรับลบไม่ถูกต้อง')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FIELD_PHOTO_ASSET_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(FIELD_PHOTO_ASSET_STORE_NAME)
    for (const assetId of assetIds) store.delete(`${projectId}:${assetId}`)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('ลบไฟล์ภาพหน้างานไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('ลบไฟล์ภาพหน้างานถูกยกเลิก')) }
  })
}

export async function listLocalTakeoffPriceBooks(): Promise<LocalTakeoffPriceBook[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TAKEOFF_PRICE_BOOK_STORE_NAME, 'readonly')
    const request = transaction.objectStore(TAKEOFF_PRICE_BOOK_STORE_NAME).getAll()
    request.onsuccess = () => resolve((request.result as LocalTakeoffPriceBook[])
      .sort((a, b) => a.name.localeCompare(b.name, 'th-TH')))
    request.onerror = () => reject(request.error ?? new Error('อ่าน Library ราคาในเครื่องไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่าน Library ราคาในเครื่องไม่สำเร็จ')) }
  })
}

export async function saveLocalTakeoffPriceBook(input: { id?: string; name: string; rates: Record<string, ProjectTakeoffRate> }): Promise<LocalTakeoffPriceBook> {
  const name = input.name.trim().slice(0, 100)
  if (!name) throw new Error('ตั้งชื่อ Library ราคาก่อนบันทึก')
  validateProjectTakeoffRates(input.rates)
  const id = input.id || crypto.randomUUID()
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TAKEOFF_PRICE_BOOK_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(TAKEOFF_PRICE_BOOK_STORE_NAME)
    const request = store.get(id)
    let saved: LocalTakeoffPriceBook | undefined
    request.onsuccess = () => {
      const previous = request.result as LocalTakeoffPriceBook | undefined
      if (input.id && !previous) {
        transaction.abort()
        reject(new Error('ไม่พบ Library ราคาที่ต้องการอัปเดต'))
        return
      }
      const allRequest = store.getAll()
      allRequest.onsuccess = () => {
        const books = allRequest.result as LocalTakeoffPriceBook[]
        const duplicate = books.find(book => book.id !== id && book.name.toLocaleLowerCase('th-TH') === name.toLocaleLowerCase('th-TH'))
        if (duplicate) {
          transaction.abort()
          reject(new Error(`มีชุดราคา “${duplicate.name}” อยู่แล้ว · เลือกชุดนั้นเพื่ออัปเดต`))
          return
        }
        if (!previous && books.length >= 100) {
          transaction.abort()
          reject(new Error('Library ราคาในเครื่องมีได้สูงสุด 100 ชุด'))
          return
        }
        const now = new Date().toISOString()
        saved = previous
          ? { ...previous, name, rates: structuredClone(input.rates), updated_at: now }
          : { id, name, rates: structuredClone(input.rates), created_at: now, updated_at: now }
        store.put(saved, id)
      }
      allRequest.onerror = () => transaction.abort()
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); saved ? resolve(saved) : reject(new Error('บันทึก Library ราคาในเครื่องไม่สำเร็จ')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึก Library ราคาในเครื่องไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึก Library ราคาในเครื่องถูกยกเลิก')) }
  })
}

export async function deleteLocalTakeoffPriceBook(id: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TAKEOFF_PRICE_BOOK_STORE_NAME, 'readwrite')
    transaction.objectStore(TAKEOFF_PRICE_BOOK_STORE_NAME).delete(id)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('ลบ Library ราคาในเครื่องไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('ลบ Library ราคาในเครื่องถูกยกเลิก')) }
  })
}

export async function listLocalProposalTemplates(): Promise<LocalProposalTemplate[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROPOSAL_TEMPLATE_STORE_NAME, 'readonly')
    const request = transaction.objectStore(PROPOSAL_TEMPLATE_STORE_NAME).getAll()
    request.onsuccess = () => resolve((request.result as LocalProposalTemplate[])
      .sort((a, b) => a.name.localeCompare(b.name, 'th-TH')))
    request.onerror = () => reject(request.error ?? new Error('อ่านแม่แบบข้อเสนอไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่านแม่แบบข้อเสนอไม่สำเร็จ')) }
  })
}

export async function saveLocalProposalTemplate(input: {
  id?: string
  name: string
  notes: string
  terms: string
  validity_days: number
  conditional_text_rules?: ProposalConditionalTextRule[]
}): Promise<LocalProposalTemplate> {
  const name = input.name.trim().slice(0, 80)
  if (!name) throw new Error('ตั้งชื่อแม่แบบก่อนบันทึก')
  if (typeof input.notes !== 'string' || input.notes.length > 4000 || typeof input.terms !== 'string' || input.terms.length > 4000) {
    throw new Error('หมายเหตุหรือเงื่อนไขของแม่แบบยาวเกินกำหนด')
  }
  if (!Number.isInteger(input.validity_days) || input.validity_days < 1 || input.validity_days > 365) {
    throw new Error('อายุข้อเสนอในแม่แบบต้องอยู่ระหว่าง 1 ถึง 365 วัน')
  }
  if (input.conditional_text_rules !== undefined) {
    if (!Array.isArray(input.conditional_text_rules) || input.conditional_text_rules.length > 100) throw new Error('แม่แบบมีข้อความแบบมีเงื่อนไขได้ไม่เกิน 100 รายการ')
    input.conditional_text_rules.forEach(validateProposalConditionalTextRule)
    if (new Set(input.conditional_text_rules.map(rule => rule.id)).size !== input.conditional_text_rules.length) throw new Error('UUID ของข้อความแบบมีเงื่อนไขในแม่แบบต้องไม่ซ้ำกัน')
  }
  const id = input.id || crypto.randomUUID()
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROPOSAL_TEMPLATE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(PROPOSAL_TEMPLATE_STORE_NAME)
    const request = store.getAll()
    let saved: LocalProposalTemplate | undefined
    request.onsuccess = () => {
      const templates = request.result as LocalProposalTemplate[]
      const existing = templates.find(template => template.id === id)
      if (input.id && !existing) {
        transaction.abort()
        reject(new Error('ไม่พบแม่แบบข้อเสนอที่ต้องการอัปเดต'))
        return
      }
      const duplicate = templates.find(template => template.id !== id && template.name.toLocaleLowerCase('th-TH') === name.toLocaleLowerCase('th-TH'))
      if (duplicate) {
        transaction.abort()
        reject(new Error(`มีแม่แบบชื่อ “${duplicate.name}” อยู่แล้ว`))
        return
      }
      if (!existing && templates.length >= 100) {
        transaction.abort()
        reject(new Error('บันทึกแม่แบบในอุปกรณ์นี้ได้สูงสุด 100 รายการ'))
        return
      }
      const now = new Date().toISOString()
      saved = existing
        ? { ...existing, name, notes: input.notes, terms: input.terms, validity_days: input.validity_days,
          ...(input.conditional_text_rules !== undefined ? { conditional_text_rules: structuredClone(input.conditional_text_rules) } : {}), updated_at: now }
        : { id, name, notes: input.notes, terms: input.terms, validity_days: input.validity_days,
          conditional_text_rules: structuredClone(input.conditional_text_rules ?? []), created_at: now, updated_at: now }
      store.put(saved, id)
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); saved ? resolve(saved) : reject(new Error('บันทึกแม่แบบข้อเสนอไม่สำเร็จ')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึกแม่แบบข้อเสนอไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึกแม่แบบข้อเสนอถูกยกเลิก')) }
  })
}

export async function listLocalFieldFormTemplates(): Promise<LocalFieldFormTemplate[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FIELD_FORM_TEMPLATE_STORE_NAME, 'readonly')
    const request = transaction.objectStore(FIELD_FORM_TEMPLATE_STORE_NAME).getAll()
    request.onsuccess = () => resolve((request.result as LocalFieldFormTemplate[]).sort((a, b) => a.title.localeCompare(b.title, 'th-TH')))
    request.onerror = () => reject(request.error ?? new Error('อ่าน Library แบบฟอร์มไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่าน Library แบบฟอร์มไม่สำเร็จ')) }
  })
}

export async function saveLocalFieldFormTemplate(input: FieldFormTemplate): Promise<LocalFieldFormTemplate> {
  validateFieldFormTemplate(input)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) throw new Error('แม่แบบฟอร์มที่สร้างใน Company Library ต้องใช้ UUID')
  if (FIELD_FORM_TEMPLATES.some(template => template.id === input.id || template.title.trim().toLocaleLowerCase('th-TH') === input.title.trim().toLocaleLowerCase('th-TH'))) throw new Error('ชื่อหรือ UUID แม่แบบฟอร์มซ้ำกับแบบฟอร์มเริ่มต้น')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FIELD_FORM_TEMPLATE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(FIELD_FORM_TEMPLATE_STORE_NAME)
    const request = store.getAll()
    let saved: LocalFieldFormTemplate | undefined
    request.onsuccess = () => {
      const templates = request.result as LocalFieldFormTemplate[]
      const existing = templates.find(template => template.id === input.id)
      const duplicate = templates.find(template => template.id !== input.id && template.title.trim().toLocaleLowerCase('th-TH') === input.title.trim().toLocaleLowerCase('th-TH'))
      if (duplicate) {
        transaction.abort()
        reject(new Error(`มีแม่แบบฟอร์มชื่อ “${duplicate.title}” อยู่แล้ว`))
        return
      }
      if (!existing && templates.length >= 100) {
        transaction.abort()
        reject(new Error('บันทึกแม่แบบฟอร์มในอุปกรณ์นี้ได้สูงสุด 100 รายการ'))
        return
      }
      const now = new Date().toISOString()
      saved = { ...structuredClone(input), created_at: existing?.created_at ?? now, updated_at: now }
      store.put(saved, saved.id)
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); saved ? resolve(saved) : reject(new Error('บันทึกแม่แบบฟอร์มไม่สำเร็จ')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึกแม่แบบฟอร์มไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึกแม่แบบฟอร์มถูกยกเลิก')) }
  })
}

export async function deleteLocalFieldFormTemplate(id: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FIELD_FORM_TEMPLATE_STORE_NAME, 'readwrite')
    transaction.objectStore(FIELD_FORM_TEMPLATE_STORE_NAME).delete(id)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('ลบแม่แบบฟอร์มไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('ลบแม่แบบฟอร์มถูกยกเลิก')) }
  })
}

export async function getLocalCompanyPricingSettings(): Promise<SupplierProductPricingSettings> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(COMPANY_PRICING_SETTINGS_STORE_NAME, 'readonly')
    const request = transaction.objectStore(COMPANY_PRICING_SETTINGS_STORE_NAME).get(COMPANY_PRICING_SETTINGS_KEY)
    request.onsuccess = () => {
      const stored = request.result ?? DEFAULT_SUPPLIER_PRODUCT_PRICING_SETTINGS
      const settings = {
        default_gross_margin_percent: stored.default_gross_margin_percent,
        minimum_gross_margin_percent: stored.minimum_gross_margin_percent,
      }
      try { validateSupplierProductPricingSettings(settings); resolve(structuredClone(settings)) }
      catch (error) { reject(error) }
    }
    request.onerror = () => reject(request.error ?? new Error('อ่าน Company pricing settings ไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่าน Company pricing settings ไม่สำเร็จ')) }
  })
}

export async function saveLocalCompanyPricingSettings(settings: SupplierProductPricingSettings): Promise<SupplierProductPricingSettings> {
  validateSupplierProductPricingSettings(settings)
  const saved = structuredClone(settings)
  const stored = { ...saved, updated_at: new Date().toISOString() }
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(COMPANY_PRICING_SETTINGS_STORE_NAME, 'readwrite')
    transaction.objectStore(COMPANY_PRICING_SETTINGS_STORE_NAME).put(stored, COMPANY_PRICING_SETTINGS_KEY)
    transaction.oncomplete = () => { database.close(); resolve(saved) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึก Company pricing settings ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึก Company pricing settings ถูกยกเลิก')) }
  })
}

function normalizeSupplierLibraryCategoryOrder(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_SUPPLIER_LIBRARY_CATEGORIES) throw new Error(`ลำดับหมวด Supplier Library ต้องมีไม่เกิน ${MAX_SUPPLIER_LIBRARY_CATEGORIES.toLocaleString('th-TH')} หมวด`)
  const names: string[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (typeof candidate !== 'string') throw new Error('ชื่อหมวด Supplier Library ไม่ถูกต้อง')
    const name = candidate.trim()
    const key = name.toLocaleLowerCase('th-TH')
    if (!name || name.length > 80 || key === 'ทุกหมวด') throw new Error('ชื่อหมวด Supplier Library ต้องมี 1 ถึง 80 ตัวอักษร')
    if (seen.has(key)) throw new Error(`ลำดับหมวดมีชื่อ “${name}” ซ้ำ`)
    seen.add(key)
    names.push(name)
  }
  return names
}

/** Keep user-defined order first and append new labels alphabetically. */
export function orderSupplierLibraryCategoryNames(categories: string[], preferredOrder: string[] = []): string[] {
  const byKey = new Map<string, string>()
  for (const value of categories) {
    const name = value.trim() || 'ทั่วไป'
    const key = name.toLocaleLowerCase('th-TH')
    if (!byKey.has(key)) byKey.set(key, name)
  }
  const preferred = new Map(preferredOrder.map((name, index) => [name.trim().toLocaleLowerCase('th-TH'), index]))
  return [...byKey.values()].sort((left, right) => {
    const leftIndex = preferred.get(left.toLocaleLowerCase('th-TH'))
    const rightIndex = preferred.get(right.toLocaleLowerCase('th-TH'))
    if (leftIndex !== undefined || rightIndex !== undefined) {
      if (leftIndex === undefined) return 1
      if (rightIndex === undefined) return -1
      if (leftIndex !== rightIndex) return leftIndex - rightIndex
    }
    return left.localeCompare(right, 'th-TH')
  })
}

export async function getLocalSupplierLibraryCategoryOrder(): Promise<LocalSupplierLibraryCategoryOrder> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SUPPLIER_CATEGORY_ORDER_STORE_NAME, 'readonly')
    const request = transaction.objectStore(SUPPLIER_CATEGORY_ORDER_STORE_NAME).get(SUPPLIER_CATEGORY_ORDER_KEY)
    request.onsuccess = () => {
      const stored = request.result as LocalSupplierLibraryCategoryOrder | undefined
      try {
        if (!stored) { resolve({ id: 'default', categories: [] }); return }
        const categories = normalizeSupplierLibraryCategoryOrder(stored.categories)
        if (stored.updated_at !== undefined && !validIsoTimestamp(stored.updated_at)) throw new Error('วันเวลาแก้ไขลำดับหมวดไม่ถูกต้อง')
        resolve({ id: 'default', categories, ...(stored.updated_at ? { updated_at: stored.updated_at } : {}) })
      } catch (error) { reject(error) }
    }
    request.onerror = () => reject(request.error ?? new Error('อ่านลำดับหมวด Supplier Library ไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่านลำดับหมวด Supplier Library ไม่สำเร็จ')) }
  })
}

export async function saveLocalSupplierLibraryCategoryOrder(categories: string[]): Promise<LocalSupplierLibraryCategoryOrder> {
  const saved: LocalSupplierLibraryCategoryOrder = {
    id: 'default', categories: normalizeSupplierLibraryCategoryOrder(categories), updated_at: new Date().toISOString(),
  }
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SUPPLIER_CATEGORY_ORDER_STORE_NAME, 'readwrite')
    transaction.objectStore(SUPPLIER_CATEGORY_ORDER_STORE_NAME).put(saved, SUPPLIER_CATEGORY_ORDER_KEY)
    transaction.oncomplete = () => { database.close(); resolve(structuredClone(saved)) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึกลำดับหมวด Supplier Library ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึกลำดับหมวด Supplier Library ถูกยกเลิก')) }
  })
}

export async function deleteLocalProposalTemplate(id: string): Promise<void> {
  if (!id.trim()) throw new Error('ไม่พบ ID แม่แบบข้อเสนอ')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROPOSAL_TEMPLATE_STORE_NAME, 'readwrite')
    transaction.objectStore(PROPOSAL_TEMPLATE_STORE_NAME).delete(id)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('ลบแม่แบบข้อเสนอไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('ลบแม่แบบข้อเสนอถูกยกเลิก')) }
  })
}

export async function listLocalDiscountRules(): Promise<LocalDiscountRule[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DISCOUNT_RULE_STORE_NAME, 'readonly')
    const request = transaction.objectStore(DISCOUNT_RULE_STORE_NAME).getAll()
    request.onsuccess = () => {
      const rules = request.result as LocalDiscountRule[]
      try { rules.forEach(validateLocalDiscountRule); resolve(rules.sort((a, b) => a.name.localeCompare(b.name, 'th-TH'))) }
      catch (error) { reject(error) }
    }
    request.onerror = () => reject(request.error ?? new Error('อ่านกฎส่วนลดไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่านกฎส่วนลดไม่สำเร็จ')) }
  })
}

export async function saveLocalDiscountRule(input: {
  id?: string
  name: string
  discount_percent: number
  notes?: string
}): Promise<LocalDiscountRule> {
  const name = input.name.trim().slice(0, 100)
  const notes = (input.notes ?? '').trim()
  if (!name) throw new Error('ตั้งชื่อกฎส่วนลดก่อนบันทึก')
  if (notes.length > 500) throw new Error('หมายเหตุของกฎส่วนลดต้องไม่เกิน 500 ตัวอักษร')
  if (!Number.isFinite(input.discount_percent) || input.discount_percent < 0 || input.discount_percent > 100) throw new Error('ส่วนลดต้องอยู่ระหว่าง 0 ถึง 100 เปอร์เซ็นต์')
  const id = input.id || crypto.randomUUID()
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DISCOUNT_RULE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(DISCOUNT_RULE_STORE_NAME)
    const request = store.getAll()
    let saved: LocalDiscountRule | undefined
    request.onsuccess = () => {
      const rules = request.result as LocalDiscountRule[]
      const existing = rules.find(rule => rule.id === id)
      if (input.id && !existing) {
        transaction.abort()
        reject(new Error('ไม่พบกฎส่วนลดที่ต้องการอัปเดต'))
        return
      }
      const duplicate = rules.find(rule => rule.id !== id && rule.name.trim().toLocaleLowerCase('th-TH') === name.toLocaleLowerCase('th-TH'))
      if (duplicate) {
        transaction.abort()
        reject(new Error(`มีกฎส่วนลดชื่อ “${duplicate.name}” อยู่แล้ว`))
        return
      }
      if (!existing && rules.length >= 100) {
        transaction.abort()
        reject(new Error('Company Library มีกฎส่วนลดได้สูงสุด 100 รายการ'))
        return
      }
      const now = new Date().toISOString()
      saved = existing
        ? { ...existing, name, discount_percent: input.discount_percent, notes, updated_at: now }
        : { id, name, discount_percent: input.discount_percent, notes, created_at: now, updated_at: now }
      validateLocalDiscountRule(saved)
      store.put(saved, id)
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); saved ? resolve(saved) : reject(new Error('บันทึกกฎส่วนลดไม่สำเร็จ')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึกกฎส่วนลดไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึกกฎส่วนลดถูกยกเลิก')) }
  })
}

export async function deleteLocalDiscountRule(id: string): Promise<void> {
  if (!id.trim()) throw new Error('ไม่พบ ID กฎส่วนลด')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DISCOUNT_RULE_STORE_NAME, 'readwrite')
    transaction.objectStore(DISCOUNT_RULE_STORE_NAME).delete(id)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('ลบกฎส่วนลดไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('ลบกฎส่วนลดไม่สำเร็จ')) }
  })
}

export async function listLocalSupplierProducts(): Promise<LocalSupplierProduct[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SUPPLIER_PRODUCT_STORE_NAME, 'readonly')
    const request = transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME).getAll()
    request.onsuccess = () => {
      const products = request.result as LocalSupplierProduct[]
      try {
        products.forEach(validateSupplierProduct)
        resolve(products.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name, 'th-TH') || a.name.localeCompare(b.name, 'th-TH')))
      } catch (error) { reject(error) }
    }
    request.onerror = () => reject(request.error ?? new Error('อ่าน Supplier Product Library ไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่าน Supplier Product Library ไม่สำเร็จ')) }
  })
}

export async function listLocalSupplierProductGroups(products?: LocalSupplierProduct[]): Promise<LocalSupplierProductGroup[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_GROUP_STORE_NAME, SUPPLIER_PRODUCT_STORE_NAME], 'readonly')
    const groupRequest = transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME).getAll()
    const productRequest = products ? undefined : transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME).getAll()
    let groups: LocalSupplierProductGroup[] | undefined
    let catalog = products
    const finish = () => {
      if (!groups || !catalog) return
      try {
        groups.forEach(group => validateSupplierProductGroupProducts(group, catalog!))
        resolve(groups.sort((a, b) => a.name.localeCompare(b.name, 'th-TH')))
      } catch (error) { reject(error) }
    }
    groupRequest.onsuccess = () => { groups = groupRequest.result as LocalSupplierProductGroup[]; finish() }
    if (productRequest) productRequest.onsuccess = () => { catalog = productRequest.result as LocalSupplierProduct[]; finish() }
    groupRequest.onerror = () => reject(groupRequest.error ?? new Error('อ่าน Product Group Library ไม่สำเร็จ'))
    if (productRequest) productRequest.onerror = () => reject(productRequest.error ?? new Error('อ่าน Supplier Product Library ไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่าน Product Group Library ไม่สำเร็จ')) }
  })
}

export async function saveLocalSupplierProductGroup(group: LocalSupplierProductGroup): Promise<LocalSupplierProductGroup> {
  validateSupplierProductGroup(group)
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_GROUP_STORE_NAME, SUPPLIER_PRODUCT_STORE_NAME, SUPPLIER_PRODUCT_BUNDLE_STORE_NAME], 'readwrite')
    const groupStore = transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME)
    const groupRequest = groupStore.getAll()
    const productRequest = transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME).getAll()
    const bundleRequest = transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME).getAll()
    let currentGroups: LocalSupplierProductGroup[] | undefined
    let products: LocalSupplierProduct[] | undefined
    let bundles: LocalSupplierProductBundle[] | undefined
    let saved: LocalSupplierProductGroup | undefined
    const saveWhenReady = () => {
      if (!currentGroups || !products || !bundles) return
      try { validateSupplierProductGroupProducts(group, products) }
      catch (error) { transaction.abort(); reject(error instanceof Error ? error : new Error('Product Group ตรวจสอบไม่ผ่าน')); return }
      const existing = currentGroups.find(item => item.id === group.id)
      const duplicate = currentGroups.find(item => item.id !== group.id && item.name.trim().toLocaleLowerCase('th-TH') === group.name.trim().toLocaleLowerCase('th-TH'))
      if (duplicate) { transaction.abort(); reject(new Error(`มี Product Group ชื่อ “${duplicate.name}” อยู่แล้ว`)); return }
      if (!existing && currentGroups.length >= 500) { transaction.abort(); reject(new Error('Product Group Library มีได้สูงสุด 500 กลุ่ม')); return }
      const mergedGroups = [...currentGroups.filter(item => item.id !== group.id), group]
      try { bundles.forEach(bundle => validateSupplierProductBundle(bundle, mergedGroups)) }
      catch (error) { transaction.abort(); reject(new Error(`แก้กลุ่มไม่ได้ · ${error instanceof Error ? error.message : 'Bundle ที่ใช้อยู่จะไม่ถูกต้อง'}`)); return }
      saved = { ...structuredClone(group), created_at: existing?.created_at ?? group.created_at }
      groupStore.put(saved, saved.id)
    }
    groupRequest.onsuccess = () => { currentGroups = groupRequest.result as LocalSupplierProductGroup[]; saveWhenReady() }
    productRequest.onsuccess = () => { products = productRequest.result as LocalSupplierProduct[]; saveWhenReady() }
    bundleRequest.onsuccess = () => { bundles = bundleRequest.result as LocalSupplierProductBundle[]; saveWhenReady() }
    groupRequest.onerror = () => transaction.abort()
    productRequest.onerror = () => transaction.abort()
    bundleRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); saved ? resolve(saved) : reject(new Error('บันทึก Product Group ไม่สำเร็จ')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึก Product Group ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึก Product Group ถูกยกเลิก')) }
  })
}

export async function deleteLocalSupplierProductGroup(id: string): Promise<void> {
  if (!id.trim()) throw new Error('ไม่พบ ID Product Group')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_GROUP_STORE_NAME, SUPPLIER_PRODUCT_BUNDLE_STORE_NAME], 'readwrite')
    const groupStore = transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME)
    const request = transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME).getAll()
    request.onsuccess = () => {
      const referencing = (request.result as LocalSupplierProductBundle[]).find(bundle => bundle.components.some(component => component.product_group_id === id))
      if (referencing) { transaction.abort(); reject(new Error(`ลบ Product Group ไม่ได้ · ยังถูกใช้ใน Bundle “${referencing.name}”`)); return }
      groupStore.delete(id)
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('ลบ Product Group ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('ลบ Product Group ไม่สำเร็จ')) }
  })
}

export async function saveLocalSupplierProduct(product: LocalSupplierProduct): Promise<LocalSupplierProduct> {
  validateSupplierProduct(product)
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_STORE_NAME, SUPPLIER_PRODUCT_GROUP_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME)
    const request = store.getAll()
    const groupRequest = transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME).getAll()
    let saved: LocalSupplierProduct | undefined
    let currentProducts: LocalSupplierProduct[] | undefined
    let currentGroups: LocalSupplierProductGroup[] | undefined
    const saveWhenReady = () => {
      if (!currentProducts || !currentGroups) return
      const products = currentProducts
      const existing = products.find(item => item.id === product.id)
      const duplicate = products.find(item => item.id !== product.id
        && item.supplier_name.toLocaleLowerCase('th-TH') === product.supplier_name.toLocaleLowerCase('th-TH')
        && item.supplier_sku.toLocaleLowerCase('th-TH') === product.supplier_sku.toLocaleLowerCase('th-TH'))
      if (duplicate) {
        transaction.abort()
        reject(new Error(`รหัสสินค้า ${product.supplier_sku} ของ ${product.supplier_name} ถูกใช้แล้ว`))
        return
      }
      if (!existing && products.length >= 1000) {
        transaction.abort()
        reject(new Error('Supplier Product Library ในอุปกรณ์นี้มีได้สูงสุด 1,000 รายการ'))
        return
      }
      try { currentGroups.forEach(group => validateSupplierProductGroupProducts(group, [...products.filter(item => item.id !== product.id), product])) }
      catch (error) { transaction.abort(); reject(error instanceof Error ? error : new Error('สินค้าไม่ตรงกับ Product Group')); return }
      saved = { ...structuredClone(product), created_at: existing?.created_at ?? product.created_at }
      store.put(saved, saved.id)
    }
    request.onsuccess = () => { currentProducts = request.result as LocalSupplierProduct[]; saveWhenReady() }
    groupRequest.onsuccess = () => { currentGroups = groupRequest.result as LocalSupplierProductGroup[]; saveWhenReady() }
    request.onerror = () => transaction.abort()
    groupRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); saved ? resolve(saved) : reject(new Error('บันทึกสินค้าไม่สำเร็จ')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึกสินค้าไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึกสินค้าไม่สำเร็จ')) }
  })
}

/** Merge one validated catalog file atomically; a duplicate supplier SKU rejects the whole import. */
export async function importLocalSupplierProducts(incoming: LocalSupplierProduct[]): Promise<LocalSupplierProduct[]> {
  if (!Array.isArray(incoming) || !incoming.length || incoming.length > 1000) throw new Error('ไฟล์ต้องมีสินค้า 1 ถึง 1,000 รายการ')
  return (await importLocalSupplierCatalog(incoming, [])).products
}

/** Merge a spreadsheet's supplier products and dependent bundles in one IndexedDB transaction. */
export async function importLocalSupplierCatalog(
  incomingProducts: LocalSupplierProduct[],
  incomingBundles: LocalSupplierProductBundle[],
  incomingGroups: LocalSupplierProductGroup[] = [],
): Promise<{ products: LocalSupplierProduct[]; groups: LocalSupplierProductGroup[]; bundles: LocalSupplierProductBundle[] }> {
  if (!Array.isArray(incomingProducts) || !Array.isArray(incomingBundles) || !Array.isArray(incomingGroups) || (!incomingProducts.length && !incomingBundles.length && !incomingGroups.length)) {
    throw new Error('ไฟล์ต้องมีสินค้า, Product Group หรือ Product Bundle อย่างน้อยหนึ่งรายการ')
  }
  if (incomingProducts.length > 1000 || incomingBundles.length > 500 || incomingGroups.length > 500) throw new Error('นำเข้าได้ไม่เกิน 1,000 สินค้า, 500 Product Groups และ 500 Bundles ต่อครั้ง')
  incomingProducts.forEach(validateSupplierProduct)
  incomingGroups.forEach(validateSupplierProductGroup)
  if (new Set(incomingProducts.map(item => item.id)).size !== incomingProducts.length) throw new Error('ไฟล์มี UUID สินค้าซ้ำ')
  if (new Set(incomingGroups.map(item => item.id)).size !== incomingGroups.length) throw new Error('ไฟล์มี UUID Product Group ซ้ำ')
  if (new Set(incomingBundles.map(item => item.id)).size !== incomingBundles.length) throw new Error('ไฟล์มี UUID Bundle ซ้ำ')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_STORE_NAME, SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, SUPPLIER_PRODUCT_GROUP_STORE_NAME], 'readwrite')
    const productStore = transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME)
    const bundleStore = transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME)
    const groupStore = transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME)
    const productRequest = productStore.getAll()
    const bundleRequest = bundleStore.getAll()
    const groupRequest = groupStore.getAll()
    let currentProducts: LocalSupplierProduct[] | undefined
    let currentBundles: LocalSupplierProductBundle[] | undefined
    let currentGroups: LocalSupplierProductGroup[] | undefined
    let importedProducts: LocalSupplierProduct[] = []
    let importedBundles: LocalSupplierProductBundle[] = []
    let importedGroups: LocalSupplierProductGroup[] = []
    let settled = false
    const fail = (message: string) => {
      if (settled) return
      settled = true
      transaction.abort()
      reject(new Error(message))
    }
    const writeWhenReady = () => {
      if (!currentProducts || !currentBundles || !currentGroups || settled) return
      const mergedProducts = new Map(currentProducts.map(product => [product.id, product]))
      importedProducts = incomingProducts.map(product => {
        const previous = mergedProducts.get(product.id)
        const saved = { ...structuredClone(product), created_at: previous?.created_at ?? product.created_at }
        mergedProducts.set(saved.id, saved)
        return saved
      })
      const skuOwners = new Map<string, string>()
      for (const product of mergedProducts.values()) {
        const key = `${product.supplier_name.trim().toLocaleLowerCase('th-TH')}\u0000${product.supplier_sku.trim().toLocaleLowerCase('th-TH')}`
        const owner = skuOwners.get(key)
        if (owner && owner !== product.id) { fail(`รหัสสินค้า ${product.supplier_sku} ของ ${product.supplier_name} ซ้ำใน Library หรือไฟล์นำเข้า`); return }
        skuOwners.set(key, product.id)
      }
      if (mergedProducts.size > 1000) { fail('นำเข้าแล้ว Supplier Product Library จะเกิน 1,000 รายการ'); return }
      const mergedGroups = new Map(currentGroups.map(group => [group.id, group]))
      importedGroups = incomingGroups.map(group => {
        const previous = mergedGroups.get(group.id)
        const saved = { ...structuredClone(group), created_at: previous?.created_at ?? group.created_at }
        mergedGroups.set(saved.id, saved)
        return saved
      })
      const allGroups = [...mergedGroups.values()]
      const groupIds = new Set<string>()
      const groupNames = new Map<string, string>()
      for (const group of allGroups) {
        try { validateSupplierProductGroupProducts(group, [...mergedProducts.values()]) }
        catch (error) { fail(error instanceof Error ? error.message : 'Product Group ตรวจสอบไม่ผ่าน'); return }
        const name = group.name.trim().toLocaleLowerCase('th-TH')
        const owner = groupNames.get(name)
        if (owner && owner !== group.id) { fail(`ชื่อ Product Group “${group.name}” ซ้ำใน Library หรือไฟล์นำเข้า`); return }
        groupNames.set(name, group.id); groupIds.add(group.id)
      }
      if (mergedGroups.size > 500) { fail('นำเข้าแล้ว Product Group Library จะมีเกิน 500 กลุ่ม'); return }
      const mergedBundles = new Map(currentBundles.map(bundle => [bundle.id, bundle]))
      importedBundles = incomingBundles.map(bundle => {
        const previous = mergedBundles.get(bundle.id)
        const saved = { ...structuredClone(bundle), created_at: previous?.created_at ?? bundle.created_at }
        mergedBundles.set(saved.id, saved)
        return saved
      })
      const productIds = new Set(mergedProducts.keys())
      const orphan = [...mergedBundles.values()].flatMap(bundle => bundle.components).find(component => !productIds.has(component.product_id))
      if (orphan) { fail(`Bundle อ้างถึง Supplier SKU ${orphan.product_id} ที่ไม่มีใน Library`); return }
      const missingGroup = [...mergedBundles.values()].flatMap(bundle => bundle.components).find(component => component.product_group_id && !groupIds.has(component.product_group_id))
      if (missingGroup) { fail(`Bundle อ้างถึง Product Group ${missingGroup.product_group_id} ที่ไม่มีใน Library`); return }
      for (const bundle of mergedBundles.values()) {
        try { validateSupplierProductBundle(bundle, allGroups) }
        catch (error) { fail(error instanceof Error ? error.message : 'Product Bundle ตรวจสอบไม่ผ่าน'); return }
      }
      const bundleNames = new Map<string, string>()
      for (const bundle of mergedBundles.values()) {
        const key = bundle.name.trim().toLocaleLowerCase('th-TH')
        const owner = bundleNames.get(key)
        if (owner && owner !== bundle.id) { fail(`ชื่อ Bundle “${bundle.name}” ซ้ำใน Library หรือไฟล์นำเข้า`); return }
        bundleNames.set(key, bundle.id)
      }
      if (mergedBundles.size > 500) { fail('นำเข้าแล้ว Product Bundle Library จะเกิน 500 ชุด'); return }
      for (const product of importedProducts) productStore.put(product, product.id)
      for (const group of importedGroups) groupStore.put(group, group.id)
      for (const bundle of importedBundles) bundleStore.put(bundle, bundle.id)
    }
    productRequest.onsuccess = () => { currentProducts = productRequest.result as LocalSupplierProduct[]; writeWhenReady() }
    bundleRequest.onsuccess = () => { currentBundles = bundleRequest.result as LocalSupplierProductBundle[]; writeWhenReady() }
    groupRequest.onsuccess = () => { currentGroups = groupRequest.result as LocalSupplierProductGroup[]; writeWhenReady() }
    productRequest.onerror = () => transaction.abort()
    bundleRequest.onerror = () => transaction.abort()
    groupRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => {
      database.close()
      if (!settled) resolve({ products: importedProducts, groups: importedGroups, bundles: importedBundles })
    }
    transaction.onerror = () => { database.close(); if (!settled) reject(transaction.error ?? new Error('นำเข้า Supplier Product Library ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); if (!settled) reject(transaction.error ?? new Error('นำเข้า Supplier Product Library ถูกยกเลิก')) }
  })
}

export async function deleteLocalSupplierProduct(id: string): Promise<void> {
  if (!id.trim()) throw new Error('ไม่พบ ID สินค้า')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_STORE_NAME, SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, SUPPLIER_PRODUCT_GROUP_STORE_NAME], 'readwrite')
    const bundleStore = transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME)
    const groupStore = transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME)
    const bundleRequest = bundleStore.getAll()
    const groupRequest = groupStore.getAll()
    let bundleChecked = false
    let groupChecked = false
    let blocked = false
    const deleteWhenClear = () => {
      if (!bundleChecked || !groupChecked || blocked) return
      transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME).delete(id)
    }
    bundleRequest.onsuccess = () => {
      const referencing = (bundleRequest.result as LocalSupplierProductBundle[]).find(bundle => bundle.components.some(component => component.product_id === id))
      if (referencing) {
        blocked = true
        transaction.abort()
        reject(new Error(`ลบสินค้าไม่ได้ · ยังถูกใช้อยู่ใน Bundle “${referencing.name}”`))
        return
      }
      bundleChecked = true
      deleteWhenClear()
    }
    groupRequest.onsuccess = () => {
      const referencing = (groupRequest.result as LocalSupplierProductGroup[]).find(group => group.product_ids.includes(id))
      if (referencing) {
        blocked = true
        transaction.abort()
        reject(new Error(`ลบสินค้าไม่ได้ · ยังเป็นตัวเลือกใน Product Group “${referencing.name}”`))
        return
      }
      groupChecked = true
      deleteWhenClear()
    }
    bundleRequest.onerror = () => transaction.abort()
    groupRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('ลบสินค้าไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('ลบสินค้าไม่สำเร็จ')) }
  })
}

export interface SupplierLibraryCategoryRenameResult {
  category: string
  products: number
  bundles: number
}

/** Rename or merge one derived category across product and bundle records in a single IndexedDB transaction. */
export async function renameLocalSupplierLibraryCategory(fromValue: string, toValue: string): Promise<SupplierLibraryCategoryRenameResult> {
  const from = fromValue.trim() || 'ทั่วไป'
  const to = toValue.trim()
  if (!from || from.length > 80) throw new Error('ชื่อหมวดต้นทางไม่ถูกต้อง')
  if (!to || to.length > 80) throw new Error('ชื่อหมวดใหม่ต้องมี 1 ถึง 80 ตัวอักษร')
  if (to.toLocaleLowerCase('th-TH') === 'ทุกหมวด') throw new Error('“ทุกหมวด” เป็นตัวกรองระบบและใช้เป็นชื่อหมวดไม่ได้')
  if (from.toLocaleLowerCase('th-TH') === to.toLocaleLowerCase('th-TH')) return { category: from, products: 0, bundles: 0 }

  const fromKey = from.toLocaleLowerCase('th-TH')
  const storedCategory = to === 'ทั่วไป' ? undefined : to
  const now = new Date().toISOString()
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_STORE_NAME, SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, SUPPLIER_CATEGORY_ORDER_STORE_NAME], 'readwrite')
    const productStore = transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME)
    const bundleStore = transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME)
    const categoryOrderStore = transaction.objectStore(SUPPLIER_CATEGORY_ORDER_STORE_NAME)
    const productRequest = productStore.getAll()
    const bundleRequest = bundleStore.getAll()
    const orderRequest = categoryOrderStore.get(SUPPLIER_CATEGORY_ORDER_KEY)
    let productsUpdated = 0
    let bundlesUpdated = 0
    let productsReady = false
    let bundlesReady = false
    let orderReady = false

    const updateWhenReady = () => {
      if (!productsReady || !bundlesReady || !orderReady) return
      try {
        const products = productRequest.result as LocalSupplierProduct[]
        const bundles = bundleRequest.result as LocalSupplierProductBundle[]
        const previousOrder = orderRequest.result as LocalSupplierLibraryCategoryOrder | undefined
        products.forEach(validateSupplierProduct)
        bundles.forEach(bundle => validateSupplierProductBundle(bundle))
        const updatedProducts = products.map(product => {
          if ((product.category?.trim() || 'ทั่วไป').toLocaleLowerCase('th-TH') !== fromKey) return product
          const updated = { ...product, updated_at: now }
          if (storedCategory === undefined) delete updated.category
          else updated.category = storedCategory
          validateSupplierProduct(updated)
          productStore.put(updated, updated.id)
          productsUpdated += 1
          return updated
        })
        const updatedBundles = bundles.map(bundle => {
          if ((bundle.category?.trim() || 'ทั่วไป').toLocaleLowerCase('th-TH') !== fromKey) return bundle
          const updated = { ...bundle, updated_at: now }
          if (storedCategory === undefined) delete updated.category
          else updated.category = storedCategory
          validateSupplierProductBundle(updated)
          bundleStore.put(updated, updated.id)
          bundlesUpdated += 1
          return updated
        })
        const orderTarget = storedCategory ?? 'ทั่วไป'
        const preferredOrder = normalizeSupplierLibraryCategoryOrder(previousOrder?.categories ?? [])
          .map(name => name.toLocaleLowerCase('th-TH') === fromKey ? orderTarget : name)
        const allCategories = [
          ...updatedProducts.map(product => product.category?.trim() || 'ทั่วไป'),
          ...updatedBundles.map(bundle => bundle.category?.trim() || 'ทั่วไป'),
        ]
        categoryOrderStore.put({
          id: 'default', categories: orderSupplierLibraryCategoryNames(allCategories, preferredOrder), updated_at: now,
        }, SUPPLIER_CATEGORY_ORDER_KEY)
      } catch (error) {
        transaction.abort()
        reject(error instanceof Error ? error : new Error('เปลี่ยนหมวด Library ไม่สำเร็จ'))
      }
    }

    productRequest.onsuccess = () => { productsReady = true; updateWhenReady() }
    bundleRequest.onsuccess = () => { bundlesReady = true; updateWhenReady() }
    orderRequest.onsuccess = () => { orderReady = true; updateWhenReady() }
    productRequest.onerror = () => transaction.abort()
    bundleRequest.onerror = () => transaction.abort()
    orderRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => {
      database.close()
      resolve({ category: to, products: productsUpdated, bundles: bundlesUpdated })
    }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('เปลี่ยนหมวด Library ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('เปลี่ยนหมวด Library ถูกยกเลิก')) }
  })
}

export async function listLocalSupplierProductBundles(products: LocalSupplierProduct[]): Promise<LocalSupplierProductBundle[]> {
  const productIds = new Set(products.map(product => product.id))
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, SUPPLIER_PRODUCT_GROUP_STORE_NAME], 'readonly')
    const request = transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME).getAll()
    const groupRequest = transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME).getAll()
    let bundles: LocalSupplierProductBundle[] | undefined
    let groups: LocalSupplierProductGroup[] | undefined
    const validate = () => {
      if (!bundles || !groups) return
      try {
        for (const bundle of bundles) {
          validateSupplierProductBundle(bundle, groups)
          const missingProductId = bundle.components.find(component => !productIds.has(component.product_id))?.product_id
          if (missingProductId) throw new Error(`Bundle “${bundle.name}” อ้างถึงสินค้า ${missingProductId} ที่ไม่มีใน Library`)
        }
        resolve(bundles.sort((a, b) => a.name.localeCompare(b.name, 'th-TH')))
      } catch (error) { reject(error) }
    }
    request.onsuccess = () => {
      bundles = request.result as LocalSupplierProductBundle[]
      validate()
    }
    groupRequest.onsuccess = () => { groups = groupRequest.result as LocalSupplierProductGroup[]; validate() }
    request.onerror = () => reject(request.error ?? new Error('อ่าน Product Bundle Library ไม่สำเร็จ'))
    groupRequest.onerror = () => reject(groupRequest.error ?? new Error('อ่าน Product Group Library ไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่าน Product Bundle Library ไม่สำเร็จ')) }
  })
}

export async function saveLocalSupplierProductBundle(bundle: LocalSupplierProductBundle): Promise<LocalSupplierProductBundle> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, SUPPLIER_PRODUCT_STORE_NAME, SUPPLIER_PRODUCT_GROUP_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME)
    const bundleRequest = store.getAll()
    const productRequest = transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME).getAll()
    const groupRequest = transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME).getAll()
    let existingBundles: LocalSupplierProductBundle[] | undefined
    let currentProducts: LocalSupplierProduct[] | undefined
    let currentGroups: LocalSupplierProductGroup[] | undefined
    let saved: LocalSupplierProductBundle | undefined
    const writeWhenReady = () => {
      if (!existingBundles || !currentProducts || !currentGroups) return
      try { validateSupplierProductBundle(bundle, currentGroups) }
      catch (error) { transaction.abort(); reject(error instanceof Error ? error : new Error('Product Bundle ตรวจสอบไม่ผ่าน')); return }
      const productIds = new Set(currentProducts.map(product => product.id))
      const missingProductId = bundle.components.find(component => !productIds.has(component.product_id))?.product_id
      if (missingProductId) {
        transaction.abort()
        reject(new Error(`ไม่พบ Supplier SKU ${missingProductId} ใน Library`))
        return
      }
      const bundles = existingBundles
      const existing = bundles.find(item => item.id === bundle.id)
      const duplicateName = bundles.find(item => item.id !== bundle.id && item.name.toLocaleLowerCase('th-TH') === bundle.name.toLocaleLowerCase('th-TH'))
      if (duplicateName) {
        transaction.abort()
        reject(new Error(`มี Bundle ชื่อ “${duplicateName.name}” อยู่แล้ว`))
        return
      }
      if (!existing && bundles.length >= 500) {
        transaction.abort()
        reject(new Error('Product Bundle Library มีได้สูงสุด 500 ชุด'))
        return
      }
      saved = { ...structuredClone(bundle), created_at: existing?.created_at ?? bundle.created_at }
      store.put(saved, saved.id)
    }
    bundleRequest.onsuccess = () => { existingBundles = bundleRequest.result as LocalSupplierProductBundle[]; writeWhenReady() }
    productRequest.onsuccess = () => { currentProducts = productRequest.result as LocalSupplierProduct[]; writeWhenReady() }
    groupRequest.onsuccess = () => { currentGroups = groupRequest.result as LocalSupplierProductGroup[]; writeWhenReady() }
    bundleRequest.onerror = () => transaction.abort()
    productRequest.onerror = () => transaction.abort()
    groupRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); saved ? resolve(saved) : reject(new Error('บันทึก Product Bundle ไม่สำเร็จ')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึก Product Bundle ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึก Product Bundle ถูกยกเลิก')) }
  })
}

export async function importLocalSupplierProductBundles(incoming: LocalSupplierProductBundle[]): Promise<LocalSupplierProductBundle[]> {
  if (!Array.isArray(incoming) || !incoming.length || incoming.length > 500) throw new Error('ไฟล์ต้องมี Bundle 1 ถึง 500 ชุด')
  incoming.forEach(bundle => validateSupplierProductBundle(bundle))
  if (new Set(incoming.map(bundle => bundle.id)).size !== incoming.length) throw new Error('ไฟล์มี UUID Bundle ซ้ำ')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, SUPPLIER_PRODUCT_STORE_NAME, SUPPLIER_PRODUCT_GROUP_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME)
    const bundleRequest = store.getAll()
    const productRequest = transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME).getAll()
    const groupRequest = transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME).getAll()
    let existingBundles: LocalSupplierProductBundle[] | undefined
    let currentProducts: LocalSupplierProduct[] | undefined
    let currentGroups: LocalSupplierProductGroup[] | undefined
    let imported: LocalSupplierProductBundle[] = []
    const writeWhenReady = () => {
      if (!existingBundles || !currentProducts || !currentGroups) return
      for (const bundle of incoming) {
        try { validateSupplierProductBundle(bundle, currentGroups) }
        catch (error) { transaction.abort(); reject(error instanceof Error ? error : new Error('Product Bundle ตรวจสอบไม่ผ่าน')); return }
      }
      const productIds = new Set(currentProducts.map(product => product.id))
      const orphan = incoming.flatMap(bundle => bundle.components).find(component => !productIds.has(component.product_id))
      if (orphan) {
        transaction.abort()
        reject(new Error(`ต้องนำเข้า SKU ${orphan.product_id} ก่อนนำเข้า Bundle นี้`))
        return
      }
      const merged = new Map(existingBundles.map(bundle => [bundle.id, bundle]))
      imported = incoming.map(bundle => {
        const previous = merged.get(bundle.id)
        const saved = { ...structuredClone(bundle), created_at: previous?.created_at ?? bundle.created_at }
        merged.set(saved.id, saved)
        return saved
      })
      const names = new Map<string, string>()
      for (const bundle of merged.values()) {
        const key = bundle.name.trim().toLocaleLowerCase('th-TH')
        const existingId = names.get(key)
        if (existingId && existingId !== bundle.id) {
          transaction.abort()
          reject(new Error(`ชื่อ Bundle “${bundle.name}” ซ้ำใน Library หรือไฟล์นำเข้า`))
          return
        }
        names.set(key, bundle.id)
      }
      if (merged.size > 500) {
        transaction.abort()
        reject(new Error('นำเข้าแล้ว Product Bundle Library จะเกิน 500 ชุด'))
        return
      }
      for (const bundle of imported) store.put(bundle, bundle.id)
    }
    bundleRequest.onsuccess = () => { existingBundles = bundleRequest.result as LocalSupplierProductBundle[]; writeWhenReady() }
    productRequest.onsuccess = () => { currentProducts = productRequest.result as LocalSupplierProduct[]; writeWhenReady() }
    groupRequest.onsuccess = () => { currentGroups = groupRequest.result as LocalSupplierProductGroup[]; writeWhenReady() }
    bundleRequest.onerror = () => transaction.abort()
    productRequest.onerror = () => transaction.abort()
    groupRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); resolve(imported) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('นำเข้า Product Bundle Library ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('นำเข้า Product Bundle Library ถูกยกเลิก')) }
  })
}

export async function deleteLocalSupplierProductBundle(id: string): Promise<void> {
  if (!id.trim()) throw new Error('ไม่พบ ID Product Bundle')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, 'readwrite')
    transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME).delete(id)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('ลบ Product Bundle ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('ลบ Product Bundle ไม่สำเร็จ')) }
  })
}

const localUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const validIsoTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

function validateLocalTakeoffPriceBook(value: unknown): asserts value is LocalTakeoffPriceBook {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Price book ในไฟล์ Library ไม่ถูกต้อง')
  const book = value as Record<string, unknown>
  if (typeof book.id !== 'string' || !localUuidPattern.test(book.id)) throw new Error('Price book ID ต้องเป็น UUID')
  if (typeof book.name !== 'string' || !book.name.trim() || book.name.length > 100) throw new Error('ชื่อ Price book ต้องมี 1 ถึง 100 ตัวอักษร')
  if (!validIsoTimestamp(book.created_at) || !validIsoTimestamp(book.updated_at)) throw new Error(`วันที่ของ Price book “${book.name}” ไม่ถูกต้อง`)
  validateProjectTakeoffRates(book.rates as Record<string, ProjectTakeoffRate>)
}

function validateLocalProposalTemplate(value: unknown): asserts value is LocalProposalTemplate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('แม่แบบข้อเสนอในไฟล์ Library ไม่ถูกต้อง')
  const template = value as Record<string, unknown>
  if (typeof template.id !== 'string' || !localUuidPattern.test(template.id)) throw new Error('แม่แบบข้อเสนอ ID ต้องเป็น UUID')
  if (typeof template.name !== 'string' || !template.name.trim() || template.name.length > 80) throw new Error('ชื่อแม่แบบข้อเสนอต้องมี 1 ถึง 80 ตัวอักษร')
  if (typeof template.notes !== 'string' || template.notes.length > 4000 || typeof template.terms !== 'string' || template.terms.length > 4000) throw new Error(`หมายเหตุหรือเงื่อนไขของแม่แบบ “${template.name}” ยาวเกินกำหนด`)
  if (!Number.isInteger(template.validity_days) || (template.validity_days as number) < 1 || (template.validity_days as number) > 365) throw new Error(`อายุข้อเสนอของแม่แบบ “${template.name}” ต้องอยู่ระหว่าง 1 ถึง 365 วัน`)
  if (template.conditional_text_rules !== undefined) {
    if (!Array.isArray(template.conditional_text_rules) || template.conditional_text_rules.length > 100) throw new Error(`ข้อความแบบมีเงื่อนไขของแม่แบบ “${template.name}” ไม่ถูกต้อง`)
    const rules = template.conditional_text_rules as ProposalConditionalTextRule[]
    rules.forEach(validateProposalConditionalTextRule)
    if (new Set(rules.map(rule => rule.id)).size !== rules.length) throw new Error(`UUID ข้อความแบบมีเงื่อนไขของแม่แบบ “${template.name}” ซ้ำกัน`)
  }
  if (!validIsoTimestamp(template.created_at) || !validIsoTimestamp(template.updated_at)) throw new Error(`วันที่ของแม่แบบ “${template.name}” ไม่ถูกต้อง`)
}

function validateLocalDiscountRule(value: unknown): asserts value is LocalDiscountRule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('กฎส่วนลดใน Company Library ไม่ถูกต้อง')
  const rule = value as Record<string, unknown>
  if (typeof rule.id !== 'string' || !localUuidPattern.test(rule.id)) throw new Error('กฎส่วนลด ID ต้องเป็น UUID')
  if (typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 100) throw new Error('ชื่อกฎส่วนลดต้องมี 1 ถึง 100 ตัวอักษร')
  if (typeof rule.discount_percent !== 'number' || !Number.isFinite(rule.discount_percent) || rule.discount_percent < 0 || rule.discount_percent > 100) throw new Error(`เปอร์เซ็นต์ส่วนลดของ “${rule.name}” ต้องอยู่ระหว่าง 0 ถึง 100`)
  if (typeof rule.notes !== 'string' || rule.notes.length > 500) throw new Error(`หมายเหตุของกฎส่วนลด “${rule.name}” ต้องไม่เกิน 500 ตัวอักษร`)
  if (!validIsoTimestamp(rule.created_at) || !validIsoTimestamp(rule.updated_at)) throw new Error(`วันที่ของกฎส่วนลด “${rule.name}” ไม่ถูกต้อง`)
}

function validateUniqueLibraryRecords<T>(records: T[], idOf: (record: T) => string, nameOf: (record: T) => string, label: string): void {
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const record of records) {
    const id = idOf(record)
    const name = nameOf(record).trim().toLocaleLowerCase('th-TH')
    if (ids.has(id)) throw new Error(`ไฟล์ Library มี UUID ${label} ซ้ำ`)
    if (names.has(name)) throw new Error(`ไฟล์ Library มีชื่อ ${label} ซ้ำ`)
    ids.add(id)
    names.add(name)
  }
}

function validateLocalFieldFormTemplate(value: unknown): asserts value is LocalFieldFormTemplate {
  validateFieldFormTemplate(value)
  const template = value as LocalFieldFormTemplate
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(template.id)) throw new Error('แม่แบบ Company Field Data ต้องใช้ UUID')
  if (!validIsoTimestamp(template.created_at) || !validIsoTimestamp(template.updated_at)) throw new Error(`วันที่ของแม่แบบฟอร์ม “${template.title}” ไม่ถูกต้อง`)
  if (FIELD_FORM_TEMPLATES.some(builtin => builtin.id === template.id || builtin.title.trim().toLocaleLowerCase('th-TH') === template.title.trim().toLocaleLowerCase('th-TH'))) throw new Error(`แม่แบบฟอร์ม “${template.title}” ซ้ำกับแบบฟอร์มเริ่มต้น`)
}

/** Validate a portable company-library file before opening a write transaction. */
export function validateLocalCompanyLibraryBundle(value: unknown): asserts value is LocalCompanyLibraryBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ไฟล์นี้ไม่ใช่ ConstructFlow Company Library')
  const bundle = value as Record<string, unknown>
  if (bundle.format !== COMPANY_LIBRARY_BUNDLE_FORMAT || ![1, 2, 3, 4, 5, 6, 7].includes(Number(bundle.schema_version)) || bundle.currency !== 'THB') throw new Error('รูปแบบ รุ่น หรือสกุลเงินของ Company Library ไม่รองรับ')
  if (!validIsoTimestamp(bundle.exported_at)) throw new Error('วันเวลาส่งออก Library ไม่ถูกต้อง')
  if (Number(bundle.schema_version) >= 2 && bundle.pricing_settings === undefined) throw new Error(`Company Library รุ่น ${bundle.schema_version} ต้องมี pricing settings`)
  if (Number(bundle.schema_version) >= 3 && bundle.field_form_templates === undefined) throw new Error(`Company Library รุ่น ${bundle.schema_version} ต้องมี Field Form Library`)
  if (Number(bundle.schema_version) >= 5 && bundle.discount_rules === undefined) throw new Error('Company Library รุ่น 5 ต้องมี Discount Rule Library')
  if (Number(bundle.schema_version) >= 6 && bundle.supplier_category_order === undefined) throw new Error('Company Library รุ่น 6 ต้องมีลำดับหมวด Supplier Library')
  if (Number(bundle.schema_version) >= 7 && bundle.supplier_product_groups === undefined) throw new Error('Company Library รุ่น 7 ต้องมี Product Group Library')
  if (bundle.pricing_settings_updated_at !== undefined && !validIsoTimestamp(bundle.pricing_settings_updated_at)) throw new Error('วันเวลาแก้ไข pricing settings ไม่ถูกต้อง')
  if (bundle.supplier_category_order !== undefined) normalizeSupplierLibraryCategoryOrder(bundle.supplier_category_order)
  if (bundle.supplier_category_order_updated_at !== undefined && !validIsoTimestamp(bundle.supplier_category_order_updated_at)) throw new Error('วันเวลาแก้ไขลำดับหมวดไม่ถูกต้อง')
  if (bundle.pricing_settings !== undefined) validateSupplierProductPricingSettings(bundle.pricing_settings)
  const fieldFormTemplates = bundle.field_form_templates === undefined ? [] : bundle.field_form_templates
  if (!Array.isArray(fieldFormTemplates) || fieldFormTemplates.length > 100) throw new Error('field_form_templates ต้องมีได้ไม่เกิน 100 รายการ')
  const limits: Array<[string, unknown, number]> = [
    ['price_books', bundle.price_books, 100], ['proposal_templates', bundle.proposal_templates, 100],
    ['supplier_products', bundle.supplier_products, 1000], ['supplier_product_groups', bundle.supplier_product_groups ?? [], 500], ['supplier_product_bundles', bundle.supplier_product_bundles, 500],
    ['discount_rules', bundle.discount_rules ?? [], 100],
  ]
  for (const [label, records, maximum] of limits) {
    if (!Array.isArray(records) || records.length > maximum) throw new Error(`${label} ต้องเป็นรายการที่มีได้ไม่เกิน ${maximum} รายการ`)
  }
  const priceBooks = bundle.price_books as unknown[]
  const proposalTemplates = bundle.proposal_templates as unknown[]
  const discountRules = (bundle.discount_rules ?? []) as unknown[]
  const reusableFieldTemplates = fieldFormTemplates as unknown[]
  const products = bundle.supplier_products as unknown[]
  const groups = (bundle.supplier_product_groups ?? []) as unknown[]
  const bundles = bundle.supplier_product_bundles as unknown[]
  priceBooks.forEach(validateLocalTakeoffPriceBook)
  proposalTemplates.forEach(validateLocalProposalTemplate)
  discountRules.forEach(validateLocalDiscountRule)
  reusableFieldTemplates.forEach(validateLocalFieldFormTemplate)
  products.forEach(validateSupplierProduct)
  groups.forEach(validateSupplierProductGroup)
  bundles.forEach(bundle => validateSupplierProductBundle(bundle, groups as LocalSupplierProductGroup[]))
  validateUniqueLibraryRecords(priceBooks as LocalTakeoffPriceBook[], item => item.id, item => item.name, 'Price book')
  validateUniqueLibraryRecords(proposalTemplates as LocalProposalTemplate[], item => item.id, item => item.name, 'แม่แบบข้อเสนอ')
  validateUniqueLibraryRecords(discountRules as LocalDiscountRule[], item => item.id, item => item.name, 'กฎส่วนลด')
  validateUniqueLibraryRecords(reusableFieldTemplates as LocalFieldFormTemplate[], item => item.id, item => item.title, 'แม่แบบ Field Data')
  if (new Set((products as LocalSupplierProduct[]).map(item => item.id)).size !== products.length) throw new Error('ไฟล์ Library มี UUID Supplier Product ซ้ำ')
  if (new Set((bundles as LocalSupplierProductBundle[]).map(item => item.id)).size !== bundles.length) throw new Error('ไฟล์ Library มี UUID Product Bundle ซ้ำ')
  if (new Set((groups as LocalSupplierProductGroup[]).map(item => item.id)).size !== groups.length) throw new Error('ไฟล์ Library มี UUID Product Group ซ้ำ')
  const skuKeys = new Set<string>()
  for (const product of products as LocalSupplierProduct[]) {
    const key = `${product.supplier_name.trim().toLocaleLowerCase('th-TH')}\u0000${product.supplier_sku.trim().toLocaleLowerCase('th-TH')}`
    if (skuKeys.has(key)) throw new Error(`SKU ${product.supplier_sku} ของ ${product.supplier_name} ซ้ำในไฟล์ Library`)
    skuKeys.add(key)
  }
  validateUniqueLibraryRecords(bundles as LocalSupplierProductBundle[], item => item.id, item => item.name, 'Product Bundle')
  validateUniqueLibraryRecords(groups as LocalSupplierProductGroup[], item => item.id, item => item.name, 'Product Group')
  ;(groups as LocalSupplierProductGroup[]).forEach(group => validateSupplierProductGroupProducts(group, products as LocalSupplierProduct[]))
}

/** Take a consistent, project-independent snapshot of reusable company libraries. */
export async function createLocalCompanyLibraryBundle(): Promise<LocalCompanyLibraryBundle> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([
      TAKEOFF_PRICE_BOOK_STORE_NAME, PROPOSAL_TEMPLATE_STORE_NAME, SUPPLIER_PRODUCT_STORE_NAME,
      SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, SUPPLIER_PRODUCT_GROUP_STORE_NAME, COMPANY_PRICING_SETTINGS_STORE_NAME, FIELD_FORM_TEMPLATE_STORE_NAME,
        DISCOUNT_RULE_STORE_NAME, SUPPLIER_CATEGORY_ORDER_STORE_NAME,
    ], 'readonly')
    const stores = [
      [TAKEOFF_PRICE_BOOK_STORE_NAME, transaction.objectStore(TAKEOFF_PRICE_BOOK_STORE_NAME)],
      [PROPOSAL_TEMPLATE_STORE_NAME, transaction.objectStore(PROPOSAL_TEMPLATE_STORE_NAME)],
      [SUPPLIER_PRODUCT_STORE_NAME, transaction.objectStore(SUPPLIER_PRODUCT_STORE_NAME)],
      [SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, transaction.objectStore(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME)],
      [SUPPLIER_PRODUCT_GROUP_STORE_NAME, transaction.objectStore(SUPPLIER_PRODUCT_GROUP_STORE_NAME)],
      [COMPANY_PRICING_SETTINGS_STORE_NAME, transaction.objectStore(COMPANY_PRICING_SETTINGS_STORE_NAME)],
      [FIELD_FORM_TEMPLATE_STORE_NAME, transaction.objectStore(FIELD_FORM_TEMPLATE_STORE_NAME)],
      [DISCOUNT_RULE_STORE_NAME, transaction.objectStore(DISCOUNT_RULE_STORE_NAME)],
      [SUPPLIER_CATEGORY_ORDER_STORE_NAME, transaction.objectStore(SUPPLIER_CATEGORY_ORDER_STORE_NAME)],
    ] as const
    const records = new Map<string, unknown[]>()
    let failed = false
    for (const [name, store] of stores) {
      const request = store.getAll()
      request.onsuccess = () => records.set(name, request.result as unknown[])
      request.onerror = () => { failed = true; transaction.abort() }
    }
    transaction.oncomplete = () => {
      database.close()
      if (failed) { reject(new Error('อ่าน Company Library ไม่สำเร็จ')); return }
      try {
        const exportedAt = new Date().toISOString()
        const savedPricing = records.get(COMPANY_PRICING_SETTINGS_STORE_NAME)?.[0] as (SupplierProductPricingSettings & { updated_at?: string }) | undefined
        const savedCategoryOrder = records.get(SUPPLIER_CATEGORY_ORDER_STORE_NAME)?.[0] as LocalSupplierLibraryCategoryOrder | undefined
        const supplierProducts = (records.get(SUPPLIER_PRODUCT_STORE_NAME) ?? []) as LocalSupplierProduct[]
        const supplierBundles = (records.get(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME) ?? []) as LocalSupplierProductBundle[]
        const supplierGroups = (records.get(SUPPLIER_PRODUCT_GROUP_STORE_NAME) ?? []) as LocalSupplierProductGroup[]
        const allSupplierCategories = [
          ...supplierProducts.map(product => product.category?.trim() || 'ทั่วไป'),
          ...supplierBundles.map(bundle => bundle.category?.trim() || 'ทั่วไป'),
        ]
        const bundle: LocalCompanyLibraryBundle = {
          format: COMPANY_LIBRARY_BUNDLE_FORMAT, schema_version: 7, currency: 'THB', exported_at: exportedAt,
          pricing_settings: savedPricing
            ? { default_gross_margin_percent: savedPricing.default_gross_margin_percent, minimum_gross_margin_percent: savedPricing.minimum_gross_margin_percent }
            : DEFAULT_SUPPLIER_PRODUCT_PRICING_SETTINGS,
          ...(savedPricing?.updated_at ? { pricing_settings_updated_at: savedPricing.updated_at } : {}),
          price_books: (records.get(TAKEOFF_PRICE_BOOK_STORE_NAME) ?? []) as LocalTakeoffPriceBook[],
          proposal_templates: (records.get(PROPOSAL_TEMPLATE_STORE_NAME) ?? []) as LocalProposalTemplate[],
          discount_rules: (records.get(DISCOUNT_RULE_STORE_NAME) ?? []) as LocalDiscountRule[],
          field_form_templates: (records.get(FIELD_FORM_TEMPLATE_STORE_NAME) ?? []) as LocalFieldFormTemplate[],
          supplier_category_order: orderSupplierLibraryCategoryNames(allSupplierCategories, savedCategoryOrder?.categories ?? []),
          ...(savedCategoryOrder?.updated_at ? { supplier_category_order_updated_at: savedCategoryOrder.updated_at } : {}),
          supplier_products: supplierProducts,
          supplier_product_groups: supplierGroups,
          supplier_product_bundles: supplierBundles,
        }
        validateLocalCompanyLibraryBundle(bundle)
        const productIds = new Set(bundle.supplier_products.map(product => product.id))
        const groupIds = new Set(bundle.supplier_product_groups.map(group => group.id))
        const missingProduct = bundle.supplier_product_bundles.flatMap(item => item.components).find(component => !productIds.has(component.product_id))
        if (missingProduct) throw new Error(`Bundle อ้างถึงสินค้า ${missingProduct.product_id} ที่ไม่มีใน Library`)
        const missingGroup = bundle.supplier_product_bundles.flatMap(item => item.components).find(component => component.product_group_id && !groupIds.has(component.product_group_id))
        if (missingGroup) throw new Error(`Bundle อ้างถึง Product Group ${missingGroup.product_group_id} ที่ไม่มีใน Library`)
        resolve(bundle)
      } catch (error) { reject(error) }
    }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่าน Company Library ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('อ่าน Company Library ถูกยกเลิก')) }
  })
}

/** Merge two validated device/team snapshots. Per-record updated_at selects the winner; equal timestamps follow the requested side. */
export function mergeLocalCompanyLibraryBundles(
  localValue: unknown,
  remoteValue: unknown,
  prefer: 'local' | 'remote' = 'local',
): LocalCompanyLibraryBundle {
  validateLocalCompanyLibraryBundle(localValue)
  validateLocalCompanyLibraryBundle(remoteValue)
  const local = localValue
  const remote = remoteValue
  const mergeRecords = <T extends { id: string; created_at: string; updated_at: string }>(localRecords: T[], remoteRecords: T[]): T[] => {
    const merged = new Map(localRecords.map(record => [record.id, structuredClone(record)]))
    for (const record of remoteRecords) {
      const previous = merged.get(record.id)
      if (!previous) {
        merged.set(record.id, structuredClone(record))
        continue
      }
      const localTime = Date.parse(previous.updated_at)
      const remoteTime = Date.parse(record.updated_at)
      const winner = remoteTime > localTime || (remoteTime === localTime && prefer === 'remote') ? record : previous
      const createdAt = Date.parse(previous.created_at) <= Date.parse(record.created_at) ? previous.created_at : record.created_at
      merged.set(record.id, { ...structuredClone(winner), created_at: createdAt })
    }
    return [...merged.values()]
  }
  const localPricingTime = local.pricing_settings_updated_at ? Date.parse(local.pricing_settings_updated_at) : null
  const remotePricingTime = remote.pricing_settings_updated_at ? Date.parse(remote.pricing_settings_updated_at) : null
  const useRemotePricing = remotePricingTime !== null && (localPricingTime === null || remotePricingTime > localPricingTime
    || (remotePricingTime === localPricingTime && prefer === 'remote'))
  const localCategoryOrderTime = local.supplier_category_order_updated_at ? Date.parse(local.supplier_category_order_updated_at) : null
  const remoteCategoryOrderTime = remote.supplier_category_order_updated_at ? Date.parse(remote.supplier_category_order_updated_at) : null
  const useRemoteCategoryOrder = remoteCategoryOrderTime !== null && (localCategoryOrderTime === null || remoteCategoryOrderTime > localCategoryOrderTime
    || (remoteCategoryOrderTime === localCategoryOrderTime && prefer === 'remote'))
    || (remoteCategoryOrderTime === null && localCategoryOrderTime === null && prefer === 'remote')
  const winningCategoryOrder = useRemoteCategoryOrder ? remote.supplier_category_order ?? [] : local.supplier_category_order ?? []
  const otherCategoryOrder = useRemoteCategoryOrder ? local.supplier_category_order ?? [] : remote.supplier_category_order ?? []
  const categoryOrderUpdatedAt = useRemoteCategoryOrder ? remote.supplier_category_order_updated_at : local.supplier_category_order_updated_at
  const supplierProducts = mergeRecords(local.supplier_products, remote.supplier_products)
  const supplierProductGroups = mergeRecords(local.supplier_product_groups ?? [], remote.supplier_product_groups ?? [])
  const supplierProductBundles = mergeRecords(local.supplier_product_bundles, remote.supplier_product_bundles)
  const supplierCategories = [
    ...supplierProducts.map(product => product.category?.trim() || 'ทั่วไป'),
    ...supplierProductBundles.map(bundle => bundle.category?.trim() || 'ทั่วไป'),
  ]
  const result: LocalCompanyLibraryBundle = {
    format: COMPANY_LIBRARY_BUNDLE_FORMAT,
    schema_version: 7,
    currency: 'THB',
    exported_at: new Date().toISOString(),
    pricing_settings: structuredClone((useRemotePricing ? remote.pricing_settings : local.pricing_settings)
      ?? remote.pricing_settings ?? local.pricing_settings ?? DEFAULT_SUPPLIER_PRODUCT_PRICING_SETTINGS),
    ...((useRemotePricing ? remote.pricing_settings_updated_at : local.pricing_settings_updated_at)
      ? { pricing_settings_updated_at: useRemotePricing ? remote.pricing_settings_updated_at : local.pricing_settings_updated_at }
      : {}),
    price_books: mergeRecords(local.price_books, remote.price_books),
    proposal_templates: mergeRecords(local.proposal_templates, remote.proposal_templates),
    discount_rules: mergeRecords(local.discount_rules ?? [], remote.discount_rules ?? []),
    field_form_templates: mergeRecords(local.field_form_templates ?? [], remote.field_form_templates ?? []),
    supplier_category_order: orderSupplierLibraryCategoryNames(supplierCategories, [...winningCategoryOrder, ...otherCategoryOrder]),
    ...(categoryOrderUpdatedAt ? { supplier_category_order_updated_at: categoryOrderUpdatedAt } : {}),
    supplier_products: supplierProducts,
    supplier_product_groups: supplierProductGroups,
    supplier_product_bundles: supplierProductBundles,
  }
  validateLocalCompanyLibraryBundle(result)
  return result
}

/** Merge a complete portable library atomically; UUID collisions update that record, natural-key collisions reject all writes. */
export async function importLocalCompanyLibraryBundle(value: unknown): Promise<LocalCompanyLibraryImportResult> {
  validateLocalCompanyLibraryBundle(value)
  const incoming = structuredClone(value)
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const storeNames = [TAKEOFF_PRICE_BOOK_STORE_NAME, PROPOSAL_TEMPLATE_STORE_NAME, FIELD_FORM_TEMPLATE_STORE_NAME, SUPPLIER_PRODUCT_STORE_NAME, SUPPLIER_PRODUCT_BUNDLE_STORE_NAME, SUPPLIER_PRODUCT_GROUP_STORE_NAME, COMPANY_PRICING_SETTINGS_STORE_NAME, DISCOUNT_RULE_STORE_NAME, SUPPLIER_CATEGORY_ORDER_STORE_NAME]
    const transaction = database.transaction(storeNames, 'readwrite')
    const stores = new Map(storeNames.map(name => [name, transaction.objectStore(name)]))
    const current = new Map<string, unknown[]>()
    let pending = storeNames.length
    let failure: Error | undefined
    const abort = (error: Error) => { failure ??= error; try { transaction.abort() } catch { /* Transaction may already have completed. */ } }
    const mergeById = <T extends { id: string; name: string; created_at: string }>(
      existing: T[], records: T[], label: string, maximum: number,
    ): T[] => {
      const merged = new Map(existing.map(record => [record.id, record]))
      for (const record of records) {
        const prior = merged.get(record.id)
        merged.set(record.id, { ...structuredClone(record), created_at: prior?.created_at ?? record.created_at })
      }
      if (merged.size > maximum) throw new Error(`นำเข้าแล้ว ${label} จะมีเกิน ${maximum} รายการ`)
      const names = new Map<string, string>()
      for (const record of merged.values()) {
        const name = record.name.trim().toLocaleLowerCase('th-TH')
        const owner = names.get(name)
        if (owner && owner !== record.id) throw new Error(`ชื่อ ${label} “${record.name}” ซ้ำกับ UUID อื่นใน Library`)
        names.set(name, record.id)
      }
      return [...merged.values()]
    }
    const mergeProducts = (existing: LocalSupplierProduct[], records: LocalSupplierProduct[]): LocalSupplierProduct[] => {
      const merged = new Map(existing.map(record => [record.id, record]))
      for (const record of records) {
        const prior = merged.get(record.id)
        merged.set(record.id, { ...structuredClone(record), created_at: prior?.created_at ?? record.created_at })
      }
      if (merged.size > 1000) throw new Error('นำเข้าแล้ว Supplier Product Library จะมีเกิน 1,000 รายการ')
      const skuOwners = new Map<string, string>()
      for (const product of merged.values()) {
        const key = `${product.supplier_name.trim().toLocaleLowerCase('th-TH')}\u0000${product.supplier_sku.trim().toLocaleLowerCase('th-TH')}`
        const owner = skuOwners.get(key)
        if (owner && owner !== product.id) throw new Error(`SKU ${product.supplier_sku} ของ ${product.supplier_name} ซ้ำกับ UUID อื่นใน Library`)
        skuOwners.set(key, product.id)
      }
      return [...merged.values()]
    }
    const mergeFieldFormTemplates = (existing: LocalFieldFormTemplate[], records: LocalFieldFormTemplate[]): LocalFieldFormTemplate[] => {
      const merged = new Map(existing.map(record => [record.id, record]))
      for (const record of records) {
        const prior = merged.get(record.id)
        merged.set(record.id, { ...structuredClone(record), created_at: prior?.created_at ?? record.created_at })
      }
      if (merged.size > 100) throw new Error('นำเข้าแล้ว Field Form Library จะมีเกิน 100 แม่แบบ')
      const titles = new Map<string, string>()
      for (const record of merged.values()) {
        const title = record.title.trim().toLocaleLowerCase('th-TH')
        const owner = titles.get(title)
        if (owner && owner !== record.id) throw new Error(`ชื่อแม่แบบฟอร์ม “${record.title}” ซ้ำกับ UUID อื่นใน Library`)
        titles.set(title, record.id)
      }
      return [...merged.values()]
    }
    const requests = new Map(storeNames.map(name => [name, stores.get(name)!.getAll()]))
    for (const [name, request] of requests) {
      request.onsuccess = () => {
        current.set(name, request.result as unknown[])
        pending -= 1
        if (pending !== 0 || failure) return
        try {
          const existingBooks = current.get(TAKEOFF_PRICE_BOOK_STORE_NAME) as LocalTakeoffPriceBook[]
          const existingTemplates = current.get(PROPOSAL_TEMPLATE_STORE_NAME) as LocalProposalTemplate[]
          const existingDiscountRules = current.get(DISCOUNT_RULE_STORE_NAME) as LocalDiscountRule[]
          const existingFieldTemplates = current.get(FIELD_FORM_TEMPLATE_STORE_NAME) as LocalFieldFormTemplate[]
          const existingProducts = current.get(SUPPLIER_PRODUCT_STORE_NAME) as LocalSupplierProduct[]
          const existingGroups = current.get(SUPPLIER_PRODUCT_GROUP_STORE_NAME) as LocalSupplierProductGroup[]
          const existingBundles = current.get(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME) as LocalSupplierProductBundle[]
          const existingPricingSettings = (current.get(COMPANY_PRICING_SETTINGS_STORE_NAME) as SupplierProductPricingSettings[])[0]
          const existingCategoryOrder = (current.get(SUPPLIER_CATEGORY_ORDER_STORE_NAME) as LocalSupplierLibraryCategoryOrder[])[0]
          existingBooks.forEach(validateLocalTakeoffPriceBook)
          existingTemplates.forEach(validateLocalProposalTemplate)
          existingDiscountRules.forEach(validateLocalDiscountRule)
          existingFieldTemplates.forEach(validateLocalFieldFormTemplate)
          existingProducts.forEach(validateSupplierProduct)
          existingGroups.forEach(group => validateSupplierProductGroupProducts(group, existingProducts))
          existingBundles.forEach(bundle => validateSupplierProductBundle(bundle, existingGroups))
          if (existingPricingSettings) validateSupplierProductPricingSettings(existingPricingSettings)
          const books = mergeById(existingBooks, incoming.price_books, 'Price book', 100)
          const templates = mergeById(existingTemplates, incoming.proposal_templates, 'แม่แบบข้อเสนอ', 100)
          const discountRules = mergeById(existingDiscountRules, incoming.discount_rules ?? [], 'กฎส่วนลด', 100)
          const fieldTemplates = mergeFieldFormTemplates(existingFieldTemplates, incoming.field_form_templates ?? [])
          const products = mergeProducts(existingProducts, incoming.supplier_products)
          const groups = mergeById(existingGroups, incoming.supplier_product_groups ?? [], 'Product Group', 500)
          const bundles = mergeById(existingBundles, incoming.supplier_product_bundles, 'Product Bundle', 500)
          groups.forEach(group => validateSupplierProductGroupProducts(group, products))
          const productIds = new Set(products.map(product => product.id))
          const dangling = bundles.flatMap(bundle => bundle.components).find(component => !productIds.has(component.product_id))
          if (dangling) throw new Error(`Product Bundle อ้างถึงสินค้า ${dangling.product_id} ที่ไม่มีทั้งในไฟล์และอุปกรณ์นี้`)
          bundles.forEach(bundle => validateSupplierProductBundle(bundle, groups))
          for (const item of incoming.price_books) stores.get(TAKEOFF_PRICE_BOOK_STORE_NAME)!.put(books.find(saved => saved.id === item.id)!, item.id)
          for (const item of incoming.proposal_templates) stores.get(PROPOSAL_TEMPLATE_STORE_NAME)!.put(templates.find(saved => saved.id === item.id)!, item.id)
          for (const item of incoming.discount_rules ?? []) stores.get(DISCOUNT_RULE_STORE_NAME)!.put(discountRules.find(saved => saved.id === item.id)!, item.id)
          for (const item of incoming.field_form_templates ?? []) stores.get(FIELD_FORM_TEMPLATE_STORE_NAME)!.put(fieldTemplates.find(saved => saved.id === item.id)!, item.id)
          for (const item of incoming.supplier_products) stores.get(SUPPLIER_PRODUCT_STORE_NAME)!.put(products.find(saved => saved.id === item.id)!, item.id)
          for (const item of incoming.supplier_product_groups ?? []) stores.get(SUPPLIER_PRODUCT_GROUP_STORE_NAME)!.put(groups.find(saved => saved.id === item.id)!, item.id)
          for (const item of incoming.supplier_product_bundles) stores.get(SUPPLIER_PRODUCT_BUNDLE_STORE_NAME)!.put(bundles.find(saved => saved.id === item.id)!, item.id)
          if (incoming.pricing_settings) stores.get(COMPANY_PRICING_SETTINGS_STORE_NAME)!.put({
            ...incoming.pricing_settings,
            updated_at: incoming.pricing_settings_updated_at ?? incoming.exported_at,
          }, COMPANY_PRICING_SETTINGS_KEY)
          if (incoming.schema_version >= 6 && incoming.supplier_category_order) {
            const localOrder = existingCategoryOrder ? normalizeSupplierLibraryCategoryOrder(existingCategoryOrder.categories) : []
            const importedOrder = normalizeSupplierLibraryCategoryOrder(incoming.supplier_category_order)
            const localTime = existingCategoryOrder?.updated_at ? Date.parse(existingCategoryOrder.updated_at) : null
            const importedTime = incoming.supplier_category_order_updated_at ? Date.parse(incoming.supplier_category_order_updated_at) : null
            const useImportedOrder = importedTime !== null && (localTime === null || importedTime >= localTime)
            const preferredOrder = useImportedOrder ? [...importedOrder, ...localOrder] : [...localOrder, ...importedOrder]
            const activeCategoryNames = [
              ...products.map(product => product.category?.trim() || 'ทั่วไป'),
              ...bundles.map(bundle => bundle.category?.trim() || 'ทั่วไป'),
            ]
            const orderRecord: LocalSupplierLibraryCategoryOrder = {
              id: 'default', categories: orderSupplierLibraryCategoryNames(activeCategoryNames, preferredOrder),
              ...((useImportedOrder ? incoming.supplier_category_order_updated_at : existingCategoryOrder?.updated_at)
                ? { updated_at: useImportedOrder ? incoming.supplier_category_order_updated_at : existingCategoryOrder?.updated_at }
                : {}),
            }
            stores.get(SUPPLIER_CATEGORY_ORDER_STORE_NAME)!.put(orderRecord, SUPPLIER_CATEGORY_ORDER_KEY)
          }
        } catch (error) { abort(error instanceof Error ? error : new Error('Company Library ตรวจสอบไม่ผ่าน')) }
      }
      request.onerror = () => abort(request.error ?? new Error(`อ่าน ${name} ไม่สำเร็จ`))
    }
    transaction.oncomplete = () => {
      database.close()
      resolve({ price_books: incoming.price_books.length, proposal_templates: incoming.proposal_templates.length, discount_rules: incoming.discount_rules?.length ?? 0, field_form_templates: incoming.field_form_templates?.length ?? 0, supplier_products: incoming.supplier_products.length, supplier_product_groups: incoming.supplier_product_groups?.length ?? 0, supplier_product_bundles: incoming.supplier_product_bundles.length })
    }
    transaction.onerror = () => { database.close(); reject(failure ?? transaction.error ?? new Error('นำเข้า Company Library ไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(failure ?? transaction.error ?? new Error('นำเข้า Company Library ถูกยกเลิก')) }
  })
}

/** Create an explicit offline checkpoint without coupling revisions to the active autosave slot. */
export async function createLocalProjectRevision(
  project: ProjectDocument,
  label: string,
  options: { notifyChanged?: boolean } = {},
): Promise<LocalProjectRevision> {
  const cleanLabel = label.trim().slice(0, 120)
  if (!cleanLabel) throw new Error('ตั้งชื่อเวอร์ชันก่อนบันทึก')
  const objects = Object.values(project.objects)
  const phaseCounts: Record<string, number> = { existing: 0, demolition: 0, new_construction: 0 }
  for (const object of objects) phaseCounts[object.created_phase] = (phaseCounts[object.created_phase] ?? 0) + 1
  const revision: LocalProjectRevision = {
    id: crypto.randomUUID(),
    project_id: project.project.id,
    label: cleanLabel,
    project_json: serializeProject(project),
    created_at: new Date().toISOString(),
    object_count: objects.length,
    level_count: project.levels.length,
    phase_counts: phaseCounts,
  }
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(REVISION_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(REVISION_STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => {
      const sameProject = (request.result as LocalProjectRevision[]).filter(item => item.project_id === revision.project_id)
      const retainedCheckpoints = [...sameProject, revision]
        // Keep the local checkpoint cap independent from transferred history.
        // Imported revisions and conflict snapshots are the recovery trail from other devices.
        .filter(item => !item.origin_device_id && !item.conflict_with_revision_ids?.length)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      const expiredIds = new Set(retainedCheckpoints.slice(30).map(item => item.id))
      for (const id of expiredIds) store.delete(id)
      store.put(revision, revision.id)
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('บันทึกเวอร์ชันในเครื่องไม่สำเร็จ'))
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('บันทึกเวอร์ชันในเครื่องถูกยกเลิก'))
  }).finally(() => database.close())
  if (options.notifyChanged !== false) notifyLocalProjectRevisionsChanged()
  return revision
}

export async function getLocalDeviceId(): Promise<string> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(LOCAL_DEVICE_ID_KEY)
      let deviceId = ''
      request.onsuccess = () => {
        const saved = request.result
        if (typeof saved === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) {
          deviceId = saved
          return
        }
        deviceId = crypto.randomUUID()
        store.put(deviceId, LOCAL_DEVICE_ID_KEY)
      }
      request.onerror = () => transaction.abort()
      transaction.oncomplete = () => resolve(deviceId)
      transaction.onerror = () => reject(transaction.error ?? new Error('อ่านรหัสอุปกรณ์ไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? new Error('สร้างรหัสอุปกรณ์ไม่สำเร็จ'))
    })
  } finally { database.close() }
}

function projectCommandSyncKey(projectId: string): string {
  return `live-command-sync:${projectId}`
}

function normalizeProjectCommandSyncState(projectId: string, value: unknown): LocalProjectCommandSyncState {
  if (value && typeof value === 'object') {
    const candidate = value as Partial<LocalProjectCommandSyncState>
    if (candidate.project_id === projectId
      && (candidate.cursor === null || Number.isSafeInteger(candidate.cursor) && candidate.cursor! >= 0)
      && typeof candidate.joined === 'boolean' && Array.isArray(candidate.pending)) {
      return {
        project_id: projectId,
        cursor: candidate.cursor ?? null,
        joined: candidate.joined,
        pending: candidate.pending.filter(item => item && typeof item.transaction_id === 'string' && Array.isArray(item.commands)),
        ...(typeof candidate.project_fingerprint === 'string' ? { project_fingerprint: candidate.project_fingerprint } : {}),
        ...(typeof candidate.baseline_expected_fingerprint === 'string' ? { baseline_expected_fingerprint: candidate.baseline_expected_fingerprint } : {}),
        ...(Number.isSafeInteger(candidate.joined_head) && candidate.joined_head! >= 0 ? { joined_head: candidate.joined_head } : {}),
        ...(typeof candidate.blocked_reason === 'string' ? { blocked_reason: candidate.blocked_reason } : {}),
        updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : new Date(0).toISOString(),
      }
    }
  }
  return { project_id: projectId, cursor: null, joined: false, pending: [], updated_at: new Date(0).toISOString() }
}

export async function loadLocalProjectCommandSyncState(projectId: string): Promise<LocalProjectCommandSyncState> {
  if (!projectId.trim()) throw new Error('ไม่พบ UUID โครงการสำหรับอ่านคิวซิงก์คำสั่ง')
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_SETTINGS_STORE_NAME, 'readonly')
      const request = transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).get(projectCommandSyncKey(projectId))
      request.onsuccess = () => resolve(normalizeProjectCommandSyncState(projectId, request.result))
      request.onerror = () => reject(request.error ?? new Error('อ่านคิวซิงก์คำสั่งไม่สำเร็จ'))
      transaction.onerror = () => reject(transaction.error ?? new Error('อ่านคิวซิงก์คำสั่งไม่สำเร็จ'))
    })
  } finally { database.close() }
}

export async function updateLocalProjectCommandSyncState(
  projectId: string,
  update: (current: LocalProjectCommandSyncState) => LocalProjectCommandSyncState,
): Promise<LocalProjectCommandSyncState> {
  if (!projectId.trim()) throw new Error('ไม่พบ UUID โครงการสำหรับบันทึกคิวซิงก์คำสั่ง')
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_SETTINGS_STORE_NAME, 'readwrite')
      const store = transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME)
      const key = projectCommandSyncKey(projectId)
      const request = store.get(key)
      let nextState: LocalProjectCommandSyncState | undefined
      request.onsuccess = () => {
        try {
          const current = normalizeProjectCommandSyncState(projectId, request.result)
          nextState = { ...update(current), project_id: projectId, updated_at: new Date().toISOString() }
          store.put(nextState, key)
        } catch (error) {
          transaction.abort()
          reject(error)
        }
      }
      request.onerror = () => transaction.abort()
      transaction.oncomplete = () => resolve(nextState!)
      transaction.onerror = () => reject(transaction.error ?? new Error('บันทึกคิวซิงก์คำสั่งไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('บันทึกคิวซิงก์คำสั่งถูกยกเลิก'))
    })
  } finally { database.close() }
}

export async function enqueueLocalProjectCommandTransactions(
  projectId: string,
  incoming: ProjectCommandTransaction[],
): Promise<LocalProjectCommandSyncState> {
  return updateLocalProjectCommandSyncState(projectId, current => {
    const pending = [...current.pending]
    const byId = new Map(pending.map((item, index) => [item.transaction_id, index]))
    for (const item of incoming) {
      const existingIndex = byId.get(item.transaction_id)
      if (existingIndex === undefined) {
        byId.set(item.transaction_id, pending.length)
        pending.push(structuredClone(item))
      } else if (JSON.stringify(pending[existingIndex].commands) !== JSON.stringify(item.commands)
        || pending[existingIndex].project_fingerprint !== item.project_fingerprint) {
        throw new Error(`รหัส transaction ${item.transaction_id} ซ้ำแต่เนื้อหาคำสั่งไม่ตรงกัน`)
      }
    }
    return { ...current, pending }
  })
}

/** Build a portable, project-scoped copy of the local offline revision history. */
export async function exportLocalProjectRevisionBundle(projectId: string): Promise<LocalProjectRevisionBundle> {
  if (!projectId.trim()) throw new Error('ไม่พบ UUID โครงการสำหรับส่งออกประวัติ')
  const [revisions, sourceDeviceId] = await Promise.all([
    listLocalProjectRevisions(projectId), getLocalDeviceId(),
  ])
  if (!revisions.length) throw new Error('โครงการนี้ยังไม่มีเวอร์ชันสำหรับส่งออก')
  if (revisions.length > MAX_REVISION_BUNDLE_ITEMS) throw new Error('ประวัติมีมากกว่า 500 เวอร์ชัน กรุณาแยกส่งออกก่อน')
  return {
    format: PROJECT_REVISION_BUNDLE_FORMAT,
    schema_version: 1,
    project_id: projectId,
    source_device_id: sourceDeviceId,
    exported_at: new Date().toISOString(),
    revisions,
  }
}

const REVISION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getProjectRevisionCounts(project: ProjectDocument) {
  const objects = Object.values(project.objects)
  const phaseCounts: Record<string, number> = { existing: 0, demolition: 0, new_construction: 0 }
  for (const object of objects) phaseCounts[object.created_phase] = (phaseCounts[object.created_phase] ?? 0) + 1
  return { object_count: objects.length, level_count: project.levels.length, phase_counts: phaseCounts }
}

/** Validate every embedded project before the atomic IndexedDB merge starts. */
export async function importLocalProjectRevisionBundle(
  projectId: string,
  value: unknown,
  options: { notifyChanged?: boolean } = {},
): Promise<LocalProjectRevisionImportResult> {
  if (!isRecord(value) || value.format !== PROJECT_REVISION_BUNDLE_FORMAT || value.schema_version !== 1)
    throw new Error('ไฟล์นี้ไม่ใช่ Project Revision Bundle ของ ConstructFlow')
  if (value.project_id !== projectId) throw new Error('ไฟล์ประวัตินี้เป็นของโครงการ UUID อื่น')
  if (typeof value.source_device_id !== 'string' || !REVISION_UUID_PATTERN.test(value.source_device_id))
    throw new Error('ไม่พบรหัสอุปกรณ์ต้นทางที่ถูกต้องในไฟล์')
  if (!Array.isArray(value.revisions) || value.revisions.length === 0 || value.revisions.length > MAX_REVISION_BUNDLE_ITEMS)
    throw new Error('ไฟล์ต้องมีประวัติ 1–500 เวอร์ชัน')

  const [projectModel, domainProviders, commandRuntime] = await Promise.all([
    import('@constructflow/project-model'), import('@constructflow/domain-providers'), import('./commands/CommandBus.js'),
  ])
  let totalSnapshotBytes = 0
  const incoming: LocalProjectRevision[] = []
  for (const [index, item] of value.revisions.entries()) {
    if (!isRecord(item) || typeof item.id !== 'string' || !REVISION_UUID_PATTERN.test(item.id))
      throw new Error(`เวอร์ชันที่ ${index + 1} มี UUID ไม่ถูกต้อง`)
    if (item.project_id !== projectId) throw new Error(`เวอร์ชันที่ ${index + 1} อ้างอิงโครงการคนละ UUID`)
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 120)
      throw new Error(`เวอร์ชันที่ ${index + 1} มีชื่อไม่ถูกต้อง`)
    if (typeof item.created_at !== 'string' || !Number.isFinite(Date.parse(item.created_at)))
      throw new Error(`เวอร์ชันที่ ${index + 1} มีวันที่ไม่ถูกต้อง`)
    if (typeof item.project_json !== 'string' || !item.project_json.trim())
      throw new Error(`เวอร์ชันที่ ${index + 1} ไม่มี project snapshot`)
    totalSnapshotBytes += new Blob([item.project_json]).size
    if (totalSnapshotBytes > MAX_REVISION_BUNDLE_BYTES) throw new Error('ข้อมูล project snapshot รวมกันต้องไม่เกิน 100 MB')
    try {
      const project = commandRuntime.CommandBus.migrateProject(projectModel.deserializeProject(item.project_json))
      domainProviders.validateConstructionProject(project)
      if (project.project.id !== projectId) throw new Error('UUID ใน project snapshot ไม่ตรงกับโครงการ')
      const extra = item.conflict_with_revision_ids
      if (extra !== undefined && (!Array.isArray(extra) || extra.some(id => typeof id !== 'string' || !REVISION_UUID_PATTERN.test(id))))
        throw new Error('รายการอ้างอิง conflict มี UUID ไม่ถูกต้อง')
      if (item.source_revision_id !== undefined && (typeof item.source_revision_id !== 'string' || !REVISION_UUID_PATTERN.test(item.source_revision_id)))
        throw new Error('UUID เวอร์ชันต้นทางไม่ถูกต้อง')
      if (item.origin_device_id !== undefined && (typeof item.origin_device_id !== 'string' || !REVISION_UUID_PATTERN.test(item.origin_device_id)))
        throw new Error('UUID อุปกรณ์ต้นทางของเวอร์ชันไม่ถูกต้อง')
      const canonical = projectModel.serializeProject(project)
      incoming.push({
        id: item.id, project_id: projectId, label: item.label.trim(), project_json: canonical,
        created_at: item.created_at, ...getProjectRevisionCounts(project),
        ...(typeof item.origin_device_id === 'string' ? { origin_device_id: item.origin_device_id } : {}),
        ...(typeof item.source_revision_id === 'string' ? { source_revision_id: item.source_revision_id } : {}),
        ...(Array.isArray(extra) && extra.length ? { conflict_with_revision_ids: [...new Set(extra as string[])] } : {}),
      })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      throw new Error(`ตรวจเวอร์ชันที่ ${index + 1} ไม่ผ่าน: ${message}`)
    }
  }

  const database = await openDatabase()
  try {
    const result = await new Promise<LocalProjectRevisionImportResult>((resolve, reject) => {
      const transaction = database.transaction(REVISION_STORE_NAME, 'readwrite')
      const store = transaction.objectStore(REVISION_STORE_NAME)
      const request = store.getAll()
      const result: LocalProjectRevisionImportResult = { imported: 0, deduplicated: 0, conflicts: 0, revision_ids: [] }
      request.onsuccess = () => {
        const existing = request.result as LocalProjectRevision[]
        const byId = new Map(existing.map(revision => [revision.id, revision]))
        const takenIds = new Set(byId.keys())
        for (const source of incoming) {
          const collision = byId.get(source.id)
          const sourceIdentity = source.source_revision_id ?? source.id
          const sameSourceSnapshot = collision?.project_id === projectId && collision.project_json === source.project_json
            ? collision
            : [...byId.values()].find(revision => revision.project_id === projectId
              && (revision.source_revision_id ?? revision.id) === sourceIdentity
              && revision.project_json === source.project_json)
          if (sameSourceSnapshot) {
            const conflictIds = [...new Set([...(sameSourceSnapshot.conflict_with_revision_ids ?? []), ...(source.conflict_with_revision_ids ?? [])])]
            const paired = {
              ...sameSourceSnapshot,
              ...(source.source_revision_id ? { source_revision_id: sameSourceSnapshot.source_revision_id ?? source.source_revision_id } : {}),
              ...(source.origin_device_id ? { origin_device_id: sameSourceSnapshot.origin_device_id ?? source.origin_device_id } : {}),
              ...(conflictIds.length ? { conflict_with_revision_ids: conflictIds } : {}),
            }
            if (conflictIds.length !== (sameSourceSnapshot.conflict_with_revision_ids?.length ?? 0)
              || paired.source_revision_id !== sameSourceSnapshot.source_revision_id
              || paired.origin_device_id !== sameSourceSnapshot.origin_device_id) {
              byId.set(paired.id, paired)
              store.put(paired, paired.id)
            }
            result.deduplicated += 1
            continue
          }

          const stored: LocalProjectRevision = {
            ...source,
            origin_device_id: source.origin_device_id ?? value.source_device_id as string,
          }
          if (takenIds.has(source.id)) {
            const conflictId = source.id
            const cloneId = crypto.randomUUID()
            stored.id = cloneId
            stored.source_revision_id = source.source_revision_id ?? source.id
            const local = byId.get(conflictId)
            if (local?.project_id === projectId) {
              stored.conflict_with_revision_ids = [...new Set([...(source.conflict_with_revision_ids ?? []), conflictId])]
              const paired = { ...local, conflict_with_revision_ids: [...new Set([...(local.conflict_with_revision_ids ?? []), cloneId])] }
              byId.set(conflictId, paired)
              store.put(paired, paired.id)
              result.conflicts += 1
            }
          }
          takenIds.add(stored.id)
          byId.set(stored.id, stored)
          store.put(stored, stored.id)
          result.imported += 1
          result.revision_ids.push(stored.id)
        }
      }
      request.onerror = () => transaction.abort()
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(transaction.error ?? new Error('รวมประวัติเวอร์ชันไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? new Error('รวมประวัติเวอร์ชันถูกยกเลิก'))
    })
    if (options.notifyChanged !== false && (result.imported || result.conflicts)) notifyLocalProjectRevisionsChanged()
    return result
  } finally { database.close() }
}

export async function listLocalProjectRevisions(projectId: string): Promise<LocalProjectRevision[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(REVISION_STORE_NAME, 'readonly')
    const request = transaction.objectStore(REVISION_STORE_NAME).getAll()
    request.onsuccess = () => resolve((request.result as LocalProjectRevision[])
      .filter(revision => revision.project_id === projectId)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)))
    request.onerror = () => reject(request.error ?? new Error('อ่านประวัติเวอร์ชันไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่านประวัติเวอร์ชันไม่สำเร็จ')) }
  })
}

export async function loadLocalProjectRevision(revisionId: string): Promise<ProjectDocument> {
  const database = await openDatabase()
  const record = await new Promise<LocalProjectRevision>((resolve, reject) => {
    const transaction = database.transaction(REVISION_STORE_NAME, 'readonly')
    const request = transaction.objectStore(REVISION_STORE_NAME).get(revisionId)
    request.onsuccess = () => request.result ? resolve(request.result as LocalProjectRevision) : reject(new Error('ไม่พบเวอร์ชันโครงการนี้'))
    request.onerror = () => reject(request.error ?? new Error('อ่านเวอร์ชันโครงการไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่านเวอร์ชันโครงการไม่สำเร็จ')) }
  })
  const [projectModel, domainProviders, commandRuntime] = await Promise.all([
    import('@constructflow/project-model'), import('@constructflow/domain-providers'), import('./commands/CommandBus.js'),
  ])
  const project = commandRuntime.CommandBus.migrateProject(projectModel.deserializeProject(record.project_json))
  domainProviders.validateConstructionProject(project)
  if (project.project.id !== record.project_id) throw new Error('เวอร์ชันนี้อ้างอิงโครงการคนละ UUID')
  return project
}

/** Keep a local, recoverable audit trail of file handoffs to downstream tools. */
export async function recordLocalIntegrationActivity(
  input: Omit<LocalIntegrationActivity, 'id' | 'created_at'> & { id?: string; created_at?: string },
): Promise<LocalIntegrationActivity> {
  if (!input.project_id.trim() || !input.artifact_name.trim() || !input.message.trim())
    throw new Error('ข้อมูลประวัติการส่งออกไม่ครบ')
  if (input.connector_id === 'zapier' || input.connector_id === 'webhook') {
    const provider = input.connector_id === 'zapier' ? 'Zapier' : 'Custom webhook'
    if (!input.event_id || !/^[0-9a-f-]{36}$/i.test(input.event_id) || input.id !== input.event_id)
      throw new Error(`${provider} event ต้องมี UUID ที่คงเดิมระหว่างส่งซ้ำ`)
    if (!input.target_url || input.target_url.length > 2048) throw new Error(`${provider} URL ไม่ถูกต้อง`)
    if (!input.payload_json || input.payload_json.length > 1_000_000) throw new Error('ข้อมูล webhook ว่างหรือเกิน 1 MB')
    try { JSON.parse(input.payload_json) } catch { throw new Error('ข้อมูล webhook ไม่ใช่ JSON ที่ถูกต้อง') }
  }
  const activity: LocalIntegrationActivity = { ...input, id: input.id ?? crypto.randomUUID(), created_at: input.created_at ?? new Date().toISOString() }
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_ACTIVITY_STORE_NAME, 'readwrite')
      const store = transaction.objectStore(INTEGRATION_ACTIVITY_STORE_NAME)
      const request = store.getAll()
      request.onsuccess = () => {
        const sameProject = [...(request.result as LocalIntegrationActivity[]), activity]
          .filter(item => item.project_id === activity.project_id)
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        for (const stale of sameProject.slice(50)) store.delete(stale.id)
        store.put(activity, activity.id)
      }
      request.onerror = () => transaction.abort()
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('บันทึกประวัติ integration ไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? new Error('บันทึกประวัติ integration ถูกยกเลิก'))
    })
    return activity
  } finally { database.close() }
}

function validateZapierWebhookUrl(value: string): string {
  const text = value.trim()
  if (!text || text.length > 2048) throw new Error('วาง Zapier Catch Hook URL ที่ถูกต้อง')
  let parsed: URL
  try { parsed = new URL(text) } catch { throw new Error('รูปแบบ Zapier webhook URL ไม่ถูกต้อง') }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'hooks.zapier.com'
    || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash
    || !/^\/hooks\/catch\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname))
    throw new Error('ใช้ได้เฉพาะ HTTPS Zapier Catch Hook URL รูปแบบ hooks.zapier.com/hooks/catch/...')
  return parsed.toString()
}

/** Save one device-local Zapier Catch Hook. The URL itself is a bearer secret. */
export async function saveLocalZapierWebhook(url: string): Promise<LocalZapierWebhookSettings> {
  const settings: LocalZapierWebhookSettings = { id: 'zapier', url: validateZapierWebhookUrl(url), updated_at: new Date().toISOString() }
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_SETTINGS_STORE_NAME, 'readwrite')
      transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).put(settings, settings.id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('บันทึก Zapier webhook ไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? new Error('บันทึก Zapier webhook ถูกยกเลิก'))
    })
    return settings
  } finally { database.close() }
}

export async function getLocalZapierWebhook(): Promise<LocalZapierWebhookSettings | null> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_SETTINGS_STORE_NAME, 'readonly')
      const request = transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).get('zapier')
      request.onsuccess = () => {
        if (!request.result) { resolve(null); return }
        const settings = request.result as LocalZapierWebhookSettings
        try { resolve({ ...settings, url: validateZapierWebhookUrl(settings.url) }) }
        catch { reject(new Error('Zapier webhook URL ที่บันทึกไว้ไม่ถูกต้อง กรุณาตั้งค่าใหม่')) }
      }
      request.onerror = () => reject(request.error ?? new Error('อ่าน Zapier webhook ไม่สำเร็จ'))
      transaction.onerror = () => reject(transaction.error ?? new Error('อ่าน Zapier webhook ไม่สำเร็จ'))
    })
  } finally { database.close() }
}

function validateCustomWebhookUrl(value: string): string {
  const text = value.trim()
  if (!text || text.length > 2048) throw new Error('กรอก URL ปลายทาง HTTPS ที่ gateway อนุญาต')
  let parsed: URL
  try { parsed = new URL(text) } catch { throw new Error('รูปแบบ webhook URL ไม่ถูกต้อง') }
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password || parsed.hash || !parsed.hostname.includes('.'))
    throw new Error('Webhook ต้องใช้ HTTPS บนชื่อโดเมนสาธารณะ และไม่รองรับ credential ใน URL')
  return parsed.toString()
}

/** Store the user-owned receiver URL and signing key only in this device's IndexedDB. */
export async function saveLocalCustomWebhook(url: string, signingSecret: string): Promise<LocalCustomWebhookSettings> {
  const secret = signingSecret.trim()
  if (secret.length < 32 || new TextEncoder().encode(secret).byteLength > 512)
    throw new Error('Signing secret ต้องมีความยาว 32–512 bytes')
  const settings: LocalCustomWebhookSettings = {
    id: 'custom-webhook', url: validateCustomWebhookUrl(url), signing_secret: secret, updated_at: new Date().toISOString(),
  }
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_SETTINGS_STORE_NAME, 'readwrite')
      transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).put(settings, settings.id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('บันทึก custom webhook ไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? new Error('บันทึก custom webhook ถูกยกเลิก'))
    })
    return settings
  } finally { database.close() }
}

export async function getLocalCustomWebhook(): Promise<LocalCustomWebhookSettings | null> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_SETTINGS_STORE_NAME, 'readonly')
      const request = transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).get('custom-webhook')
      request.onsuccess = () => {
        const settings = request.result as LocalCustomWebhookSettings | undefined
        if (!settings) { resolve(null); return }
        try {
          if (typeof settings.signing_secret !== 'string' || new TextEncoder().encode(settings.signing_secret).byteLength < 32 || new TextEncoder().encode(settings.signing_secret).byteLength > 512)
            throw new Error('Signing secret ไม่ถูกต้อง')
          resolve({ ...settings, url: validateCustomWebhookUrl(settings.url) })
        } catch { reject(new Error('Custom webhook ที่บันทึกไว้ไม่ถูกต้อง กรุณาตั้งค่าใหม่')) }
      }
      request.onerror = () => reject(request.error ?? new Error('อ่าน custom webhook ไม่สำเร็จ'))
      transaction.onerror = () => reject(transaction.error ?? new Error('อ่าน custom webhook ไม่สำเร็จ'))
    })
  } finally { database.close() }
}

/** Remove device-local webhook credentials and frozen business payloads. */
export async function deleteLocalCustomWebhook(): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([INTEGRATION_SETTINGS_STORE_NAME, INTEGRATION_ACTIVITY_STORE_NAME], 'readwrite')
      transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).delete('custom-webhook')
      const activityStore = transaction.objectStore(INTEGRATION_ACTIVITY_STORE_NAME)
      const request = activityStore.getAll()
      request.onsuccess = () => {
        for (const activity of request.result as LocalIntegrationActivity[]) {
          if (activity.connector_id === 'webhook') activityStore.delete(activity.id)
        }
      }
      request.onerror = () => transaction.abort()
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('ลบ custom webhook ไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? new Error('ลบ custom webhook ถูกยกเลิก'))
    })
  } finally { database.close() }
}

/** Keep the team bearer credential on this device; it is never embedded in a project or revision bundle. */
export async function saveLocalCollaborationToken(token: string): Promise<LocalCollaborationSettings> {
  const value = token.trim()
  if (value.length < 32 || value.length > 512) throw new Error('โทเคนทีมต้องมีความยาว 32–512 ตัวอักษร')
  const settings: LocalCollaborationSettings = { id: 'collaboration', token: value, updated_at: new Date().toISOString() }
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_SETTINGS_STORE_NAME, 'readwrite')
      transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).put(settings, settings.id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('บันทึกโทเคนทีมไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? new Error('บันทึกโทเคนทีมถูกยกเลิก'))
    })
    notifyCollaborationTokenChanged()
    return settings
  } finally { database.close() }
}

export async function getLocalCollaborationToken(): Promise<LocalCollaborationSettings | null> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_SETTINGS_STORE_NAME, 'readonly')
      const request = transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).get('collaboration')
      request.onsuccess = () => {
        const settings = request.result as LocalCollaborationSettings | undefined
        resolve(settings && typeof settings.token === 'string' && settings.token.length >= 32 ? settings : null)
      }
      request.onerror = () => reject(request.error ?? new Error('อ่านโทเคนทีมไม่สำเร็จ'))
      transaction.onerror = () => reject(transaction.error ?? new Error('อ่านโทเคนทีมไม่สำเร็จ'))
    })
  } finally { database.close() }
}

export async function deleteLocalCollaborationToken(): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_SETTINGS_STORE_NAME, 'readwrite')
      transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).delete('collaboration')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('ลบโทเคนทีมไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? new Error('ลบโทเคนทีมถูกยกเลิก'))
    })
    notifyCollaborationTokenChanged()
  } finally { database.close() }
}

/** Remove the local URL and its frozen outbound payloads, while keeping CAD/BIM export history. */
export async function deleteLocalZapierWebhook(): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([INTEGRATION_SETTINGS_STORE_NAME, INTEGRATION_ACTIVITY_STORE_NAME], 'readwrite')
      transaction.objectStore(INTEGRATION_SETTINGS_STORE_NAME).delete('zapier')
      const activityStore = transaction.objectStore(INTEGRATION_ACTIVITY_STORE_NAME)
      const request = activityStore.getAll()
      request.onsuccess = () => {
        for (const activity of request.result as LocalIntegrationActivity[]) {
          if (activity.connector_id === 'zapier') activityStore.delete(activity.id)
        }
      }
      request.onerror = () => transaction.abort()
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('ลบ Zapier webhook ไม่สำเร็จ'))
      transaction.onabort = () => reject(transaction.error ?? new Error('ลบ Zapier webhook ถูกยกเลิก'))
    })
  } finally { database.close() }
}

export async function listLocalIntegrationActivity(projectId: string): Promise<LocalIntegrationActivity[]> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(INTEGRATION_ACTIVITY_STORE_NAME, 'readonly')
      const request = transaction.objectStore(INTEGRATION_ACTIVITY_STORE_NAME).getAll()
      request.onsuccess = () => resolve((request.result as LocalIntegrationActivity[])
        .filter(item => item.project_id === projectId)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)))
      request.onerror = () => reject(request.error ?? new Error('อ่านประวัติ integration ไม่สำเร็จ'))
      transaction.onerror = () => reject(transaction.error ?? new Error('อ่านประวัติ integration ไม่สำเร็จ'))
      transaction.oncomplete = () => database.close()
    })
  } catch (error) {
    database.close()
    throw error
  }
}

export async function loadLocalProjectSnapshot(): Promise<LoadedLocalProjectSnapshot | null> {
  const snapshot = await loadSnapshotAtKey(ACTIVE_PROJECT_KEY)
  if (!snapshot) return null
  try {
    // Upgrade the pre-library single-active snapshot without delaying recovery if
    // the browser refuses an IndexedDB write during startup.
    if (!await hasProjectSnapshotRecord(snapshot.project.project.id)) {
      await saveLocalProjectSnapshot({
        projectJson: snapshot.projectJson,
        savedProjectJson: snapshot.savedProjectJson,
        replacementBaselineJson: snapshot.replacementBaselineJson,
        fileHandle: snapshot.fileHandle,
      })
    }
  } catch (error) {
    console.warn('Unable to index the recovered local project snapshot', error)
  }
  return snapshot
}

export async function loadLocalProjectSnapshotById(projectId: string): Promise<LoadedLocalProjectSnapshot | null> {
  const keyed = await loadSnapshotAtKey(projectSnapshotKey(projectId))
  if (keyed) return keyed
  const active = await loadSnapshotAtKey(ACTIVE_PROJECT_KEY)
  return active?.project.project.id === projectId ? active : null
}

async function loadSnapshotAtKey(key: string): Promise<LoadedLocalProjectSnapshot | null> {
  const database = await openDatabase()
  const value = await new Promise<LocalProjectSnapshot | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(key)
    request.onsuccess = () => {
      const record = request.result as LocalProjectSnapshot | ActiveProjectPointer | undefined
      if (key === ACTIVE_PROJECT_KEY && isActiveProjectPointer(record)) {
        const activeSnapshotRequest = store.get(projectSnapshotKey(record.project_id))
        activeSnapshotRequest.onsuccess = () => {
          const activeSnapshot = activeSnapshotRequest.result as LocalProjectSnapshot | undefined
          resolve(activeSnapshot && typeof activeSnapshot.projectJson === 'string' ? activeSnapshot : null)
        }
        activeSnapshotRequest.onerror = () => reject(activeSnapshotRequest.error ?? new Error('อ่านงานที่เปิดล่าสุดไม่สำเร็จ'))
        return
      }
      resolve(record && typeof (record as LocalProjectSnapshot).projectJson === 'string' ? record as LocalProjectSnapshot : null)
    }
    request.onerror = () => reject(request.error ?? new Error('อ่านงานที่บันทึกในเครื่องไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่านงานที่บันทึกในเครื่องไม่สำเร็จ')) }
  })
  if (!value) return null
  try {
    const [projectModel, domainProviders, commandRuntime] = await Promise.all([
      import('@constructflow/project-model'),
      import('@constructflow/domain-providers'),
      import('./commands/CommandBus.js'),
    ])
    // Never let an invalid/stale browser snapshot replace the valid current document.
    const project = commandRuntime.CommandBus.migrateProject(projectModel.deserializeProject(value.projectJson))
    domainProviders.validateConstructionProject(project)
    return {
      projectJson: value.projectJson,
      project,
      savedProjectJson: typeof value.savedProjectJson === 'string' ? value.savedProjectJson : null,
      replacementBaselineJson: typeof value.replacementBaselineJson === 'string' ? value.replacementBaselineJson : null,
      fileHandle: isProjectFileHandle(value.fileHandle) ? value.fileHandle : null,
      savedAt: Number.isFinite(value.savedAt) ? value.savedAt : Date.now(),
    }
  } catch (error) {
    throw error
  }
}

function isProjectFileHandle(value: unknown): value is LocalProjectFileHandle {
  if (!value || typeof value !== 'object') return false
  const handle = value as Partial<LocalProjectFileHandle>
  return typeof handle.getFile === 'function' && typeof handle.createWritable === 'function'
}

export async function saveLocalProjectSnapshot(snapshot: Omit<LocalProjectSnapshot, 'savedAt'>): Promise<void> {
  const identity = readProjectLibraryIdentity(snapshot.projectJson)
  const savedAt = Date.now()
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, PROJECT_LIBRARY_STORE_NAME], 'readwrite')
    const fileHandle = snapshot.fileHandle ? cloneFileHandle(snapshot.fileHandle) : null
    const stored = { ...snapshot, fileHandle, savedAt } satisfies LocalProjectSnapshot
    const snapshotStore = transaction.objectStore(STORE_NAME)
    snapshotStore.put(stored, projectSnapshotKey(identity.project_id))
    snapshotStore.put({ kind: ACTIVE_PROJECT_POINTER_KIND, project_id: identity.project_id } satisfies ActiveProjectPointer, ACTIVE_PROJECT_KEY)
    const libraryStore = transaction.objectStore(PROJECT_LIBRARY_STORE_NAME)
    const currentRequest = libraryStore.get(identity.project_id)
    currentRequest.onsuccess = () => {
      const current = currentRequest.result as LocalProjectLibraryEntry | undefined
      libraryStore.put({
        ...identity,
        saved_at: savedAt,
        archived: current?.archived === true,
        tags: normalizeProjectTags(current?.tags ?? []),
      } satisfies LocalProjectLibraryEntry, identity.project_id)
    }
    currentRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึกงานในเครื่องไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึกงานในเครื่องถูกยกเลิก')) }
  })
}

export async function listLocalProjectLibrary(): Promise<LocalProjectLibraryEntry[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, PROJECT_LIBRARY_STORE_NAME], 'readonly')
    const entriesRequest = transaction.objectStore(PROJECT_LIBRARY_STORE_NAME).getAll()
    const snapshotStore = transaction.objectStore(STORE_NAME)
    const activeRequest = snapshotStore.get(ACTIVE_PROJECT_KEY)
    let activeSnapshot: LocalProjectSnapshot | undefined
    activeRequest.onsuccess = () => {
      const activeRecord = activeRequest.result as LocalProjectSnapshot | ActiveProjectPointer | undefined
      if (isActiveProjectPointer(activeRecord)) {
        const pointedSnapshotRequest = snapshotStore.get(projectSnapshotKey(activeRecord.project_id))
        pointedSnapshotRequest.onsuccess = () => { activeSnapshot = pointedSnapshotRequest.result as LocalProjectSnapshot | undefined }
        pointedSnapshotRequest.onerror = () => transaction.abort()
      } else activeSnapshot = activeRecord as LocalProjectSnapshot | undefined
    }
    transaction.oncomplete = () => {
      database.close()
      const entries = entriesRequest.result as LocalProjectLibraryEntry[]
      if (activeSnapshot && typeof activeSnapshot.projectJson === 'string') {
        try {
          const identity = readProjectLibraryIdentity(activeSnapshot.projectJson)
          if (!entries.some(entry => entry.project_id === identity.project_id)) entries.push({
            ...identity, saved_at: activeSnapshot.savedAt || Date.now(), archived: false, tags: [],
          })
        } catch { /* Leave an invalid legacy snapshot visible only through recovery diagnostics. */ }
      }
      resolve(entries.sort((a, b) => Number(a.archived) - Number(b.archived) || b.saved_at - a.saved_at))
    }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อ่านคลังโครงการในเครื่องไม่สำเร็จ')) }
    entriesRequest.onerror = () => transaction.abort()
    activeRequest.onerror = () => transaction.abort()
  })
}

export async function updateLocalProjectLibraryEntry(
  projectId: string,
  changes: Partial<Pick<LocalProjectLibraryEntry, 'archived' | 'tags'>>,
): Promise<LocalProjectLibraryEntry> {
  const entries = await listLocalProjectLibrary()
  const current = entries.find(entry => entry.project_id === projectId)
  if (!current) throw new Error('ไม่พบโครงการนี้ในคลังของอุปกรณ์')
  const updated: LocalProjectLibraryEntry = {
    ...current,
    archived: changes.archived === undefined ? current.archived : changes.archived === true,
    tags: changes.tags === undefined ? current.tags : normalizeProjectTags(changes.tags),
  }
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROJECT_LIBRARY_STORE_NAME, 'readwrite')
    transaction.objectStore(PROJECT_LIBRARY_STORE_NAME).put(updated, projectId)
    transaction.oncomplete = () => { database.close(); resolve(updated) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('อัปเดตข้อมูลจัดหมวดโครงการไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('อัปเดตข้อมูลจัดหมวดโครงการถูกยกเลิก')) }
  })
}

function projectSnapshotKey(projectId: string) { return `project:${projectId}` }

async function hasProjectSnapshotRecord(projectId: string): Promise<boolean> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(projectSnapshotKey(projectId))
    request.onsuccess = () => resolve(Boolean(request.result && typeof (request.result as LocalProjectSnapshot).projectJson === 'string'))
    request.onerror = () => reject(request.error ?? new Error('ตรวจสอบ snapshot ในคลังโครงการไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('ตรวจสอบ snapshot ในคลังโครงการไม่สำเร็จ')) }
  })
}

function isActiveProjectPointer(value: unknown): value is ActiveProjectPointer {
  return Boolean(value && typeof value === 'object'
    && (value as Partial<ActiveProjectPointer>).kind === ACTIVE_PROJECT_POINTER_KIND
    && typeof (value as Partial<ActiveProjectPointer>).project_id === 'string')
}

function normalizeProjectTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const raw of tags) {
    if (typeof raw !== 'string') continue
    const label = raw.trim().replace(/\s+/g, ' ').slice(0, 32)
    const key = label.toLocaleLowerCase()
    if (!label || seen.has(key)) continue
    seen.add(key)
    normalized.push(label)
    if (normalized.length === 12) break
  }
  return normalized
}

function readProjectLibraryIdentity(projectJson: string): Omit<LocalProjectLibraryEntry, 'saved_at' | 'archived' | 'tags'> {
  const value = JSON.parse(projectJson) as { project?: { id?: unknown; name?: unknown; updated_at?: unknown }; objects?: unknown; levels?: unknown }
  const project = value.project
  const projectId = project?.id
  if (!project || typeof projectId !== 'string' || !projectId.trim()) throw new Error('Snapshot ไม่มี Project UUID ที่ใช้ทำดัชนีได้')
  const name = typeof project.name === 'string' && project.name.trim() ? project.name.trim() : 'โครงการไม่มีชื่อ'
  const updatedAt = typeof project.updated_at === 'string' ? project.updated_at : new Date().toISOString()
  return {
    project_id: projectId,
    name,
    updated_at: updatedAt,
    object_count: value.objects && typeof value.objects === 'object' ? Object.keys(value.objects).length : 0,
    level_count: Array.isArray(value.levels) ? value.levels.length : 0,
  }
}

function cloneFileHandle(handle: LocalProjectFileHandle): LocalProjectFileHandle | null {
  try {
    return typeof structuredClone === 'function' ? structuredClone(handle) : null
  } catch {
    // Test adapters and browsers that cannot persist handles still keep the project snapshot.
    return null
  }
}
