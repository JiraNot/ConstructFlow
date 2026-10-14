const MAX_PACKAGE_BYTES = 2 * 1024 * 1024

/** Validate a self-contained extension bundle before the user explicitly executes it. */
export function inspectModulePackageFile(fileName, source) {
  if (typeof fileName !== 'string' || !/\.cfe\.mjs$/i.test(fileName)) throw new Error('เลือกไฟล์ extension นามสกุล .cfe.mjs')
  if (typeof source !== 'string' || !source.trim()) throw new Error('ไฟล์ extension ว่างเปล่า')
  const bytes = new TextEncoder().encode(source).byteLength
  if (bytes > MAX_PACKAGE_BYTES) throw new Error('ไฟล์ extension ต้องมีขนาดไม่เกิน 2 MB')
  if (/^\s*import\s/m.test(source) || /\bimport\s*\(/.test(source)) throw new Error('แพ็กเกจต้องเป็น self-contained bundle และห้าม import โค้ดภายนอก')
  if (!/\bexport\s+default\b/.test(source)) throw new Error('ไฟล์ต้อง export default ConstructFlowModule')
  return { fileName, byteLength: bytes }
}

/** Check the exported shape; full capability/command validation stays in ModuleRegistry.register. */
export function validateModulePackageExport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('แพ็กเกจต้อง export module object')
  const manifest = value.manifest
  if (!manifest || typeof manifest !== 'object' || typeof manifest.id !== 'string' || !manifest.id.trim()) throw new Error('แพ็กเกจต้องมี manifest.id')
  if (typeof value.activate !== 'function') throw new Error('แพ็กเกจต้องมี activate(api)')
  return value
}
