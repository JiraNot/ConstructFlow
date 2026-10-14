import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASSEMBLY_ASSET_LIBRARY_KEY, createAssemblyAsset, exportAssemblyAssets,
  importAssemblyAssets, loadAssemblyAssets, saveAssemblyAssets, validateAssemblyAssetLibrary,
} from '../src/app/assemblyAssetLibrary.mjs'

function storageMock() {
  const entries = new Map()
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key),
  }
}

const parameters = { posX_m: -1.5, posY_m: 2, width_m: 4, length_m: 2.5, kitchenWallHeight_m: 2.8, kitchenIncludeDoor: false, kitchenIncludeWindow: true, kitchenWallSides: 4 }

test('personal assembly assets persist as portable, versioned parametric snapshots', () => {
  const storage = storageMock()
  const asset = createAssemblyAsset({ id: 'asset-1', name: 'ครัวหลังบ้าน', preset: 'kitchen', parameters, savedAt: '2026-10-14T00:00:00.000Z' })
  assert.equal(saveAssemblyAssets([asset], storage).length, 1)
  assert.deepEqual(loadAssemblyAssets(storage), [asset])
  const raw = storage.getItem(ASSEMBLY_ASSET_LIBRARY_KEY)
  assert.equal(JSON.parse(raw).format, 'constructflow-assembly-assets')
  assert.equal(JSON.parse(raw).version, 1)
})

test('assembly library export/import merges valid assets without sharing executable code', () => {
  const one = createAssemblyAsset({ id: 'one', name: 'Carport', preset: 'carport', parameters: { posX_m: 0, posY_m: 0, width_m: 5, length_m: 5.5 } })
  const two = createAssemblyAsset({ id: 'two', name: 'Deck', preset: 'terrace', parameters: { posX_m: 4, posY_m: 0, width_m: 3, length_m: 4, terraceElevation_m: 0.45 } })
  const exported = exportAssemblyAssets([two])
  assert.match(exported, /constructflow-assembly-assets/)
  assert.deepEqual(importAssemblyAssets(exported, [one]), [one, two])
  assert.throws(() => importAssemblyAssets(exportAssemblyAssets([one]), [one]), /IDs already/)
})

test('assembly library rejects unsupported versions, duplicate IDs, and invalid parameters', () => {
  const asset = createAssemblyAsset({ id: 'same', name: 'Deck', preset: 'terrace', parameters: { posX_m: 0, posY_m: 0, width_m: 3, length_m: 4 } })
  assert.throws(() => validateAssemblyAssetLibrary({ format: 'constructflow-assembly-assets', version: 2, items: [] }), /Unsupported/)
  assert.throws(() => validateAssemblyAssetLibrary({ format: 'constructflow-assembly-assets', version: 1, items: [asset, asset] }), /Duplicate/)
  assert.throws(() => createAssemblyAsset({ ...asset, parameters: { ...asset.parameters, width_m: 0 } }), /positive/)
  assert.throws(() => validateAssemblyAssetLibrary({ format: 'constructflow-assembly-assets', version: 1, items: [{ ...asset, script: 'not allowed' }] }), /unsupported fields/)
  assert.throws(() => importAssemblyAssets('x'.repeat(1_000_001)), /exceeds 1 MB/)
})

test('corrupt browser storage does not prevent opening the assembly library', () => {
  const storage = storageMock()
  storage.setItem(ASSEMBLY_ASSET_LIBRARY_KEY, '{broken')
  assert.deepEqual(loadAssemblyAssets(storage), [])
})
