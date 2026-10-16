import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { CommandBus } from '@constructflow/command-runtime'
import { createEmptyProjectDocument, serializeProject } from '@constructflow/project-model'

test.use({ viewport: { width: 1366, height: 900 }, hasTouch: true })

async function openGridProject(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
  })
  const created = CommandBus.execute(createEmptyProjectDocument(randomUUID(), 'Grid and dimensions'), 'CreateGridSystem', {
    id: randomUUID(), orientation: 'vertical', origin_mm: 0, spacing_mm: 3000, count: 3, first_tag: 'A', extent_mm: [-1000, 6000],
  })
  const horizontal = CommandBus.execute(created.updatedProject, 'CreateGrid', {
    id: randomUUID(), tag: '1', orientation: 'horizontal', position_mm: 0, extent_mm: [-1000, 7000], start_point_mm: [-1000, 0], end_point_mm: [7000, 0],
  })
  expect(horizontal.result.status).toBe('success')
  await page.goto('/')
  await page.locator('#cfproj-open').setInputFiles({ name: 'grid-dimensions.cfproj', mimeType: 'application/json', buffer: Buffer.from(serializeProject(horizontal.updatedProject)) })
  await expect(page.getByRole('button', { name: 'แก้ชื่อโครงการ: Grid and dimensions' })).toBeVisible()
  return Object.values(created.updatedProject.objects).sort((a, b) => Number(a.module_data.system_index) - Number(b.module_data.system_index)).map(object => object.id)
}

async function screen(page: Page, point: [number, number]) {
  const canvas = page.locator('.cf-plan-canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas is not visible')
  const state = await canvas.evaluate(element => ({ panX: Number(element.getAttribute('data-viewport-pan-x')), panY: Number(element.getAttribute('data-viewport-pan-y')), zoom: Number(element.getAttribute('data-viewport-zoom')) }))
  return { x: box.x + point[0] * state.zoom + state.panX, y: box.y + point[1] * state.zoom + state.panY }
}
async function clickPoint(page: Page, point: [number, number]) {
  const at = await screen(page, point)
  await page.mouse.click(at.x, at.y)
}
async function stored(page: Page) {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open('constructflow-local-projects', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const read = db.transaction('snapshots').objectStore('snapshots').get('active-project')
      read.onsuccess = () => { db.close(); resolve(read.result?.projectJson ? JSON.parse(read.result.projectJson) : null) }
      read.onerror = () => { db.close(); reject(read.error) }
    }
  }))
}

test('system grid lines drag with preview, cancel, undo/redo and reopen', async ({ page }, testInfo) => {
  const ids = await openGridProject(page)
  const start = await screen(page, [3000, 2200]), end = await screen(page, [3600, 2200])
  await page.keyboard.press('s')
  await page.keyboard.down('Control')
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await expect(page.locator('canvas').first()).toHaveAttribute('data-manipulation-preview-valid', 'true')
  const box = (await page.locator('canvas').first().boundingBox())!
  const bluePixels = await page.locator('canvas').first().evaluate((canvas, at) => {
    const pixels = canvas.getContext('2d')!.getImageData(Math.round(at.x) - 3, Math.round(at.y) + 10, 7, 24).data
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 120 && pixels[i + 1] > 90 && pixels[i + 2] > 160) count++
    return count
  }, { x: end.x - box.x, y: end.y - box.y })
  expect(bluePixels).toBeGreaterThan(15)
  await page.screenshot({ path: testInfo.outputPath('grid-drag-preview.png') })
  await page.mouse.up(); await page.keyboard.up('Control')
  const position = async () => (await stored(page))?.objects[ids[1]]?.module_data.position_mm
  await expect.poll(position).toBeGreaterThan(3550)
  await expect.poll(position).toBeLessThan(3650)
  const moved = await position()
  await page.getByRole('button', { name: 'ย้อนกลับ', exact: true }).click()
  await expect.poll(position).toBe(3000)
  await page.getByRole('button', { name: 'ทำซ้ำ', exact: true }).click()
  await expect.poll(position).toBe(moved)
  const cancelStart = await screen(page, [moved, 2200]), cancelEnd = await screen(page, [4200, 2200])
  await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down(); await page.mouse.move(cancelEnd.x, cancelEnd.y, { steps: 6 })
  await page.keyboard.press('Escape'); await page.mouse.up()
  await expect.poll(position).toBe(moved)
  await page.reload()
  await expect.poll(position).toBe(moved)
  expect(Object.keys((await stored(page)).objects)).toEqual(expect.arrayContaining(ids))
})

test('dimension keyboard placement cancels pending steps and touch placement works on mobile', async ({ page }, testInfo) => {
  await openGridProject(page)
  await page.keyboard.press('Shift+M')
  let at = await screen(page, [0, 0])
  await page.mouse.move(at.x, at.y); await page.locator('canvas').first().focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-tool-step="end-point"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tool-step="start-point"]')).toBeVisible()
  await expect(page.locator('[data-plan-dimension]')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'ปิดแผงข้อมูล', exact: true }).click()
  const surface = (await page.locator('.cf-plan-canvas').first().boundingBox())!
  for (const fraction of [[.25, .4], [.7, .4], [.5, .65]]) {
    await page.touchscreen.tap(surface.x + surface.width * fraction[0], surface.y + surface.height * fraction[1])
  }
  await expect(page.locator('[data-plan-dimension]:not([data-plan-dimension="preview"])')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('plan-dimensions-mobile-touch.png') })
})

test('dimension tool snaps endpoints, edits, saves/reopens and deletes with history', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await openGridProject(page)
  await page.locator('.cf-tool-button[title^="บอกระยะ"]').click()
  await clickPoint(page, [0, 0]); await clickPoint(page, [3000, 0])
  await expect(page.locator('[data-tool-step="dimension-offset"]')).toBeVisible()
  await clickPoint(page, [1500, 1200])
  const saved = page.locator('[data-plan-dimension]:not([data-plan-dimension="preview"])')
  await expect(saved).toHaveCount(1)
  await expect(saved).toContainText('3.000 m')
  await page.getByRole('button', { name: 'ย้อนกลับ', exact: true }).click(); await expect(saved).toHaveCount(0)
  await page.getByRole('button', { name: 'ทำซ้ำ', exact: true }).click(); await expect(saved).toHaveCount(1)
  await expect.poll(async () => (await stored(page))?.drawing_settings?.plan_dimensions?.length).toBe(1)
  await page.keyboard.press('s')
  const dimension = (await stored(page)).drawing_settings.plan_dimensions[0]
  const center = await screen(page, [1500, dimension.offset_mm]), nextCenter = await screen(page, [1500, 1800])
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(nextCenter.x, nextCenter.y, { steps: 6 }); await page.mouse.up()
  await expect.poll(async () => (await stored(page)).drawing_settings.plan_dimensions[0].offset_mm).toBeGreaterThan(1750)
  const end = await screen(page, [3000, 0]), nextEnd = await screen(page, [6000, 0])
  await page.mouse.move(end.x, end.y); await page.mouse.down(); await page.mouse.move(nextEnd.x, nextEnd.y, { steps: 6 }); await page.mouse.up()
  await expect(saved).toContainText('6.000 m')
  const downloadPromise = page.waitForEvent('download')
  await page.getByLabel('ตัวเลือกบันทึก').click(); await page.getByRole('button', { name: 'บันทึกเป็นไฟล์ .cfproj' }).click()
  const download = await downloadPromise
  const json = await readFile((await download.path())!, 'utf8')
  const exported = JSON.parse(json)
  expect(exported.drawing_settings.plan_dimensions[0].end_mm).toEqual([6000, 0])
  await page.screenshot({ path: testInfo.outputPath('plan-dimensions.png') })
  await page.locator('#cfproj-open').setInputFiles({ name: 'roundtrip.cfproj', mimeType: 'application/json', buffer: Buffer.from(json) })
  await expect(page.locator('.cf-save-status')).toContainText('เปิดไฟล์ roundtrip.cfproj แล้ว')
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect.poll(async () => (await stored(page))?.drawing_settings?.plan_dimensions?.[0]?.end_mm).toEqual([6000, 0])
  await page.reload(); await expect(saved).toContainText('6.000 m')
  const annotation = exported.drawing_settings.plan_dimensions[0]
  await clickPoint(page, [3000, annotation.offset_mm])
  await page.keyboard.press('Delete'); await expect(saved).toHaveCount(0)
  await page.getByRole('button', { name: 'ย้อนกลับ', exact: true }).click(); await expect(saved).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.cf-tool-button[title^="บอกระยะ"]').scrollIntoViewIfNeeded()
  await expect(page.locator('.cf-tool-button[title^="บอกระยะ"]')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('plan-dimensions-mobile.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
