export const ASSEMBLY_ASSET_LIBRARY_KEY = 'constructflow.assembly-assets.v1'
export const ASSEMBLY_ASSET_LIBRARY_FORMAT = 'constructflow-assembly-assets'
const PRESETS = new Set(['carport', 'kitchen', 'terrace'])
const MAX_ITEMS = 100
const MAX_IMPORT_BYTES = 1_000_000
const ITEM_KEYS = new Set(['id', 'name', 'preset', 'saved_at', 'parameters'])
const PARAMETER_KEYS = new Set([
  'posX_m', 'posY_m', 'width_m', 'length_m', 'carportColumnType', 'kitchenWallHeight_m',
  'kitchenIncludeDoor', 'kitchenIncludeWindow', 'kitchenWallSides', 'terraceElevation_m',
])

function validItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Asset entry must be an object')
  if (Object.keys(item).some(key => !ITEM_KEYS.has(key))) throw new Error('Asset entry contains unsupported fields')
  if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 100) throw new Error('Asset ID is invalid')
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80) throw new Error('Asset name must contain 1–80 characters')
  if (!PRESETS.has(item.preset)) throw new Error(`Asset ${item.name} has an unsupported assembly type`)
  if (typeof item.saved_at !== 'string' || !Number.isFinite(Date.parse(item.saved_at))) throw new Error(`Asset ${item.name} has an invalid saved time`)
  const values = item.parameters
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error(`Asset ${item.name} has no parameters`)
  if (Object.keys(values).some(key => !PARAMETER_KEYS.has(key))) throw new Error(`Asset ${item.name} contains unsupported parameters`)
  for (const field of ['posX_m', 'posY_m', 'width_m', 'length_m'])
    if (typeof values[field] !== 'number' || !Number.isFinite(values[field])) throw new Error(`Asset ${item.name} requires a finite ${field}`)
  if (values.width_m < 0.001 || values.length_m < 0.001) throw new Error(`Asset ${item.name} dimensions must be positive`)
  if (values.carportColumnType !== undefined && !['SC1', 'C1'].includes(values.carportColumnType)) throw new Error(`Asset ${item.name} has an unsupported column type`)
  if (values.kitchenWallHeight_m !== undefined && (typeof values.kitchenWallHeight_m !== 'number' || !Number.isFinite(values.kitchenWallHeight_m) || values.kitchenWallHeight_m <= 0)) throw new Error(`Asset ${item.name} has an invalid wall height`)
  if (values.kitchenWallSides !== undefined && ![3, 4].includes(values.kitchenWallSides)) throw new Error(`Asset ${item.name} must use 3 or 4 kitchen walls`)
  for (const field of ['kitchenIncludeDoor', 'kitchenIncludeWindow'])
    if (values[field] !== undefined && typeof values[field] !== 'boolean') throw new Error(`Asset ${item.name} has an invalid ${field}`)
  if (values.terraceElevation_m !== undefined && (typeof values.terraceElevation_m !== 'number' || !Number.isFinite(values.terraceElevation_m) || values.terraceElevation_m <= 0)) throw new Error(`Asset ${item.name} has an invalid terrace elevation`)
  return {
    id: item.id, name: item.name.trim(), preset: item.preset, saved_at: item.saved_at,
    parameters: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, structuredClone(value)])),
  }
}

export function validateAssemblyAssetLibrary(value) {
  if (!value || typeof value !== 'object' || value.format !== ASSEMBLY_ASSET_LIBRARY_FORMAT || value.version !== 1 || !Array.isArray(value.items))
    throw new Error('Unsupported ConstructFlow assembly asset library')
  if (value.items.length > MAX_ITEMS) throw new Error(`Assembly asset library is limited to ${MAX_ITEMS} entries`)
  const ids = new Set()
  const items = value.items.map(validItem)
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate asset ID ${item.id}`)
    ids.add(item.id)
  }
  return { format: ASSEMBLY_ASSET_LIBRARY_FORMAT, version: 1, items }
}

export function loadAssemblyAssets(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(ASSEMBLY_ASSET_LIBRARY_KEY)
    if (!raw) return []
    return validateAssemblyAssetLibrary(JSON.parse(raw)).items
  } catch {
    return []
  }
}

export function saveAssemblyAssets(items, storage = globalThis.localStorage) {
  const validated = validateAssemblyAssetLibrary({ format: ASSEMBLY_ASSET_LIBRARY_FORMAT, version: 1, items })
  storage?.setItem(ASSEMBLY_ASSET_LIBRARY_KEY, JSON.stringify(validated))
  return validated.items
}

export function createAssemblyAsset({ id = crypto.randomUUID(), name, preset, parameters, savedAt = new Date().toISOString() }) {
  return validItem({ id, name: name.trim(), preset, parameters: structuredClone(parameters), saved_at: savedAt })
}

export function exportAssemblyAssets(items) {
  return JSON.stringify(validateAssemblyAssetLibrary({ format: ASSEMBLY_ASSET_LIBRARY_FORMAT, version: 1, items }), null, 2)
}

export function importAssemblyAssets(source, currentItems = []) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES)
    throw new Error('Assembly asset file exceeds 1 MB')
  const imported = validateAssemblyAssetLibrary(JSON.parse(source)).items
  const ids = new Set(currentItems.map(item => item.id))
  if (imported.some(item => ids.has(item.id))) throw new Error('Imported assets contain IDs already in this library')
  if (currentItems.length + imported.length > MAX_ITEMS) throw new Error(`Assembly asset library is limited to ${MAX_ITEMS} entries`)
  return [...structuredClone(currentItems), ...imported]
}
