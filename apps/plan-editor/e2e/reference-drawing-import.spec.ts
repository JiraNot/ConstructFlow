import { test, expect, type Page } from '@playwright/test'

async function storedProject(page: Page) {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open('constructflow-local-projects', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const get = db.transaction('snapshots').objectStore('snapshots').get('active-project')
      get.onsuccess = () => { db.close(); resolve(get.result?.projectJson ? JSON.parse(get.result.projectJson) : null) }
      get.onerror = () => { db.close(); reject(get.error) }
    }
  }))
}

const dxf = [
  '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LINE', '8', 'A-WALL', '10', '0', '20', '0', '11', '5000', '21', '0',
  '0', 'LINE', '67', '1', '410', 'A-02 Ground', '8', 'A-PLAN', '10', '0', '20', '0', '11', '4000', '21', '0',
  '0', 'LINE', '67', '1', '410', 'S-01 Foundation', '8', 'S-FOOTING', '10', '0', '20', '0', '11', '3000', '21', '0',
  '0', 'ENDSEC', '0', 'EOF',
].join('\n')

async function openProjectBrowser(page: Page) {
  await page.getByRole('tab', { name: 'โครงการ', exact: true }).click()
  await page.getByRole('tab', { name: 'รายการ', exact: true }).click()
}

test('imports multiple Model Space plans and Layouts as independently scoped, level-bound drawings', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')

  const fileInput = page.locator('.cf-underlay-tools input[type="file"]')
  await fileInput.setInputFiles({ name: 'multi-plan.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) })
  let picker = page.getByRole('dialog', { name: 'เลือกแปลนจาก DWG หรือ DXF' })
  await expect(picker.getByRole('button', { name: /Model Space/ })).toBeVisible()
  await expect(picker.getByRole('button', { name: /A-02 Ground/ })).toBeVisible()
  await expect(picker.getByRole('button', { name: /S-01 Foundation/ })).toBeVisible()

  await picker.getByRole('button', { name: 'ทั้งแบบ' }).click()
  await picker.getByLabel('ชื่อแปลนที่นำเข้า').fill('แบบชั้นล่าง')
  await picker.getByRole('button', { name: 'เพิ่มแปลนนี้' }).click()
  await picker.getByRole('button', { name: /Model Space/ }).click()
  const preview = picker.locator('.cf-dwg-picker-preview')
  await preview.scrollIntoViewIfNeeded()
  const bounds = (await preview.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * .18, bounds.y + bounds.height * .18)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * .78, bounds.y + bounds.height * .78, { steps: 5 })
  await page.mouse.up()
  await expect(preview.locator('[aria-hidden="true"]')).toBeVisible()
  await picker.getByLabel('ชื่อแปลนที่นำเข้า').fill('แบบส่วนต่อเติม')
  await picker.getByLabel('ชั้นของแปลนที่นำเข้า').selectOption({ index: 0 })
  await picker.getByRole('button', { name: 'เพิ่มแปลนนี้' }).click()
  await picker.getByRole('button', { name: /A-02 Ground/ }).click()
  await picker.getByLabel('ชื่อแปลนที่นำเข้า').fill('แบบชั้นบน')
  await picker.getByLabel('ชั้นของแปลนที่นำเข้า').selectOption({ index: 0 })
  await picker.getByRole('button', { name: 'เพิ่มแปลนนี้' }).click()
  await expect(picker.getByLabel('ชื่อแปลน 1')).toHaveValue('แบบชั้นล่าง')
  await expect(picker.getByLabel('ชื่อแปลน 2')).toHaveValue('แบบส่วนต่อเติม')
  await expect(picker.getByLabel('ชื่อแปลน 3')).toHaveValue('แบบชั้นบน')
  await picker.getByRole('button', { name: 'นำเข้า 3 แปลน' }).click()
  await expect(picker).toHaveCount(0)
  await expect.poll(async () => {
    const underlays = Object.values((await storedProject(page))?.underlays ?? []) as any[]
    return underlays.filter(item => item.source_file === 'multi-plan.dxf' && item.source_kind === 'dxf').length
  }).toBe(3)
  let underlays = Object.values((await storedProject(page))?.underlays ?? []) as any[]
  expect(underlays.some(item => item.display_name === 'แบบชั้นล่าง' && Array.isArray(item.source_region))).toBe(true)
  const fullModelSpaceWidth = underlays.find(item => item.display_name === 'แบบชั้นล่าง')?.source_region?.[2]
  expect(underlays.find(item => item.display_name === 'แบบส่วนต่อเติม')?.source_region?.[2]).toBeLessThan(fullModelSpaceWidth)
  expect(underlays.some(item => item.display_name === 'แบบชั้นบน' && item.source_layout === 'A-02 Ground')).toBe(true)
  expect(underlays.find(item => item.display_name === 'แบบชั้นบน')?.level_id).not.toBe(underlays.find(item => item.display_name === 'แบบชั้นล่าง')?.level_id)

  await openProjectBrowser(page)
  const browser = page.getByLabel('Project Browser')
  await browser.getByText('แบบ DWG/DXF ที่นำเข้า').click()
  const upperPlan = browser.getByLabel('ซ่อน แบบชั้นบน')
  await upperPlan.click()
  await expect.poll(async () => {
    const items = Object.values((await storedProject(page))?.underlays ?? []) as any[]
    return items.find(item => item.display_name === 'แบบชั้นบน')?.visible
  }).toBe(false)

  await page.locator('.cf-current-view').click()
  await page.getByRole('navigation', { name: 'มุมมองโครงการ' }).getByRole('button', { name: 'แปลนคาน', exact: true }).click()
  await fileInput.setInputFiles({ name: 'multi-plan.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) })
  picker = page.getByRole('dialog', { name: 'เลือกแปลนจาก DWG หรือ DXF' })
  await picker.getByRole('button', { name: /S-01 Foundation/ }).click()
  await picker.getByRole('button', { name: 'เพิ่มแปลนนี้' }).click()
  await picker.getByRole('button', { name: 'นำเข้า 1 แปลน' }).click()
  await expect.poll(async () => {
    const underlays = Object.values((await storedProject(page))?.underlays ?? []) as any[]
    return underlays.filter(item => item.source_file === 'multi-plan.dxf').length
  }).toBe(4)
  underlays = Object.values((await storedProject(page))?.underlays ?? []) as any[]
  expect(underlays.some(item => item.source_layout === 'S-01 Foundation' && item.view_id === 'framing')).toBe(true)
  await page.reload()
  await expect.poll(async () => {
    const reopened = Object.values((await storedProject(page))?.underlays ?? []) as any[]
    return reopened.filter(item => item.source_file === 'multi-plan.dxf').length
  }).toBe(4)
  expect(errors).toEqual([])
})

test('reference drawing picker stays usable in a tablet portrait viewport', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'เริ่มทำแปลน' })).toBeVisible()
  await page.locator('.cf-underlay-tools input[type="file"]').setInputFiles({
    name: 'single-plan.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf),
  })
  const picker = page.getByRole('dialog', { name: 'เลือกแปลนจาก DWG หรือ DXF' })
  await expect(picker).toBeVisible()
  const bounds = (await picker.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(820)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(1180)
  expect(await picker.getByRole('button', { name: 'เพิ่มแปลนนี้' }).evaluate(button => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40)
})
