import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { inspectModulePackageFile, validateModulePackageExport } from '../src/app/modulePackageFile.mjs'

const source = 'export default { manifest: { id: "acme.tools", version: "1.0.0", schema_version: 1 }, activate() { return { commands: {} } } }'

test('module package inspection accepts self-contained default-export bundles without executing them', () => {
  assert.deepEqual(inspectModulePackageFile('acme-tools.cfe.mjs', source), { fileName: 'acme-tools.cfe.mjs', byteLength: new TextEncoder().encode(source).byteLength })
})

test('module package inspection rejects unsupported files, imports, missing exports, and oversized source', () => {
  assert.throws(() => inspectModulePackageFile('extension.js', source), /\.cfe\.mjs/)
  assert.throws(() => inspectModulePackageFile('extension.cfe.mjs', `import x from 'x'; ${source}`), /self-contained/)
  assert.throws(() => inspectModulePackageFile('extension.cfe.mjs', 'const value = 1'), /export default/)
  assert.throws(() => inspectModulePackageFile('extension.cfe.mjs', `export default {}; // ${'x'.repeat(2 * 1024 * 1024)}`), /2 MB/)
})

test('loaded package export must provide a manifest and activation lifecycle', () => {
  const module = { manifest: { id: 'acme.tools' }, activate() {} }
  assert.equal(validateModulePackageExport(module), module)
  assert.throws(() => validateModulePackageExport({ activate() {} }), /manifest.id/)
  assert.throws(() => validateModulePackageExport({ manifest: { id: 'acme.tools' } }), /activate/)
})

test('SDK starter bundle meets the host import format', async () => {
  const source = await readFile(new URL('../../../packages/module-sdk/examples/sample-package.cfe.mjs', import.meta.url), 'utf8')
  assert.equal(inspectModulePackageFile('sample-package.cfe.mjs', source).fileName, 'sample-package.cfe.mjs')
})
