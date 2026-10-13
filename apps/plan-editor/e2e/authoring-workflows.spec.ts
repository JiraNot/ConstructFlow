import { expect, test, type Page } from '@playwright/test'

const canvas = (page: Page) => page.locator('canvas').first()

async function clickCanvasFraction(page: Page, x: number, y: number) {
  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  await canvas(page).click({ position: { x: bounds.width * x, y: bounds.height * y } })
}

async function moveToCanvasFraction(page: Page, x: number, y: number) {
  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  await page.mouse.move(bounds.x + bounds.width * x, bounds.y + bounds.height * y)
}

async function findGripPoints(page: Page, color: 'blue' | 'orange') {
  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  return canvas(page).evaluate((element, options) => {
    const { box, color } = options
    const context = element.getContext('2d')
    if (!context) return []
    const { data, width, height } = context.getImageData(0, 0, element.width, element.height)
    const counts = new Map<number, { count: number; yTotal: number }>()
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      // Grip outlines use the renderer's blue #087cf0 or orange #f97316 stroke.
      const isGripStroke = color === 'blue'
        ? data[index] <= 16 && data[index + 1] >= 116 && data[index + 1] <= 132 && data[index + 2] >= 224
        : data[index] >= 225 && data[index + 1] >= 90 && data[index + 1] <= 140 && data[index + 2] <= 60
      if (isGripStroke && data[index + 3] > 200) {
        const current = counts.get(x) ?? { count: 0, yTotal: 0 }
        current.count++
        current.yTotal += y
        counts.set(x, current)
      }
    }
    const columns = [...counts.keys()].sort((a, b) => a - b)
    const groups: number[][] = []
    for (const x of columns) {
      const group = groups[groups.length - 1]
      if (group && x - group[group.length - 1] <= 2) group.push(x)
      else groups.push([x])
    }
    const scaleX = box.width / width, scaleY = box.height / height
    return groups.filter(group => group.length >= 5).map(group => {
      const pixels = group.flatMap(x => Array.from({ length: counts.get(x)!.count }, () => ({ x, y: counts.get(x)!.yTotal / counts.get(x)!.count })))
      const centerX = (group[0] + group[group.length - 1]) / 2
      const centerY = pixels.reduce((sum, pixel) => sum + pixel.y, 0) / pixels.length
      return { x: centerX * scaleX, y: centerY * scaleY }
    })
  }, { box: bounds, color })
}

test('mouse and keyboard authoring creates wall, beam, hosted opening, and point objects', async ({ page }) => {
  test.setTimeout(60_000)
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto('/')
  await expect(page).toHaveTitle(/ConstructFlow/)

  const canvasElement = canvas(page)
  await expect(canvasElement).toBeVisible()

  // Draw a wall with the mouse and confirm the tool remains in its repeat step.
  await page.getByRole('button', { name: 'ผนัง' }).click()
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await clickCanvasFraction(page, 0.30, 0.45)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')
  await clickCanvasFraction(page, 0.70, 0.45)
  await expect(page.getByText('ช่องเปิดบนผนัง')).toBeVisible()
  await expect(page.getByText(/WALL LENGTH/)).toBeVisible()
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')

  // Escape cancels the chained start point, and a second Escape exits the idle tool.
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /เลือก/)

  // Start another wall with the mouse, enter its numeric length, and commit with Enter.
  await page.getByRole('button', { name: 'ผนัง' }).click()
  await clickCanvasFraction(page, 0.22, 0.70)
  const wallLengthInput = page.getByRole('textbox', { name: /ความยาวช่วงที่วาด/ })
  await wallLengthInput.fill('1.5')
  await page.getByRole('spinbutton', { name: 'องศาช่วงที่วาด (0 องศาขวา 90 องศาขึ้น)' }).fill('0')
  await wallLengthInput.press('Enter')
  await expect(page.locator('body')).toContainText('WALL LENGTH')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // Draw a beam with two mouse points.
  await page.locator('.cf-tool-button[title^="คาน"]').click()
  await clickCanvasFraction(page, 0.30, 0.27)
  await clickCanvasFraction(page, 0.43, 0.27)
  await expect(page.locator('body')).toContainText('SPAN LENGTH')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // Start a second beam with the mouse, enter a numeric length, and commit with Enter.
  await page.locator('.cf-tool-button[title^="คาน"]').click()
  await clickCanvasFraction(page, 0.33, 0.63)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')
  const lengthInput = page.getByRole('textbox', { name: /ความยาวช่วงที่วาด/ })
  await lengthInput.fill('2')
  await lengthInput.press('Enter')
  await expect(page.locator('body')).toContainText('SPAN LENGTH')

  // Place a column with the mouse, then place another with Enter at the canvas cursor.
  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.65, 0.72)
  await expect(page.locator('body')).toContainText('structure.column')
  await moveToCanvasFraction(page, 0.78, 0.72)
  await canvasElement.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('body')).toContainText('structure.column')

  // Find the newly drawn wall through the live hosted-snap feedback, then place a door.
  await page.locator('.cf-tool-button[title^="ประตู"]').click()
  await moveToCanvasFraction(page, 0.50, 0.45)
  await expect(page.getByTestId('snap-feedback')).toContainText(/Snap:\s*(?:On Wall|Wall|ผนัง|Host)/i)
  await clickCanvasFraction(page, 0.50, 0.45)
  await expect(page.locator('[data-tool-step]')).toContainText('วางบนผนัง')
  await expect(page.locator('body')).toContainText('Door D1')
  await expect(page.locator('body')).toContainText('Offset along wall:')

  // Commit another door from the keyboard at a distinct point on that same wall.
  await moveToCanvasFraction(page, 0.62, 0.45)
  await expect(page.getByTestId('snap-feedback')).toContainText(/Snap:\s*On Wall[^\n]*\([\d.]+m\)/i)
  await canvasElement.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('body')).toContainText('Door D1')
  await expect(page.locator('body')).toContainText('Offset along wall:')
  expect(pageErrors).toEqual([])
})

test('point placement accepts numeric X/Y dimensions by mouse and keyboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const columns = page.locator('.cf-browser-tree [data-object-type="structure.column"]')
  const initialCount = await columns.count()

  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.65, 0.72)
  await expect(columns).toHaveCount(initialCount + 1)

  await moveToCanvasFraction(page, 0.67, 0.70)
  const dimensionPanel = page.getByRole('group', { name: 'ระยะและแนวระหว่างวางวัตถุ' })
  await expect(dimensionPanel).toBeVisible()
  const xInput = page.getByRole('textbox', { name: /ระยะจากแนวอ้างอิง X/ })
  const yInput = page.getByRole('textbox', { name: /ระยะจากแนวอ้างอิง Y/ })
  await expect(xInput).toBeVisible()
  await expect(yInput).toBeVisible()
  await xInput.fill('0.75')
  await yInput.fill('0.50')
  await clickCanvasFraction(page, 0.67, 0.70)

  await expect(columns).toHaveCount(initialCount + 2)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'position')

  await moveToCanvasFraction(page, 0.69, 0.69)
  await expect(dimensionPanel).toBeVisible()
  await xInput.fill('0.40')
  await yInput.fill('0.60')
  await yInput.press('Enter')
  await expect(columns).toHaveCount(initialCount + 3)
})

test('repeat last tool resets an active wall session and starts another wall', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="ผนัง"]').click()
  await clickCanvasFraction(page, 0.22, 0.28)
  await clickCanvasFraction(page, 0.42, 0.28)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')

  await page.getByRole('button', { name: /ใช้เครื่องมือล่าสุดซ้ำ/ }).click()
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /ผนัง/)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await clickCanvasFraction(page, 0.22, 0.62)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')
  await clickCanvasFraction(page, 0.42, 0.62)

  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(page.locator('li[data-object-type="architecture.wall"]')).toHaveCount(2)
})

test('window placement identifies its wall host and commits with the keyboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ผนัง' }).click()
  await clickCanvasFraction(page, 0.25, 0.45)
  await clickCanvasFraction(page, 0.75, 0.45)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  const canvasElement = canvas(page)
  await page.locator('.cf-tool-button[title^="หน้าต่าง"]').click()
  await moveToCanvasFraction(page, 0.50, 0.45)
  await expect(page.getByTestId('snap-feedback')).toContainText(/Snap:\s*On Wall/i)
  await expect(page.locator('[data-tool-step]')).toContainText('วางบนผนัง')
  await canvasElement.focus()
  await page.keyboard.press('Enter')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(page.locator('.cf-browser-tree [data-object-type="door_window.window"]')).toHaveCount(1)
  await expect(page.locator('[data-tool-step]')).toContainText('วางบนผนัง')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /เลือก/)
})

test('polygon placement commits a slab boundary through the shared placement session', async ({ page }) => {
  await page.goto('/')
  const canvasElement = canvas(page)
  await page.locator('.cf-tool-button[title^="พื้น ("]').click()
  await clickCanvasFraction(page, 0.25, 0.25)
  await clickCanvasFraction(page, 0.70, 0.25)
  await clickCanvasFraction(page, 0.70, 0.70)
  await canvasElement.focus()
  await page.keyboard.press('Enter')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(page.locator('li[data-object-type="structure.slab"]')).toHaveCount(1)
})

test('grid-system placement validates entered lengths and commits both axes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const gridRows = page.locator('li[data-object-type="structure.grid"]')
  const initialCount = await gridRows.count()

  await page.locator('.cf-tool-button[title^="ระบบ Grid Line"]').click()
  const xIntervals = page.getByLabel(/ระยะช่วงแนวตั้งของระบบกริด/)
  const yIntervals = page.getByLabel(/ระยะช่วงแนวนอนของระบบกริด/)
  await xIntervals.fill('0')
  await clickCanvasFraction(page, 0.5, 0.5)
  await expect(page.locator('.cf-authoring-controls-content [role="alert"]')).toContainText('ระยะแต่ละช่วงต้องมากกว่า 0')

  await xIntervals.fill('3m')
  await yIntervals.fill('2.5m')
  await clickCanvasFraction(page, 0.5, 0.5)
  await expect(gridRows).toHaveCount(initialCount + 4)
})

test('Escape cancels a pending grid-copy destination before leaving the tool', async ({ page }) => {
  await page.goto('/')
  const canvasElement = canvas(page)
  await page.locator('.cf-tool-button[title^="เส้นกริด"]').click()
  await clickCanvasFraction(page, 0.30, 0.45)
  await clickCanvasFraction(page, 0.70, 0.45)
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const gridRow = page.locator('li[data-object-type="structure.grid"]').first()
  await expect(gridRow).toBeVisible()
  await page.keyboard.press('Escape')

  const canvasBounds = await canvasElement.boundingBox()
  if (!canvasBounds) throw new Error('Plan canvas is not visible')
  await page.mouse.click(canvasBounds.x + canvasBounds.width * 0.5, canvasBounds.y + canvasBounds.height * 0.45, { button: 'right' })
  await page.getByRole('menuitem', { name: 'ทำสำเนาแล้ววาง' }).click()
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'place-copy')

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'select-source')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'ready')
})

test('Project Browser selection and type edits preserve one object identity across views', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  const canvasElement = canvas(page)
  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.63, 0.68)
  await expect(page.locator('body')).toContainText('Column C1')

  await page.getByRole('button', { name: 'รูปด้านเหนือ' }).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const objectRow = page.locator('li[data-object-type="structure.column"]').first()
  await expect(objectRow).toBeVisible()
  const canonicalId = await objectRow.getAttribute('data-object-id')
  expect(canonicalId).toBeTruthy()
  await objectRow.locator('.cf-browser-object').click()
  await expect(page.getByRole('tab', { name: 'คุณสมบัติ' })).toHaveAttribute('aria-selected', 'true')

  const properties = page.getByTestId('properties-selection')
  await expect(properties).toHaveAttribute('data-object-id', canonicalId!)
  await expect(properties).toContainText('Column C1')
  await page.getByLabel('ชนิดของชิ้นที่เลือก').selectOption('C2')
  await expect(properties).toHaveAttribute('data-object-id', canonicalId!)
  await expect(properties).toContainText('Column C2')

  // The browser row and Properties panel keep the same canonical UUID as the app changes views.
  const views = ['แปลนพื้น', 'แปลนคาน', 'รูปด้านเหนือ', 'รูปด้านใต้', 'รูปด้านตะวันออก', 'รูปด้านตะวันตก', '3D ดูตัวอย่าง']
  for (const view of views) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await expect(properties).toHaveAttribute('data-object-id', canonicalId!)
    await expect(properties).toContainText('Column C2')
  }

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const sameRow = page.locator(`li[data-object-id="${canonicalId}"]`)
  await expect(sameRow.locator('.cf-browser-object')).toHaveAttribute('aria-selected', 'true')
  await expect(sameRow.locator('.cf-browser-object')).toContainText('C2')
})

test('plan, framing, and roof plan share pan and zoom navigation', async ({ page }) => {
  await page.goto('/')
  const planCanvas = page.locator('.cf-plan-canvas')
  const canvasElement = canvas(page)
  const bounds = await canvasElement.boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(start.x + 76, start.y + 42, { steps: 4 })
  await page.mouse.up({ button: 'middle' })

  const panX = await planCanvas.getAttribute('data-viewport-pan-x')
  const panY = await planCanvas.getAttribute('data-viewport-pan-y')
  const zoom = await planCanvas.getAttribute('data-viewport-zoom')
  expect(panX).not.toBeNull()
  expect(panY).not.toBeNull()
  await page.getByRole('button', { name: 'แปลนคาน', exact: true }).click()
  await expect(page.locator('.cf-plan-canvas')).toHaveAttribute('data-viewport-pan-x', panX!)
  await expect(page.locator('.cf-plan-canvas')).toHaveAttribute('data-viewport-pan-y', panY!)
  await expect(page.locator('.cf-plan-canvas')).toHaveAttribute('data-viewport-zoom', zoom!)

  await page.locator('.cf-plan-canvas').getByRole('button', { name: 'ซูมเข้า' }).click()
  const framingZoom = await page.locator('.cf-plan-canvas').getAttribute('data-viewport-zoom')
  await page.getByRole('button', { name: 'แปลนหลังคา', exact: true }).click()
  await expect(page.locator('.cf-plan-canvas')).toHaveAttribute('data-viewport-zoom', framingZoom!)
})

test('Project Browser numeric group move commits once and preserves UUIDs through Undo/Redo', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.30, 0.45)
  await clickCanvasFraction(page, 0.70, 0.45)
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const rows = page.locator('li[data-object-type="structure.column"]')
  await expect(rows).toHaveCount(2)
  const ids = await rows.evaluateAll(elements => elements.map(element => element.getAttribute('data-object-id')))
  expect(ids[0]).toBeTruthy()
  expect(ids[1]).toBeTruthy()

  const readPosition = async (id: string) => {
    await page.getByRole('tab', { name: 'รายการ' }).click()
    await page.locator('li[data-object-id="' + id + '"] .cf-browser-object').click()
    const text = await page.getByTestId('properties-selection').innerText()
    const position = text.match(/ตำแหน่ง:\s*\n?([^\n]+)/)?.[1]
    expect(position, `column ${id} should expose its current coordinates`).toBeTruthy()
    return position
  }
  const before = [await readPosition(ids[0]!), await readPosition(ids[1]!)]

  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.locator('li[data-object-id="' + ids[0] + '"] .cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.locator('li[data-object-id="' + ids[1] + '"] .cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  await page.getByRole('spinbutton', { name: 'ระยะย้ายแกน X เมตร' }).fill('1')
  await page.getByRole('spinbutton', { name: 'ระยะย้ายแกน Y เมตร' }).fill('0.5')
  await page.getByRole('button', { name: 'ย้ายตามระยะ · Undo ได้' }).click()
  await expect(page.getByRole('status')).toContainText('ย้าย 2 ชิ้น · ΔX 1.000 · ΔY 0.500')

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(page.getByRole('button', { name: 'ทำซ้ำ' })).toBeEnabled()
  expect([await readPosition(ids[0]!), await readPosition(ids[1]!)]).toEqual(before)
  await expect(page.getByRole('button', { name: 'ทำซ้ำ' })).toBeEnabled()
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(page.getByRole('button', { name: 'ย้อนกลับ' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'ทำซ้ำ' })).toBeDisabled()
  const after = [await readPosition(ids[0]!), await readPosition(ids[1]!)]
  expect(after).not.toEqual(before)
  await page.getByRole('tab', { name: 'รายการ' }).click()
  for (const id of ids) await expect(page.locator(`li[data-object-id="${id}"]`)).toBeVisible()
})

test('Project Browser array previews before one atomic commit and supports Undo/Redo', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.50, 0.45)
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const rows = page.locator('li[data-object-type="structure.column"]')
  await expect(rows).toHaveCount(1)
  const sourceId = await rows.first().getAttribute('data-object-id')
  expect(sourceId).toBeTruthy()
  await rows.first().locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 1 ชิ้น').click()
  await page.getByRole('spinbutton', { name: 'จำนวนสำเนาในอาร์เรย์' }).fill('2')
  await page.getByRole('spinbutton', { name: 'ระยะอาร์เรย์แกน X เมตร' }).fill('1')
  await page.getByRole('spinbutton', { name: 'ระยะอาร์เรย์แกน Y เมตร' }).fill('0')
  await page.getByRole('button', { name: 'แสดงตัวอย่างอาร์เรย์' }).click()

  await expect(page.getByRole('status')).toContainText('Preview อาร์เรย์ 2 ชิ้นใน 2 ชุดแล้ว')
  await expect(rows).toHaveCount(1)
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(rows).toHaveCount(3)
  await expect(page.locator(`li[data-object-id="${sourceId}"]`)).toBeVisible()

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(rows).toHaveCount(1)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(rows).toHaveCount(3)
})

test('Project Browser visibility persists per view and level after autosave and reload', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'ผนัง' }).click()
  await clickCanvasFraction(page, 0.30, 0.45)
  await clickCanvasFraction(page, 0.70, 0.45)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const row = page.locator('li[data-object-type="architecture.wall"]').first()
  await expect(row).toBeVisible()
  await row.locator('.cf-browser-visibility').click()
  await expect(row.locator('.cf-browser-visibility')).toHaveAttribute('title', 'แสดงวัตถุ')
  await expect(page.getByRole('status').filter({ hasText: 'บันทึกในเครื่องแล้ว' })).toBeVisible()

  await page.reload()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const restoredRow = page.locator('li[data-object-type="architecture.wall"]').first()
  await expect(restoredRow.locator('.cf-browser-visibility')).toHaveAttribute('title', 'แสดงวัตถุ')

  await page.getByRole('button', { name: 'รูปด้านเหนือ' }).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(page.locator('li[data-object-type="architecture.wall"] .cf-browser-visibility').first()).toHaveAttribute('title', 'ซ่อนวัตถุ')

  await page.getByRole('button', { name: 'แปลนพื้น', exact: true }).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(page.locator('li[data-object-type="architecture.wall"] .cf-browser-visibility').first()).toHaveAttribute('title', 'แสดงวัตถุ')
  await page.getByRole('button', { name: 'แสดงทั้งหมด' }).click()
  await expect(page.locator('li[data-object-type="architecture.wall"] .cf-browser-visibility').first()).toHaveAttribute('title', 'ซ่อนวัตถุ')
})

test('Project Browser saves and applies persistent view templates', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.61, 0.64)
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const column = page.locator('li[data-object-type="structure.column"]').first()
  await expect(column).toBeVisible()
  await column.locator('.cf-browser-visibility').click()
  await expect(column.locator('.cf-browser-visibility')).toHaveAttribute('title', 'แสดงวัตถุ')

  await page.getByLabel('ชื่อแม่แบบมุมมอง').fill('Presentation plan')
  await page.getByRole('button', { name: 'บันทึกแม่แบบ' }).click()
  const template = page.locator('[data-view-template-id]')
  await expect(template).toContainText('Presentation plan')
  const savedLevel = await page.locator('.cf-browser-levels button.is-active').textContent()

  await page.getByRole('button', { name: 'รูปด้านเหนือ' }).click()
  await expect(page.locator('.cf-browser-views button.is-active')).toHaveText('เหนือ')
  if (await page.locator('.cf-browser-levels button').count() > 1) await page.locator('.cf-browser-levels button').last().click()
  await page.getByRole('button', { name: 'ใช้แม่แบบ Presentation plan' }).click()
  await expect(page.locator('.cf-browser-views button.is-active')).toHaveText('แปลน')
  await expect(page.locator('.cf-browser-levels button.is-active')).toHaveText(savedLevel!)
  await expect(column.locator('.cf-browser-visibility')).toHaveAttribute('title', 'แสดงวัตถุ')

  await page.getByRole('button', { name: 'ลบแม่แบบ Presentation plan' }).click()
  await expect(page.locator('[data-view-template-id]')).toHaveCount(0)
})

test('Project Browser splits an unhosted wall with preview and keeps the original UUID', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'ผนัง' }).click()
  await clickCanvasFraction(page, 0.30, 0.45)
  await clickCanvasFraction(page, 0.70, 0.45)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const originalRow = page.locator('li[data-object-type="architecture.wall"]').first()
  await expect(originalRow).toBeVisible()
  const originalId = await originalRow.getAttribute('data-object-id')
  expect(originalId).toBeTruthy()
  await originalRow.locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 1 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Split' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()

  const wallRows = page.locator('li[data-object-type="architecture.wall"]')
  await expect(wallRows).toHaveCount(2)
  await expect(page.locator(`li[data-object-id="${originalId}"]`)).toBeVisible()
  const ids = await wallRows.evaluateAll(rows => rows.map(row => row.getAttribute('data-object-id')))
  expect(new Set(ids).size).toBe(2)
  const undoButton = page.getByRole('button', { name: 'ย้อนกลับ' })
  await expect(undoButton).toBeEnabled()
  await undoButton.click()
  await expect(page.getByRole('button', { name: 'ทำซ้ำ' })).toBeEnabled()
  await expect(wallRows).toHaveCount(1)
  await expect(page.locator(`li[data-object-id="${originalId}"]`)).toBeVisible()
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(wallRows).toHaveCount(2)
  await expect(page.locator(`li[data-object-id="${originalId}"]`)).toBeVisible()
})

test('Project Browser previews align, offset, and mirror, then joins line objects atomically', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'ผนัง' }).click()
  await clickCanvasFraction(page, 0.20, 0.50)
  await clickCanvasFraction(page, 0.50, 0.50)
  await page.keyboard.press('Escape')
  await clickCanvasFraction(page, 0.50, 0.50)
  await clickCanvasFraction(page, 0.80, 0.50)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const walls = page.locator('li[data-object-type="architecture.wall"]')
  await expect(walls).toHaveCount(2)
  const ids = await walls.evaluateAll(rows => rows.map(row => row.getAttribute('data-object-id')))
  expect(ids[0]).toBeTruthy()
  expect(ids[1]).toBeTruthy()
  await walls.nth(0).locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await walls.nth(1).locator('.cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()

  const openEditTools = async () => page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  const preview = page.getByText('Preview การแปลง')
  await openEditTools()
  await page.getByRole('button', { name: 'แสดงตัวอย่างการจัดแนว' }).click()
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(preview).toHaveCount(0)

  await openEditTools()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Offset' }).click()
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(preview).toHaveCount(0)

  await openEditTools()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Mirror' }).click()
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(preview).toHaveCount(0)

  await openEditTools()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Join' }).click()
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()
  await expect(walls).toHaveCount(1)
  await expect(page.locator(`li[data-object-id="${ids[0]}"]`)).toBeVisible()
  const undo = page.getByRole('button', { name: 'ย้อนกลับ' })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(walls).toHaveCount(2)
  await expect(page.locator(`li[data-object-id="${ids[0]}"]`)).toBeVisible()
  await expect(page.locator(`li[data-object-id="${ids[1]}"]`)).toBeVisible()
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(walls).toHaveCount(1)
  await expect(page.locator(`li[data-object-id="${ids[0]}"]`)).toBeVisible()
})

test('Project Browser trims a selected line at a second line preview and preserves the target UUID', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'ผนัง' }).click()
  await clickCanvasFraction(page, 0.25, 0.5)
  await clickCanvasFraction(page, 0.75, 0.5)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'ตัวเลือกการวาด · ผนัง' }).click()
  await clickCanvasFraction(page, 0.5, 0.25)
  await clickCanvasFraction(page, 0.5, 0.75)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const rows = page.locator('li[data-object-type="architecture.wall"]')
  await expect(rows).toHaveCount(2)
  const targetId = await rows.nth(0).getAttribute('data-object-id')
  const cutterId = await rows.nth(1).getAttribute('data-object-id')
  expect(targetId).toBeTruthy()
  expect(cutterId).toBeTruthy()
  await rows.nth(0).locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await rows.nth(1).locator('.cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Trim' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(page.getByText('Preview การแปลง')).toHaveCount(0)
  await expect(rows).toHaveCount(2)
  await page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Trim' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()
  await expect(page.locator(`li[data-object-id="${targetId}"]`)).toBeVisible()
  await expect(page.locator(`li[data-object-id="${cutterId}"]`)).toBeVisible()
  const undoButton = page.getByRole('button', { name: 'ย้อนกลับ' })
  await expect(undoButton).toBeEnabled()
  await undoButton.click()
  await expect(page.getByRole('button', { name: 'ทำซ้ำ' })).toBeEnabled()
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(page.locator(`li[data-object-id="${targetId}"]`)).toBeVisible()
})

test('column corner grips accept target W/H dimensions and commit through preview', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.50, 0.50)
  await expect(page.locator('body')).toContainText('structure.column')
  await page.locator('.cf-tool-button[title^="เลือก"]').click()

  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  const width = page.getByRole('textbox', { name: 'ขนาดเป้าหมาย W (m)' })
  const height = page.getByRole('textbox', { name: 'ขนาดเป้าหมาย H (m)' })
  let foundGrip = false
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  for (const radius of [8, 16, 24]) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      await page.mouse.move(center.x + sx * radius, center.y + sy * radius)
      await page.mouse.down()
      await page.mouse.move(center.x + sx * radius + 4, center.y + sy * radius + 4)
      if (await width.isVisible().catch(() => false)) { foundGrip = true; break }
      await page.keyboard.press('Escape')
      await page.mouse.up()
    }
    if (foundGrip) break
  }
  expect(foundGrip).toBe(true)
  await width.fill('0.5')
  await height.fill('0.35')
  await height.press('Enter')
  await page.mouse.up()
  await expect(page.locator('body')).toContainText('0.500 × 0.350 m')
})

test('foundation corner grips accept target W/H dimensions and support Undo/Redo', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="ฐานราก"]').click()
  await clickCanvasFraction(page, 0.50, 0.50)
  await expect(page.locator('body')).toContainText('structure.foundation')
  await page.locator('.cf-tool-button[title^="เลือก"]').click()

  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  const width = page.getByRole('textbox', { name: 'ขนาดเป้าหมาย W (m)' })
  const height = page.getByRole('textbox', { name: 'ขนาดเป้าหมาย H (m)' })
  let foundGrip = false
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  for (const radius of [8, 16, 24, 32, 48, 64, 96, 128]) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      await page.mouse.move(center.x + sx * radius, center.y + sy * radius)
      await page.mouse.down()
      await page.mouse.move(center.x + sx * radius + 4, center.y + sy * radius + 4)
      if (await width.isVisible().catch(() => false)) { foundGrip = true; break }
      await page.keyboard.press('Escape')
      await page.mouse.up()
    }
    if (foundGrip) break
  }
  expect(foundGrip).toBe(true)
  await width.fill('1.0')
  await height.fill('0.7')
  await height.press('Enter')
  await page.mouse.up()
  await expect(page.locator('body')).toContainText('1.000 × 0.700 × 0.300 m')
  const undoButton = page.getByRole('button', { name: 'ย้อนกลับ' })
  await expect(undoButton).toBeEnabled()
  await undoButton.click()
  await expect(page.getByRole('button', { name: 'ทำซ้ำ' })).toBeEnabled()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.locator('li[data-object-type="structure.foundation"] .cf-browser-object').click()
  await expect(page.locator('body')).toContainText('0.800 × 0.800 × 0.300 m')
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(page.locator('body')).toContainText('1.000 × 0.700 × 0.300 m')
})

test('wall endpoint grip accepts target length and commits the validated edit', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'ผนัง' }).click()
  await clickCanvasFraction(page, 0.25, 0.45)
  await clickCanvasFraction(page, 0.75, 0.45)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.locator('.cf-tool-button[title^="เลือก"]').click()

  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  const lengthInput = page.getByRole('textbox', { name: 'ความยาวเป้าหมาย (m)' })
  let foundGrip = false
  const gripPoints = await findGripPoints(page, 'blue')
  for (const point of gripPoints) {
    const endpoint = { x: bounds.x + point.x, y: bounds.y + point.y }
    await page.mouse.move(endpoint.x, endpoint.y)
    await page.mouse.down()
    await page.mouse.move(endpoint.x + 3, endpoint.y + 3)
    if (await lengthInput.isVisible().catch(() => false)) { foundGrip = true; break }
    await page.keyboard.press('Escape')
    await page.mouse.up()
  }
  expect(foundGrip).toBe(true)
  await lengthInput.fill('3.0')
  await lengthInput.press('Enter')
  await page.mouse.up()
  await expect(page.getByTestId('properties-selection')).toContainText('WALL LENGTH')
  await expect(page.getByTestId('properties-selection')).toContainText('3.000 m')
})

test('hosted opening jamb accepts a target width and Escape cancels the preview', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'ผนัง' }).click()
  await clickCanvasFraction(page, 0.25, 0.45)
  await clickCanvasFraction(page, 0.75, 0.45)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await page.locator('.cf-tool-button[title^="ประตู"]').click()
  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  let hostedPoint: { x: number; y: number } | null = null
  for (let row = 2; row <= 18 && !hostedPoint; row++) for (let column = 2; column <= 18 && !hostedPoint; column++) {
    const point = { x: bounds.x + bounds.width * column / 20, y: bounds.y + bounds.height * row / 20 }
    await page.mouse.move(point.x, point.y)
    const snap = await page.getByTestId('snap-feedback').innerText()
    const match = snap.match(/Snap:\s*On Wall[^\n]*\(([\d.]+)m\)/i)
    const offset = match ? Number(match[1]) : Number.NaN
    if (offset >= 1.5 && offset <= 2.4) hostedPoint = point
  }
  expect(hostedPoint).not.toBeNull()
  await page.mouse.click(hostedPoint!.x, hostedPoint!.y)
  await expect(page.locator('body')).toContainText('Door D1')
  await page.keyboard.press('Escape')
  await page.locator('.cf-tool-button[title^="เลือก"]').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const doorRow = page.locator('li[data-object-type="door_window.door"]').first()
  await expect(doorRow).toBeVisible()
  await doorRow.locator('.cf-browser-object').click()
  const properties = page.getByTestId('properties-selection')
  await expect(properties).toContainText('0.800 × 2.000 m')

  const boundsForGrip = await canvas(page).boundingBox()
  if (!boundsForGrip) throw new Error('Plan canvas is not visible')
  const jamb = (await findGripPoints(page, 'orange'))[0]
  expect(jamb).toBeTruthy()
  const jambScreen = { x: boundsForGrip.x + jamb.x, y: boundsForGrip.y + jamb.y }
  const widthInput = page.getByRole('textbox', { name: 'ความกว้างเป้าหมายช่องเปิด (m)' })
  await page.mouse.move(jambScreen.x, jambScreen.y)
  await page.mouse.down()
  await page.mouse.move(jambScreen.x + 3, jambScreen.y + 3)
  await expect(widthInput).toBeVisible()
  await widthInput.fill('1.1')
  await widthInput.press('Escape')
  await page.mouse.up()
  await expect(properties).toContainText('0.800 × 2.000 m')

  const nextJamb = (await findGripPoints(page, 'orange'))[0]
  const nextJambScreen = { x: boundsForGrip.x + nextJamb.x, y: boundsForGrip.y + nextJamb.y }
  await page.mouse.move(nextJambScreen.x, nextJambScreen.y)
  await page.mouse.down()
  await page.mouse.move(nextJambScreen.x + 3, nextJambScreen.y + 3)
  await expect(widthInput).toBeVisible()
  await widthInput.fill('1.2')
  await widthInput.press('Enter')
  await page.mouse.up()
  await expect(properties).toContainText('1.200 × 2.000 m')
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(properties).toContainText('0.800 × 2.000 m')
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(properties).toContainText('1.200 × 2.000 m')
})

test('sheet composer drag recenters a viewport through one saved command', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const preview = page.getByTestId('sheet-composer-preview')
  await expect(preview).toBeVisible()
  await preview.scrollIntoViewIfNeeded()
  await page.getByLabel('กำหนดจุดกึ่งกลาง (m)').check()
  await expect(preview).toHaveAttribute('data-manual-center', 'true')
  const centerFields = page.locator('fieldset').filter({ hasText: 'center' }).locator('input')
  const centerX = centerFields.nth(0)
  const centerY = centerFields.nth(1)
  await centerX.fill('0')
  await centerY.fill('0')

  const bounds = await preview.boundingBox()
  if (!bounds) throw new Error('Sheet preview is not visible')
  await preview.hover({ position: { x: bounds.width / 2, y: bounds.height / 2 } })
  const visibleBounds = await preview.boundingBox()
  if (!visibleBounds) throw new Error('Sheet preview is not visible after scrolling')
  await page.mouse.move(visibleBounds.x + visibleBounds.width / 2, visibleBounds.y + visibleBounds.height / 2)
  await page.mouse.down()
  await expect(preview).toHaveAttribute('data-dragging', 'true')
  await page.mouse.move(visibleBounds.x + visibleBounds.width / 2 + 48, visibleBounds.y + visibleBounds.height / 2 + 24, { steps: 4 })
  await expect(preview.getByRole('status')).toContainText('ศูนย์กลาง')
  await page.mouse.up()

  await expect(centerX).not.toHaveValue('0')
  await expect(centerY).not.toHaveValue('0')
  await expect(page.locator('pre[aria-live="polite"]')).toContainText('บันทึกแล้ว')
  await expect(preview.locator('svg')).toBeVisible()
  await page.getByRole('button', { name: 'ปิดแบบและตาราง' }).click()
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const undoneFields = page.locator('fieldset').filter({ hasText: 'center' }).locator('input')
  await expect(undoneFields.nth(0)).toHaveValue('0')
})

