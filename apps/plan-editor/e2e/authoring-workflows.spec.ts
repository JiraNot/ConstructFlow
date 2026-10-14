import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { CommandBus } from '@constructflow/command-runtime'
import { createEmptyProjectDocument, serializeProject } from '@constructflow/project-model'
import { getPlanFinishBoundaries } from '@constructflow/representation-engine'

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

async function clickSurveyPoint(page: Page, xMm: number, yMm: number) {
  const viewport = page.locator('.cf-plan-canvas').first()
  const bounds = await viewport.boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  const panX = Number(await viewport.getAttribute('data-viewport-pan-x'))
  const panY = Number(await viewport.getAttribute('data-viewport-pan-y'))
  const zoom = Number(await viewport.getAttribute('data-viewport-zoom'))
  await canvas(page).click({ position: { x: panX + xMm * zoom, y: panY + yMm * zoom } })
}

function createSyntheticPlanStressProject(objectCount: number) {
  const project = createEmptyProjectDocument(randomUUID(), `Synthetic plan stress · ${objectCount} walls`)
  const templateId = randomUUID()
  const created = CommandBus.execute(project, 'CreateWall', {
    id: templateId,
    mark: 'STRESS-0001',
    level_id: 'L1',
    start_point_mm: [0, 0],
    end_point_mm: [4000, 0],
    thickness_mm: 100,
    height_mm: 2800,
  })
  if (created.result.status !== 'success') throw new Error(`Could not create stress-project wall: ${created.result.errors?.join(', ')}`)
  const seeded = created.updatedProject
  const template = seeded.objects[templateId]
  if (!template) throw new Error('Stress-project wall template was not created')

  for (let index = 1; index < objectCount; index++) {
    const id = randomUUID()
    const column = index % 24
    const row = Math.floor(index / 24)
    const x = column * 5_000
    const y = row * 5_000
    const wall = structuredClone(template)
    wall.id = id
    wall.module_data = {
      ...wall.module_data,
      mark: `STRESS-${String(index + 1).padStart(4, '0')}`,
      start_point_mm: [x, y, 0],
      end_point_mm: [x + 4_000, y, 0],
      length_mm: 4_000,
    }
    seeded.objects[id] = wall
  }
  return serializeProject(seeded)
}

function createSyntheticStraightStairProject() {
  const project = createEmptyProjectDocument(randomUUID(), 'Synthetic straight stair dimension acceptance')
  const id = randomUUID()
  const created = CommandBus.execute(project, 'CreateStair', {
    id,
    mark: 'STAIR-DIM-01',
    level_id: project.project.active_level_id,
    stair_type: 'straight',
    structure_type: 'rc_monolithic',
    start_point_mm: [3000, 3000, 0],
    total_rise_mm: 3000,
    width_mm: 1000,
    num_risers: 18,
    tread_depth_mm: 250,
    landing_depth_mm: 1000,
    has_handrail: false,
  })
  if (created.result.status !== 'success') throw new Error(`Could not create test stair: ${created.result.errors?.join(', ')}`)
  return serializeProject(created.updatedProject)
}

function createMultiObjectDeleteProject() {
  let project = createEmptyProjectDocument(randomUUID(), 'Atomic browser delete acceptance')
  for (const [index, y] of [0, 3000].entries()) {
    const result = CommandBus.execute(project, 'CreateWall', {
      id: randomUUID(), mark: `DELETE-${index + 1}`, level_id: project.project.active_level_id,
      start_point_mm: [0, y], end_point_mm: [4000, y], thickness_mm: 100, height_mm: 2800,
    })
    if (result.result.status !== 'success') throw new Error(`Could not create delete-test wall: ${result.result.errors?.join(', ')}`)
    project = result.updatedProject
  }
  return serializeProject(project)
}

function createSlabAndRoofTypeAssignmentProject() {
  let project = createEmptyProjectDocument(randomUUID(), 'Surface type assignment acceptance')
  const levelId = project.project.active_level_id
  const slabType = project.types.find(type => type.object_type === 'structure.slab' && type.name === 'GS')
  const roofType = project.types.find(type => type.object_type === 'roof.system' && type.name === 'RF1')
  if (!slabType || !roofType) throw new Error('Default slab and roof catalog types are required')
  const slabId = randomUUID()
  const slab = CommandBus.execute(project, 'CreateSlab', {
    id: slabId, type_id: slabType.id, mark: slabType.name, level_id: levelId,
    boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
    elevation_mm: 0, elevation_offset_mm: 0, thickness_mm: 120, topping_mm: 0,
    slab_system: 'slab_on_ground', material: 'reinforced_concrete',
  })
  if (slab.result.status !== 'success') throw new Error(`Could not create slab fixture: ${slab.result.errors?.join(', ')}`)
  project = slab.updatedProject
  const roofId = randomUUID()
  const boundary_mm: [number, number][] = [[5000, 0], [9000, 0], [9000, 3000], [5000, 3000]]
  const roof = CommandBus.execute(project, 'GenerateRoof', {
    id: roofId, type_id: roofType.id, mark: roofType.name, level_id: levelId,
    created_phase: 'new_construction', boundary_mm, voids_mm: [], elevation_mm: 2800,
    edges: boundary_mm.map(() => ({ defines_slope: true, slope_deg: 25 })),
    thickness_mm: 30, material: 'metal_sheet',
  })
  if (roof.result.status !== 'success') throw new Error(`Could not create roof fixture: ${roof.result.errors?.join(', ')}`)
  return serializeProject(roof.updatedProject)
}

function createContinuousBeamSplitJoinFixture() {
  let project = createEmptyProjectDocument(randomUUID(), 'Continuous beam split and join acceptance')
  const levelId = project.project.active_level_id
  const columnIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  for (const [index, x] of [0, 2000, 4000, 6000, 8000].entries()) {
    const result = CommandBus.execute(project, 'CreateColumn', {
      id: columnIds[index], mark: `C${index + 1}`, level_id: levelId,
      location_mm: [x, 0, 0], section_mm: [200, 200],
    })
    if (result.result.status !== 'success') throw new Error(`Could not create continuous-beam support: ${result.result.errors?.join(', ')}`)
    project = result.updatedProject
  }
  const beamType = project.types.find(type => type.object_type === 'structure.beam' && type.name === 'B1')
  if (!beamType) throw new Error('Default B1 beam type is required for continuous-beam acceptance')
  const beamId = randomUUID()
  const beam = CommandBus.execute(project, 'CreateBeam', {
    id: beamId, type_id: beamType.id, mark: beamType.name, level_id: levelId,
    start_point_mm: [0, 0, 0], end_point_mm: [8000, 0, 0],
    start_column_id: columnIds[0], end_column_id: columnIds[4], intermediate_support_column_ids: [columnIds[1], columnIds[2], columnIds[3]],
    beam_system: 'continuous', continuity_type: 'interior_span',
  })
  if (beam.result.status !== 'success') throw new Error(`Could not create continuous-beam fixture: ${beam.result.errors?.join(', ')}`)
  return { projectJson: serializeProject(beam.updatedProject), beamId, columnIds }
}

function createHostedWindowAlignmentFixture() {
  let project = createEmptyProjectDocument(randomUUID(), 'Hosted window alignment')
  const levelId = project.project.active_level_id
  const wallIds = [randomUUID(), randomUUID()]
  for (const [index, y] of [0, 3000].entries()) {
    const wall = CommandBus.execute(project, 'CreateWall', {
      id: wallIds[index], mark: 'W1', level_id: levelId,
      start_point_mm: [0, y, 0], end_point_mm: [6000, y, 0], thickness_mm: 120, height_mm: 3000,
    })
    if (wall.result.status !== 'success') throw new Error(`Could not create opening-alignment wall: ${wall.result.errors?.join(', ')}`)
    project = wall.updatedProject
  }
  const windowIds = [randomUUID(), randomUUID()]
  for (const [index, offset] of [1500, 4000].entries()) {
    const y = index * 3000
    const result = CommandBus.execute(project, 'CreateWindow', {
      id: windowIds[index], mark: 'W1', wall_id: wallIds[index],
      location_mm: [offset, y, 1200], offset_along_wall_mm: offset,
      width_mm: 900, height_mm: 1200, sill_height_mm: 900, level_id: levelId,
    })
    if (result.result.status !== 'success') throw new Error(`Could not create hosted window: ${result.result.errors?.join(', ')}`)
    project = result.updatedProject
  }
  return { projectJson: serializeProject(project), wallIds, windowIds }
}

function createHostedWallSplitFixture(crossingOpening = false) {
  let project = createEmptyProjectDocument(randomUUID(), 'Hosted wall split transfer')
  const levelId = project.project.active_level_id
  const wallId = randomUUID()
  const wall = CommandBus.execute(project, 'CreateWall', {
    id: wallId, mark: 'W1', level_id: levelId,
    start_point_mm: [0, 0, 0], end_point_mm: [6000, 0, 0], thickness_mm: 120, height_mm: 3000,
  })
  if (wall.result.status !== 'success') throw new Error(`Could not create hosted split wall: ${wall.result.errors?.join(', ')}`)
  project = wall.updatedProject
  const offsets = crossingOpening ? [1500, 3000, 4500] : [1500, 4500]
  const windowIds = offsets.map(() => randomUUID())
  for (const [index, offset] of offsets.entries()) {
    const result = CommandBus.execute(project, 'CreateWindow', {
      id: windowIds[index], mark: 'W1', wall_id: wallId,
      location_mm: [offset, 0, 1200], offset_along_wall_mm: offset,
      width_mm: 900, height_mm: 1200, sill_height_mm: 900, level_id: levelId,
    })
    if (result.result.status !== 'success') throw new Error(`Could not create split-test window: ${result.result.errors?.join(', ')}`)
    project = result.updatedProject
  }
  return { projectJson: serializeProject(project), wallId, windowIds }
}

function createHostedWallJoinFixture() {
  let project = createEmptyProjectDocument(randomUUID(), 'Hosted wall join')
  const levelId = project.project.active_level_id
  const wallIds = [randomUUID(), randomUUID()]
  const spans = [
    { start: [3000, 0, 0], end: [0, 0, 0] },
    { start: [3000, 0, 0], end: [6000, 0, 0] },
  ]
  for (const [index, span] of spans.entries()) {
    const result = CommandBus.execute(project, 'CreateWall', {
      id: wallIds[index], mark: 'W1', level_id: levelId,
      start_point_mm: span.start, end_point_mm: span.end, thickness_mm: 120, height_mm: 3000,
    })
    if (result.result.status !== 'success') throw new Error(`Could not create hosted join wall: ${result.result.errors?.join(', ')}`)
    project = result.updatedProject
  }
  const windowIds = [randomUUID(), randomUUID()]
  const openings = [
    { wall: wallIds[0], offset: 1000, location: [2000, 0, 1200] },
    { wall: wallIds[1], offset: 1000, location: [4000, 0, 1200] },
  ]
  for (const [index, opening] of openings.entries()) {
    const result = CommandBus.execute(project, 'CreateWindow', {
      id: windowIds[index], mark: 'W1', wall_id: opening.wall, location_mm: opening.location,
      offset_along_wall_mm: opening.offset, width_mm: 900, height_mm: 1200, sill_height_mm: 900, level_id: levelId,
    })
    if (result.result.status !== 'success') throw new Error(`Could not create hosted join window: ${result.result.errors?.join(', ')}`)
    project = result.updatedProject
  }
  return { projectJson: serializeProject(project), wallIds, windowIds }
}

function createHostedWallTrimFixture(windowOffset = 3500) {
  let project = createEmptyProjectDocument(randomUUID(), 'Hosted wall trim')
  const levelId = project.project.active_level_id
  const wallId = randomUUID(), cutterId = randomUUID(), windowId = randomUUID()
  const wall = CommandBus.execute(project, 'CreateWall', {
    id: wallId, mark: 'W1', level_id: levelId,
    start_point_mm: [0, 0, 0], end_point_mm: [6000, 0, 0], thickness_mm: 120, height_mm: 3000,
  })
  if (wall.result.status !== 'success') throw new Error(`Could not create trim target wall: ${wall.result.errors?.join(', ')}`)
  project = wall.updatedProject
  const cutter = CommandBus.execute(project, 'CreateWall', {
    id: cutterId, mark: 'W1', level_id: levelId,
    start_point_mm: [1000, -1500, 0], end_point_mm: [1000, 1500, 0], thickness_mm: 120, height_mm: 3000,
  })
  if (cutter.result.status !== 'success') throw new Error(`Could not create trim cutter wall: ${cutter.result.errors?.join(', ')}`)
  project = cutter.updatedProject
  const window = CommandBus.execute(project, 'CreateWindow', {
    id: windowId, mark: 'W1', wall_id: wallId,
    location_mm: [windowOffset, 0, 1200], offset_along_wall_mm: windowOffset,
    width_mm: 900, height_mm: 1200, sill_height_mm: 900, level_id: levelId,
  })
  if (window.result.status !== 'success') throw new Error(`Could not create trim-test window: ${window.result.errors?.join(', ')}`)
  return { projectJson: serializeProject(window.updatedProject), wallId, cutterId, windowId }
}

async function seedLocalProjectSnapshot(page: Page, projectJson: string) {
  await page.evaluate(async json => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('constructflow-local-projects', 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots')
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('snapshots', 'readwrite')
        transaction.objectStore('snapshots').put({
          projectJson: json,
          savedProjectJson: null,
          replacementBaselineJson: json,
          fileHandle: null,
          savedAt: Date.now(),
        }, 'active-project')
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onerror = () => { database.close(); reject(transaction.error) }
        transaction.onabort = () => { database.close(); reject(transaction.error) }
      }
    })
  }, projectJson)
}

async function readStoredProjectJson(page: Page) {
  return page.evaluate(() => new Promise<string | null>((resolve, reject) => {
    const request = indexedDB.open('constructflow-local-projects', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('snapshots', 'readonly')
      const read = transaction.objectStore('snapshots').get('active-project')
      read.onsuccess = () => {
        database.close()
        resolve((read.result as { projectJson?: string } | undefined)?.projectJson ?? null)
      }
      read.onerror = () => { database.close(); reject(read.error) }
    }
  }))
}

test('AI proposal is previewed, validated, committed through CommandBus, and undoable', async ({ page }) => {
  await page.route('http://localhost:8000/api/ai/plan', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: 'เพิ่มผนังตัวอย่าง',
        questions: [],
        commands: [{ name: 'CreateWall', input: { mark: 'AI-W1', start_point_mm: [1000, 1000], end_point_mm: [4000, 1000], thickness_mm: 100, height_mm: 2800 } }],
      }),
    })
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'AI' }).click()
  await page.getByLabel('Gateway token').fill('test-token')
  await page.getByLabel('คำขอผู้ช่วย AI').fill('เพิ่มผนังทดสอบ')
  await page.getByRole('button', { name: 'สร้างแผนคำสั่ง' }).click()

  const plan = page.getByLabel('แผนคำสั่ง AI')
  await expect(plan).toContainText('เพิ่มผนังตัวอย่าง')
  await expect(plan).toContainText('CreateWall')
  await expect(plan.getByRole('status')).toContainText('ผ่าน validation')
  const apply = plan.getByRole('button', { name: 'ยืนยันและใช้ผ่าน CommandBus' })
  await expect(apply).toBeEnabled()
  await apply.click()
  await expect(page.locator('.cf-ai-notice')).toContainText('ใช้แผน AI แล้ว')
  await expect(page.getByRole('button', { name: 'ย้อนกลับ' })).toBeEnabled()

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const browser = page.getByLabel('Project Browser')
  await browser.getByRole('button', { name: 'ทั้งโครงการ' }).click()
  await browser.getByLabel('ค้นหาวัตถุในโครงการ').fill('AI-W1')
  await expect(browser.locator('li[data-object-id]')).toHaveCount(1)
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(browser.locator('li[data-object-id]')).toHaveCount(0)
})

test('AI panel refreshes extension command descriptors registered while the panel is open', async ({ page }) => {
  let descriptorNames: string[] = []
  await page.route('http://localhost:8000/api/ai/plan', async route => {
    const payload = route.request().postDataJSON() as { command_descriptors?: { name: string }[] }
    descriptorNames = payload.command_descriptors?.map(descriptor => descriptor.name) ?? []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: 'ตั้งบันทึกจาก extension',
        questions: [],
        commands: [{ name: 'sample.ui-fixture.set_note', input: { description: 'extension:from_ai', priority: 2 } }],
      }),
    })
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'AI' }).click()
  await page.evaluate(async () => {
    const fixture = await import('/src/testing/moduleUiFixture.ts')
    fixture.registerModuleUIFixture()
  })
  await page.getByLabel('Gateway token').fill('test-token')
  await page.getByLabel('คำขอผู้ช่วย AI').fill('ตั้งบันทึกจาก extension')
  await page.getByRole('button', { name: 'สร้างแผนคำสั่ง' }).click()
  const plan = page.getByLabel('แผนคำสั่ง AI')
  await expect(plan).toContainText('sample.ui-fixture.set_note')
  expect(descriptorNames).toContain('sample.ui-fixture.set_note')
  await expect(plan.getByRole('status')).toContainText('ผ่าน validation')
  await plan.getByRole('button', { name: 'ยืนยันและใช้ผ่าน CommandBus' }).click()
  await expect(page.locator('.cf-ai-notice')).toContainText('ใช้แผน AI แล้ว')
  await expect.poll(async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return null
    return JSON.parse(raw).project.description
  }).toBe('extension:from_ai (priority 2)')
})

test('extension UI actions collect schema input, require confirmation, and use the shared undoable command session', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'ส่วนขยาย' }).click()
  await expect(page.getByText('ยังไม่มี extension ที่เพิ่มคำสั่งในแผงนี้')).toBeVisible()
  await page.evaluate(async () => {
    const fixture = await import('/src/testing/moduleUiFixture.ts')
    fixture.registerModuleUIFixture()
  })
  const extension = page.getByRole('region', { name: 'Sample extension actions' })
  await expect(extension).toBeVisible()
  await page.getByLabel('Project note').fill('extension:approved note')
  await page.getByLabel('Priority').selectOption('2')
  await page.getByRole('button', { name: 'ตรวจสอบและส่งคำสั่ง' }).click()
  await expect(extension.getByRole('status')).toContainText('ตรวจสอบค่าที่กรอก')
  await expect(page.getByLabel('Project note')).toBeDisabled()
  await page.getByRole('button', { name: 'ยืนยันและส่งคำสั่ง' }).click()
  await expect(extension.getByRole('status')).toContainText('คำสั่งสำเร็จ')
  await expect.poll(async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return null
    return JSON.parse(raw).project.description
  }).toBe('extension:approved note (priority 2)')

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return null
    return JSON.parse(raw).project.description
  }).toBeUndefined()
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return null
    return JSON.parse(raw).project.description
  }).toBe('extension:approved note (priority 2)')
})

test('synthetic 600-wall project supports browser search, persistent selection, cross-view navigation, and reload', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  await seedLocalProjectSnapshot(page, createSyntheticPlanStressProject(600))
  await page.reload()
  await expect(page.locator('.cf-save-status')).toContainText('กู้คืนงานในเครื่อง', { timeout: 30_000 })
  const firstRestoreMs = await page.evaluate(() => performance.now())

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const browser = page.getByLabel('Project Browser')
  await browser.getByRole('button', { name: 'ทั้งโครงการ' }).click()
  const rows = browser.locator('li[data-object-id]')
  await expect(rows).toHaveCount(600, { timeout: 30_000 })
  const primaryPane = page.locator('.cf-multiview-pane').first()
  const searchSelectSamplesMs: number[] = []
  let selectedObjectId: string | null = null
  for (const mark of ['STRESS-0001', 'STRESS-0300', 'STRESS-0600']) {
    await page.getByRole('tab', { name: 'รายการ' }).click()
    await page.evaluate(() => {
      performance.clearMarks('stress-search-select-start')
      performance.clearMarks('stress-search-select-end')
      performance.clearMeasures('stress-search-select')
      performance.mark('stress-search-select-start')
    })
    await browser.getByLabel('ค้นหาวัตถุในโครงการ').fill(mark)
    await expect(rows).toHaveCount(1)
    const objectId = await rows.first().getAttribute('data-object-id')
    expect(objectId).toBeTruthy()
    selectedObjectId = objectId
    await rows.first().locator('.cf-browser-object').click()
    await expect(primaryPane).toHaveAttribute('data-primary-selected-object-id', objectId!)
    const elapsed = await page.evaluate(() => {
      performance.mark('stress-search-select-end')
      const measure = performance.measure('stress-search-select', 'stress-search-select-start', 'stress-search-select-end')
      return measure.duration
    })
    searchSelectSamplesMs.push(elapsed)
  }
  const objectId = selectedObjectId
  expect(objectId).toBeTruthy()

  const planBounds = await canvas(page).boundingBox()
  if (!planBounds) throw new Error('Plan canvas is not visible')
  await page.evaluate(() => {
    const state = window as unknown as { __cfRafProbe?: { running: boolean; samples: number[]; last: number } }
      & { __cfPlanRedrawDurationsMs?: number[] }
    state.__cfPlanRedrawDurationsMs = []
    const probe = { running: true, samples: [] as number[], last: performance.now() }
    state.__cfRafProbe = probe
    const tick = (now: number) => {
      if (!probe.running) return
      probe.samples.push(now - probe.last)
      probe.last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const panCenter = { x: planBounds.x + planBounds.width / 2, y: planBounds.y + planBounds.height / 2 }
  await page.mouse.move(panCenter.x, panCenter.y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(panCenter.x + 96, panCenter.y + 48, { steps: 16 })
  await page.mouse.up({ button: 'middle' })
  await page.mouse.move(panCenter.x, panCenter.y)
  await page.mouse.wheel(0, -240)
  await page.waitForTimeout(300)
  const navigationFrameIntervalsMs = await page.evaluate(() => {
    const state = window as unknown as { __cfRafProbe?: { running: boolean; samples: number[] } }
      & { __cfPlanRedrawDurationsMs?: number[] }
    const probe = state.__cfRafProbe
    if (!probe) return []
    probe.running = false
    return [...probe.samples]
  })
  const planRedrawDurationsMs = await page.evaluate(() => {
    const state = window as unknown as { __cfPlanRedrawDurationsMs?: number[] }
    const samples = [...(state.__cfPlanRedrawDurationsMs ?? [])]
    delete state.__cfPlanRedrawDurationsMs
    return samples
  })
  expect(navigationFrameIntervalsMs.length).toBeGreaterThan(10)
  expect(planRedrawDurationsMs.length).toBeGreaterThan(0)
  const sortedFrameIntervalsMs = [...navigationFrameIntervalsMs].sort((left, right) => left - right)
  const sortedPlanRedrawDurationsMs = [...planRedrawDurationsMs].sort((left, right) => left - right)

  await page.getByRole('tab', { name: 'คุณสมบัติ' }).click()
  await expect(page.getByTestId('properties-selection')).toHaveAttribute('data-object-id', objectId!)
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await browser.getByLabel('ค้นหาวัตถุในโครงการ').fill('')
  await browser.getByRole('button', { name: 'ตะวันออก' }).click()
  await expect(primaryPane).toHaveAttribute('data-primary-selected-object-id', objectId!)

  await page.getByRole('tab', { name: 'รายการ' }).click()
  await browser.getByLabel('ค้นหาวัตถุในโครงการ').fill('STRESS-0600')
  await expect(rows).toHaveCount(1)
  await rows.first().locator('.cf-browser-object').click()
  const initialProjectJson = await readStoredProjectJson(page)
  expect(initialProjectJson).toBeTruthy()
  const initialProject = JSON.parse(initialProjectJson!) as { objects: Record<string, { module_data: Record<string, unknown> }> }
  const initialWall = initialProject.objects[objectId!]
  expect(initialWall).toBeTruthy()
  const initialStart = [...initialWall.module_data.start_point_mm as number[]]
  const initialEnd = [...initialWall.module_data.end_point_mm as number[]]

  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 1 ชิ้น').click()
  await page.getByRole('spinbutton', { name: 'ระยะย้ายแกน X เมตร' }).fill('0.125')
  await page.getByRole('spinbutton', { name: 'ระยะย้ายแกน Y เมตร' }).fill('-0.05')
  const transformStartedAt = await page.evaluate(() => performance.now())
  await page.getByRole('button', { name: 'ย้ายตามระยะ · Undo ได้' }).click()
  await expect(page.getByRole('status')).toContainText('ย้าย 1 ชิ้น · ΔX 0.125 · ΔY -0.050')
  const transformResponseAt = await page.evaluate(() => performance.now())
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    return project.objects[objectId!]?.module_data.start_point_mm
  }).toEqual([Number(initialStart[0]) + 125, Number(initialStart[1]) - 50, initialStart[2]])
  const transformPersistedAt = await page.evaluate(() => performance.now())
  const transformResponseMs = transformResponseAt - transformStartedAt
  const transformAutosaveMs = transformPersistedAt - transformStartedAt
  const autosaveAfterTransformResponseMs = transformPersistedAt - transformResponseAt

  const undoStartedAt = await page.evaluate(() => performance.now())
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    return project.objects[objectId!]?.module_data.start_point_mm
  }).toEqual(initialStart)
  const undoPersistedAt = await page.evaluate(() => performance.now())
  const undoAutosaveMs = undoPersistedAt - undoStartedAt
  const redoStartedAt = await page.evaluate(() => performance.now())
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    return project.objects[objectId!]?.module_data.start_point_mm
  }).toEqual([Number(initialStart[0]) + 125, Number(initialStart[1]) - 50, initialStart[2]])
  const redoPersistedAt = await page.evaluate(() => performance.now())
  const redoAutosaveMs = redoPersistedAt - redoStartedAt
  const movedProjectJson = await readStoredProjectJson(page)
  expect(movedProjectJson).toBeTruthy()
  const movedProject = JSON.parse(movedProjectJson!) as { objects: Record<string, { module_data: Record<string, unknown> }> }
  expect(movedProject.objects[objectId!]?.module_data.start_point_mm).toEqual([Number(initialStart[0]) + 125, Number(initialStart[1]) - 50, initialStart[2]])
  expect(movedProject.objects[objectId!]?.module_data.end_point_mm).toEqual([Number(initialEnd[0]) + 125, Number(initialEnd[1]) - 50, initialEnd[2]])

  await page.reload()
  await expect(page.locator('.cf-save-status')).toContainText('กู้คืนงานในเครื่อง', { timeout: 30_000 })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const restoredBrowser = page.getByLabel('Project Browser')
  await restoredBrowser.getByRole('button', { name: 'ทั้งโครงการ' }).click()
  await expect(restoredBrowser.locator('li[data-object-id]')).toHaveCount(600, { timeout: 30_000 })
  await expect(restoredBrowser.locator(`li[data-object-id="${objectId}"] .cf-browser-object`)).toBeVisible()
  const reopenedProjectJson = await readStoredProjectJson(page)
  expect(reopenedProjectJson).toBeTruthy()
  const reopenedProject = JSON.parse(reopenedProjectJson!) as { objects: Record<string, { module_data: Record<string, unknown> }> }
  expect(reopenedProject.objects[objectId!]?.module_data.start_point_mm).toEqual(movedProject.objects[objectId!]?.module_data.start_point_mm)
  expect(reopenedProject.objects[objectId!]?.module_data.end_point_mm).toEqual(movedProject.objects[objectId!]?.module_data.end_point_mm)
  const reloadRestoreMs = await page.evaluate(() => performance.now())
  const sortedSearchSelectSamples = [...searchSelectSamplesMs].sort((left, right) => left - right)
  const metrics = {
    object_count: 600,
    transform_undo_redo: 'one selected wall moved, undone, redone, and persisted with its original UUID',
    initial_restore_ms: Math.round(firstRestoreMs * 100) / 100,
    reload_restore_ms: Math.round(reloadRestoreMs * 100) / 100,
    transform_response_ms: Math.round(transformResponseMs * 100) / 100,
    transform_to_autosave_ms: Math.round(transformAutosaveMs * 100) / 100,
    autosave_after_transform_response_ms: Math.round(autosaveAfterTransformResponseMs * 100) / 100,
    undo_to_autosave_ms: Math.round(undoAutosaveMs * 100) / 100,
    redo_to_autosave_ms: Math.round(redoAutosaveMs * 100) / 100,
    search_select_sample_count: sortedSearchSelectSamples.length,
    search_select_p50_ms: Math.round(sortedSearchSelectSamples[Math.floor((sortedSearchSelectSamples.length - 1) * 0.5)] * 100) / 100,
    search_select_p95_ms: Math.round(sortedSearchSelectSamples[Math.ceil((sortedSearchSelectSamples.length - 1) * 0.95)] * 100) / 100,
    samples_ms: searchSelectSamplesMs.map(value => Math.round(value * 100) / 100),
    pan_zoom_frame_interval_sample_count: sortedFrameIntervalsMs.length,
    pan_zoom_raf_p50_ms: Math.round(sortedFrameIntervalsMs[Math.floor((sortedFrameIntervalsMs.length - 1) * 0.5)] * 100) / 100,
    pan_zoom_raf_p95_ms: Math.round(sortedFrameIntervalsMs[Math.ceil((sortedFrameIntervalsMs.length - 1) * 0.95)] * 100) / 100,
    pan_zoom_raf_over_50ms_count: navigationFrameIntervalsMs.filter(value => value > 50).length,
    plan_redraw_sample_count: sortedPlanRedrawDurationsMs.length,
    plan_redraw_p50_ms: Math.round(sortedPlanRedrawDurationsMs[Math.floor((sortedPlanRedrawDurationsMs.length - 1) * 0.5)] * 100) / 100,
    plan_redraw_p95_ms: Math.round(sortedPlanRedrawDurationsMs[Math.ceil((sortedPlanRedrawDurationsMs.length - 1) * 0.95)] * 100) / 100,
    fixture: 'synthetic walls; not a surveyed residential model',
  }
  console.log(`[browser-stress] ${JSON.stringify(metrics)}`)
  await test.info().attach('synthetic-600-wall-browser-metrics.json', {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: 'application/json',
  })
})

test('synthetic 5,000-wall project restores, searches, selects, and preserves UUID through reload', async ({ page }) => {
  test.setTimeout(240_000)
  const testStartedAt = Date.now()
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  await seedLocalProjectSnapshot(page, createSyntheticPlanStressProject(5000))
  const restoreStartedAt = Date.now()
  await page.reload()
  await expect(page.locator('.cf-save-status')).toContainText('กู้คืนงานในเครื่อง', { timeout: 60_000 })
  const firstRestoreMs = Date.now() - restoreStartedAt
  console.log(`[browser-stress-stage] ${JSON.stringify({ stage: 'first-restore', elapsed_ms: Date.now() - testStartedAt })}`)

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const browser = page.getByLabel('Project Browser')
  await browser.getByRole('button', { name: 'ทั้งโครงการ' }).click()
  const tree = browser.locator('.cf-browser-tree')
  await expect(tree).toHaveAttribute('data-object-count', '5000')
  const rows = tree.locator('[data-object-id]')
  await browser.getByLabel('ค้นหาวัตถุในโครงการ').fill('STRESS-5000')
  await expect(rows).toHaveCount(1)
  console.log(`[browser-stress-stage] ${JSON.stringify({ stage: 'browser-search', elapsed_ms: Date.now() - testStartedAt })}`)
  const objectId = await rows.first().getAttribute('data-object-id')
  expect(objectId).toBeTruthy()
  await rows.first().locator('.cf-browser-object').click()
  const primaryPane = page.locator('.cf-multiview-pane').first()
  await expect(primaryPane).toHaveAttribute('data-primary-selected-object-id', objectId!)
  await page.getByRole('tab', { name: 'คุณสมบัติ' }).click()
  await expect(page.getByTestId('properties-selection')).toHaveAttribute('data-object-id', objectId!)

  const savedProjectJson = await readStoredProjectJson(page)
  expect(savedProjectJson).toBeTruthy()
  const savedProject = JSON.parse(savedProjectJson!) as { objects: Record<string, unknown> }
  expect(Object.keys(savedProject.objects)).toHaveLength(5000)
  expect(savedProject.objects[objectId!]).toBeTruthy()
  console.log(`[browser-stress-stage] ${JSON.stringify({ stage: 'selected-and-persisted', elapsed_ms: Date.now() - testStartedAt })}`)

  const reloadStartedAt = Date.now()
  const profiler = process.env.CF_PROFILE_LARGE_RESTORE === '1'
    ? await page.context().newCDPSession(page)
    : null
  if (profiler) {
    await profiler.send('Profiler.enable')
    await profiler.send('Profiler.start')
  }
  await page.reload()
  await expect(page.locator('.cf-save-status')).toContainText('กู้คืนงานในเครื่อง', { timeout: 90_000 })
  const reloadReadyAt = Date.now()
  if (profiler) {
    const profile = await profiler.send('Profiler.stop')
    const nodes = new Map(profile.profile.nodes.map((node: { id: number; callFrame: { functionName: string; url: string } }) => [node.id, node.callFrame]))
    const totals = new Map<string, number>()
    profile.profile.samples.forEach((nodeId: number, index: number) => {
      const frame = nodes.get(nodeId)
      if (!frame) return
      const key = `${frame.functionName || '(anonymous)'} · ${frame.url.split('/').slice(-2).join('/')}`
      totals.set(key, (totals.get(key) ?? 0) + (profile.profile.timeDeltas[index] ?? 0))
    })
    console.log(`[browser-restore-cpu-profile] ${JSON.stringify([...totals].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([frame, microseconds]) => ({ frame, milliseconds: Math.round(microseconds / 1000) })))}`)
    await profiler.detach()
  }
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const restoredBrowser = page.getByLabel('Project Browser')
  await restoredBrowser.getByRole('button', { name: 'ทั้งโครงการ' }).click()
  const restoredTree = restoredBrowser.locator('.cf-browser-tree')
  await expect(restoredTree).toHaveAttribute('data-object-count', '5000')
  const browserReadyAt = Date.now()
  const restoredProjectJson = await readStoredProjectJson(page)
  expect(restoredProjectJson).toBeTruthy()
  const restoredProject = JSON.parse(restoredProjectJson!) as { objects: Record<string, unknown> }
  expect(Object.keys(restoredProject.objects)).toHaveLength(5000)
  expect(restoredProject.objects[objectId!]).toBeTruthy()
  const verificationCompleteAt = Date.now()
  console.log(`[browser-stress] ${JSON.stringify({
    object_count: 5000,
    first_restore_ms: firstRestoreMs,
    reload_restore_ms: reloadReadyAt - reloadStartedAt,
    browser_activation_ms: browserReadyAt - reloadReadyAt,
    snapshot_read_and_assert_ms: verificationCompleteAt - browserReadyAt,
    reload_to_verification_ms: verificationCompleteAt - reloadStartedAt,
    searched_object_id: objectId,
    fixture: 'synthetic walls; not a surveyed residential model',
  })}`)
})

async function findGripPoints(page: Page, color: 'blue' | 'orange' | 'slab-edge' | 'stair-width' | 'stair-run') {
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
      // Standard grip outlines use blue/orange; stair grips use teal/purple fills.
      const isGripStroke = color === 'blue'
        ? data[index] <= 16 && data[index + 1] >= 116 && data[index + 1] <= 132 && data[index + 2] >= 224
        : color === 'orange'
          ? data[index] >= 225 && data[index + 1] >= 90 && data[index + 1] <= 140 && data[index + 2] <= 60
          : color === 'slab-edge'
            ? data[index] <= 24 && data[index + 1] >= 132 && data[index + 1] <= 162 && data[index + 2] >= 165 && data[index + 2] <= 195
          : color === 'stair-width'
            ? data[index] <= 20 && data[index + 1] >= 135 && data[index + 1] <= 155 && data[index + 2] >= 125 && data[index + 2] <= 145
            : data[index] >= 115 && data[index] <= 135 && data[index + 1] >= 50 && data[index + 1] <= 70 && data[index + 2] >= 225
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

test('project file controller opens a .cfproj and saves a downloadable copy with the same objects', async ({ page }) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
  })

  const project = createEmptyProjectDocument(randomUUID(), 'File Controller Acceptance')
  const objectId = randomUUID()
  const created = CommandBus.execute(project, 'CreateWall', {
    id: objectId,
    mark: 'FILE-W1',
    level_id: project.project.active_level_id,
    start_point_mm: [1000, 1000],
    end_point_mm: [4000, 1000],
    thickness_mm: 100,
    height_mm: 2800,
  })
  expect(created.result.status).toBe('success')

  await page.goto('/')
  await page.locator('#cfproj-open').setInputFiles({
    name: 'file-controller-acceptance.cfproj',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeProject(created.updatedProject)),
  })
  await expect(page.getByRole('button', { name: 'แก้ชื่อโครงการ: File Controller Acceptance' })).toBeVisible()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const objectRow = page.locator(`li[data-object-id="${objectId}"]`)
  await expect(objectRow).toBeVisible()
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเบราว์เซอร์เครื่องนี้แล้ว')

  const downloadPromise = page.waitForEvent('download')
  await page.getByLabel('ตัวเลือกบันทึก').click()
  await page.getByRole('button', { name: 'บันทึกเป็นไฟล์ .cfproj' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('File Controller Acceptance.cfproj')
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  const downloadedProject = JSON.parse(await readFile(downloadPath!, 'utf8'))
  expect(downloadedProject.project.name).toBe('File Controller Acceptance')
  expect(downloadedProject.objects[objectId]).toBeTruthy()
})

test('Ctrl+S writes the latest project snapshot to the active file handle', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & { __shortcutSaveText?: string; showSaveFilePicker?: () => Promise<unknown> }
    target.showSaveFilePicker = async () => ({
      name: 'shortcut-save.cfproj',
      queryPermission: async () => 'granted',
      createWritable: async () => ({
        write: async (value: string) => { target.__shortcutSaveText = value },
        close: async () => undefined,
      }),
    })
  })
  await page.goto('/')
  await page.getByLabel('ตัวเลือกบันทึก').click()
  await page.getByRole('button', { name: 'บันทึกเป็นไฟล์ .cfproj' }).click()
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกไฟล์ Untitled Project.cfproj แล้ว')

  await page.getByRole('button', { name: 'ผนัง' }).click()
  await clickCanvasFraction(page, 0.30, 0.45)
  await clickCanvasFraction(page, 0.70, 0.45)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+s')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกไฟล์ Untitled Project.cfproj แล้ว')

  const saved = await page.evaluate(() => (window as Window & { __shortcutSaveText?: string }).__shortcutSaveText)
  expect(saved).toBeTruthy()
  const project = JSON.parse(saved!) as { objects: Record<string, { object_type: string }> }
  expect(Object.values(project.objects).filter(object => object.object_type === 'architecture.wall')).toHaveLength(1)
})

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
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'position-on-host')
  await expect(page.locator('[data-tool-step]')).toContainText(/Snap:\s*(?:On Wall|Wall|ผนัง|Host)/i)
  await clickCanvasFraction(page, 0.50, 0.45)
  await expect(page.locator('[data-tool-step]')).toContainText('กำหนดตำแหน่งบนผนัง')
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

test('beam placement clears cancelled steps and repeats through keyboard and mouse', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const beams = page.locator('.cf-browser-tree [data-object-type="structure.beam"]')
  const initialCount = await beams.count()

  await page.locator('.cf-tool-button[title^="คาน"]').click()
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await clickCanvasFraction(page, 0.24, 0.30)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await expect(beams).toHaveCount(initialCount)
  await page.keyboard.press('Escape')
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /เลือก/)

  await page.getByRole('button', { name: /ใช้เครื่องมือล่าสุดซ้ำ/ }).click()
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /คาน/)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await clickCanvasFraction(page, 0.25, 0.62)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')
  const lengthInput = page.getByRole('textbox', { name: /ความยาวช่วงที่วาด/ })
  await lengthInput.fill('1.8')
  await lengthInput.press('Enter')
  await expect(beams).toHaveCount(initialCount + 1)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')

  await page.getByRole('button', { name: /ใช้เครื่องมือล่าสุดซ้ำ/ }).click()
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await clickCanvasFraction(page, 0.60, 0.62)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')
  await clickCanvasFraction(page, 0.75, 0.62)
  await expect(beams).toHaveCount(initialCount + 2)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
})

test('wall chains commit and undo each segment independently', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'รายการ' }).click()

  const walls = page.locator('.cf-browser-tree [data-object-type="architecture.wall"]')
  await page.locator('.cf-tool-button[title^="ผนัง"]').click()
  await clickCanvasFraction(page, 0.22, 0.28)
  await clickCanvasFraction(page, 0.42, 0.28)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')
  await clickCanvasFraction(page, 0.42, 0.44)
  await expect(walls).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(walls).toHaveCount(1)
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(walls).toHaveCount(0)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(walls).toHaveCount(1)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(walls).toHaveCount(2)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
})

test('wall placement previews and commits a clean connected junction', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const walls = page.locator('.cf-browser-tree [data-object-type="architecture.wall"]')
  await page.locator('.cf-tool-button[title^="ผนัง"]').click()
  await clickCanvasFraction(page, 0.20, 0.42)
  await clickCanvasFraction(page, 0.40, 0.42)
  await expect(walls).toHaveCount(1)
  await moveToCanvasFraction(page, 0.10, 0.80)
  await expect(canvas(page)).toHaveAttribute('data-wall-junction-preview', 'true')
  const tealPreviewPixels = await canvas(page).evaluate(element => {
    const data = element.getContext('2d')?.getImageData(0, 0, element.width, element.height).data
    if (!data) return 0
    let count = 0
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] === 13 && data[index + 1] === 148 && data[index + 2] === 136 && data[index + 3] > 0) count++
    }
    return count
  })
  expect(tealPreviewPixels).toBeGreaterThan(0)
  await clickCanvasFraction(page, 0.10, 0.80)
  await expect(walls).toHaveCount(2)

  await expect.poll(async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return false
    const project = JSON.parse(raw)
    const committedWalls = Object.values(project.objects).filter((object: any) => object.object_type === 'architecture.wall' && object.status !== 'archived')
    if (committedWalls.length !== 2) return false

    const combinedSegments = getPlanFinishBoundaries(project).flatMap(boundary => boundary.segments_mm)
    const footprints = committedWalls.map((wall: any) => {
      const data = wall.module_data
      const start = data.start_point_mm, end = data.end_point_mm
      const length = Math.hypot(end[0] - start[0], end[1] - start[1])
      const halfThickness = Number(data.thickness_mm ?? 120) / 2
      const nx = -(end[1] - start[1]) / length * halfThickness
      const ny = (end[0] - start[0]) / length * halfThickness
      return [[start[0] + nx, start[1] + ny], [end[0] + nx, end[1] + ny], [end[0] - nx, end[1] - ny], [start[0] - nx, start[1] - ny]]
    })
    const pointInside = (point: number[], ring: number[][]) => {
      let inside = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j]
        if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }
    const interiorSeams = combinedSegments.filter(([a, b]) => {
      const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      return footprints.every(ring => pointInside(midpoint, ring))
    })
    const segmentKeys = combinedSegments.map(([a, b]) => [a, b].sort((left, right) => left[0] - right[0] || left[1] - right[1]).flat().join(','))
    const stats = {
      combinedSegmentCount: combinedSegments.length,
      uniqueSegmentCount: new Set(segmentKeys).size,
      interiorSeamCount: interiorSeams.length,
      wallSpans: committedWalls.map((wall: any) => [wall.module_data.start_point_mm, wall.module_data.end_point_mm]),
    }
    return interiorSeams.length === 0 && new Set(segmentKeys).size === segmentKeys.length ? 'clean' : JSON.stringify(stats)
  }).toBe('clean')

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(walls).toHaveCount(1)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(walls).toHaveCount(2)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
})

test('wall placement previews a T junction when starting from a wall midpoint', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const walls = page.locator('.cf-browser-tree [data-object-type="architecture.wall"]')
  const planCanvas = canvas(page)

  await page.locator('.cf-tool-button[title^="ผนัง"]').click()
  await clickCanvasFraction(page, 0.20, 0.42)
  await clickCanvasFraction(page, 0.40, 0.42)
  await expect(walls).toHaveCount(1)

  // Start a fresh segment instead of continuing from the previous endpoint.
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await expect.poll(async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return false
    return Object.values(JSON.parse(raw).objects).some((object: any) => object.object_type === 'architecture.wall' && object.status !== 'archived')
  }).toBe(true)
  const raw = await readStoredProjectJson(page)
  if (!raw) throw new Error('Expected the first wall to be saved')
  const project = JSON.parse(raw)
  const firstWall = Object.values(project.objects).find((object: any) => object.object_type === 'architecture.wall' && object.status !== 'archived') as any
  const [wallStart, wallEnd] = [firstWall.module_data.start_point_mm, firstWall.module_data.end_point_mm]
  const midpoint: [number, number] = [(wallStart[0] + wallEnd[0]) / 2, (wallStart[1] + wallEnd[1]) / 2]
  await clickSurveyPoint(page, midpoint[0], midpoint[1])
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')
  await moveToCanvasFraction(page, 0.30, 0.62)
  await expect(planCanvas).toHaveAttribute('data-wall-junction-preview', 'true')

  await clickCanvasFraction(page, 0.30, 0.62)
  await expect(walls).toHaveCount(2)
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(walls).toHaveCount(1)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(walls).toHaveCount(2)
})

test('beam chains accept numeric spans and undo each segment independently', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const beams = page.locator('.cf-browser-tree [data-object-type="structure.beam"]')
  await page.locator('.cf-tool-button[title^="คาน"]').click()
  await clickCanvasFraction(page, 0.25, 0.62)

  const length = page.getByRole('textbox', { name: /ความยาวช่วงที่วาด/ })
  const angle = page.getByRole('spinbutton', { name: 'องศาช่วงที่วาด (0 องศาขวา 90 องศาขึ้น)' })
  await length.fill('1.5')
  await angle.fill('0')
  await length.press('Enter')
  await expect(beams).toHaveCount(1)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')

  await length.fill('1.0')
  await angle.fill('90')
  await length.press('Enter')
  await expect(beams).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(beams).toHaveCount(1)
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(beams).toHaveCount(0)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(beams).toHaveCount(1)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(beams).toHaveCount(2)
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
  await expect(page.locator('[data-tool-step]')).toContainText('กำหนดตำแหน่งบนผนัง')
  await canvasElement.focus()
  await page.keyboard.press('Enter')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(page.locator('.cf-browser-tree [data-object-type="door_window.window"]')).toHaveCount(1)
  await expect(page.locator('[data-tool-step]')).toContainText('กำหนดตำแหน่งบนผนัง')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /เลือก/)
})

test('hosted opening and point tools cancel cleanly and repeat through mouse and keyboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const doors = page.locator('.cf-browser-tree [data-object-type="door_window.door"]')
  const columns = page.locator('.cf-browser-tree [data-object-type="structure.column"]')
  const initialDoorCount = await doors.count()
  const initialColumnCount = await columns.count()

  await page.locator('.cf-tool-button[title^="ผนัง"]').click()
  await clickCanvasFraction(page, 0.20, 0.45)
  await clickCanvasFraction(page, 0.80, 0.45)

  await page.locator('.cf-tool-button[title^="ประตู"]').click()
  await moveToCanvasFraction(page, 0.50, 0.45)
  await expect(page.getByTestId('snap-feedback')).toContainText(/Snap:/i)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'position-on-host')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /เลือก/)
  await expect(doors).toHaveCount(initialDoorCount)

  await page.getByRole('button', { name: /ใช้เครื่องมือล่าสุดซ้ำ/ }).click()
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /ประตู/)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'find-host-wall')
  await moveToCanvasFraction(page, 0.50, 0.45)
  await page.locator('canvas').first().focus()
  await page.keyboard.press('Enter')
  await expect(doors).toHaveCount(initialDoorCount + 1)

  await page.getByRole('button', { name: /ใช้เครื่องมือล่าสุดซ้ำ/ }).click()
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'find-host-wall')
  await moveToCanvasFraction(page, 0.64, 0.45)
  await expect(page.getByTestId('snap-feedback')).toContainText(/Snap:/i)
  await clickCanvasFraction(page, 0.64, 0.45)
  await expect(doors).toHaveCount(initialDoorCount + 2)

  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await moveToCanvasFraction(page, 0.72, 0.70)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'position')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /เลือก/)
  await expect(columns).toHaveCount(initialColumnCount)

  await page.getByRole('button', { name: /ใช้เครื่องมือล่าสุดซ้ำ/ }).click()
  await expect(page.locator('.cf-tool-button.is-active')).toHaveAttribute('title', /เสา/)
  await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'position')
  await moveToCanvasFraction(page, 0.72, 0.70)
  await page.locator('canvas').first().focus()
  await page.keyboard.press('Enter')
  await expect(columns).toHaveCount(initialColumnCount + 1)
})

test('pipe and moulding tools report pending endpoints and Escape cancels drafts before exiting', async ({ page }) => {
  await page.goto('/')
  for (const workflow of [
    { tool: 'แนวท่อ', family: 'drainage.pipe_route', prompt: 'แนวท่อ น้ำทิ้ง' },
    { tool: 'แนวบัว', family: 'decorative.moulding_run', prompt: 'แนวบัว' },
  ]) {
    await page.locator(`.cf-tool-button[title^="${workflow.tool}"]`).click()
    await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
    await expect(page.locator('[data-tool-step]')).toContainText(workflow.prompt)
    await clickCanvasFraction(page, 0.32, 0.48)
    await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'end-point')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'start-point')
    await expect(page.locator(`.cf-browser-tree [data-object-type="${workflow.family}"]`)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-tool-step]')).toHaveAttribute('data-tool-step', 'ready')
  }
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
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(gridRows).toHaveCount(initialCount)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
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
  const views = ['แปลนพื้น', 'แปลนคาน', 'แปลนหลังคา', 'แปลนฝ้า RCP', 'รูปด้านเหนือ', 'รูปด้านใต้', 'รูปด้านตะวันออก', 'รูปด้านตะวันตก', '3D ดูตัวอย่าง']
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

test('multi-selection type changes commit as one undoable Properties action', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.31, 0.63)
  await clickCanvasFraction(page, 0.69, 0.63)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'รายการ' }).click()

  const rows = page.locator('.cf-browser-tree [data-object-type="structure.column"]')
  await expect(rows).toHaveCount(2)
  const ids = await rows.evaluateAll(elements => elements.map(element => element.getAttribute('data-object-id')).filter((id): id is string => Boolean(id)))
  expect(ids).toHaveLength(2)
  await rows.nth(0).locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await rows.nth(1).locator('.cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'คุณสมบัติ' }).click()
  await expect(page.locator('.cf-inspector-content')).toContainText('เลือก 2 ชิ้น')

  await expect.poll(async () => readStoredProjectJson(page)).toBeTruthy()
  const originalJson = await readStoredProjectJson(page)
  expect(originalJson).toBeTruthy()
  const originalProject = JSON.parse(originalJson!) as { types: Array<{ id: string; name: string }>; objects: Record<string, { module_data: Record<string, unknown> }> }
  const targetType = originalProject.types.find(type => type.name === 'C2')
  expect(targetType).toBeTruthy()
  const originalTypeIds = ids.map(id => originalProject.objects[id]!.module_data.type_id)

  await page.getByLabel('เปลี่ยน Type ให้หลายวัตถุ').selectOption(targetType!.id)
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return []
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    return ids.map(id => project.objects[id]?.module_data.type_id)
  }).toEqual([targetType!.id, targetType!.id])
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return []
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    return ids.map(id => project.objects[id]?.module_data.type_id)
  }).toEqual(originalTypeIds)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return []
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    return ids.map(id => project.objects[id]?.module_data.type_id)
  }).toEqual([targetType!.id, targetType!.id])
})

test('placement type picker applies the chosen catalog type to the created object', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เสา"]').click()

  const placementType = page.getByLabel('ชนิดเสา')
  await expect(placementType).toBeVisible()
  await placementType.selectOption('C2')
  await clickCanvasFraction(page, 0.61, 0.72)

  const properties = page.getByTestId('properties-selection')
  await expect(properties).toHaveAttribute('data-object-type', 'structure.column')
  await expect(properties).toContainText('Column C2')
})

test('contextual type picker searches catalog types by name and then places the result', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เสา"]').click()

  const search = page.getByLabel('ค้นหาในคลังชนิด เสา')
  const picker = page.getByLabel('ชนิดเสา', { exact: true })
  await expect(search).toBeVisible()
  await search.fill('C2')
  await expect(picker.locator('option').filter({ hasText: 'C2' })).toHaveCount(1)
  await picker.selectOption('C2')
  await page.locator('.cf-authoring-controls-toggle').click()
  await clickCanvasFraction(page, 0.82, 0.71)

  await expect(page.getByTestId('properties-selection')).toHaveAttribute('data-object-type', 'structure.column')
  await expect(page.getByTestId('properties-selection')).toContainText('Column C2')
})

test('in-context placement type pickers cover structural, wall, and hosted-opening families', async ({ page }) => {
  await page.goto('/')
  const cases = [
    { tool: 'เสา', label: 'ชนิดเสา', typeName: 'C2' },
    { tool: 'ฐานราก', label: 'ชนิดฐานราก', typeName: 'F2' },
    { tool: 'คาน', label: 'ชนิดคาน', typeName: 'B2' },
    { tool: 'ผนัง', label: 'ชนิดผนัง', typeName: 'AAC 150 mm' },
    { tool: 'ประตู', label: 'ชนิดประตู', typeName: 'D2' },
    { tool: 'หน้าต่าง', label: 'ชนิดหน้าต่าง', typeName: 'W2' },
  ]
  for (const { tool, label, typeName } of cases) {
    await page.locator(`.cf-tool-button[title^="${tool}"]`).click()
    const picker = page.getByLabel(label)
    await expect(picker).toBeVisible()
    await picker.selectOption(typeName)
    await expect(picker).toHaveValue(typeName)
  }
})

test('placement type choices are applied to created columns, foundations, beams, walls, doors, and windows', async ({ page }) => {
  await page.goto('/')
  const properties = page.getByTestId('properties-selection')

  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await page.getByLabel('ชนิดเสา').selectOption('C2')
  await clickCanvasFraction(page, 0.24, 0.72)
  await expect(properties).toHaveAttribute('data-object-type', 'structure.column')
  await expect(properties).toContainText('Column C2')

  await page.locator('.cf-tool-button[title^="ฐานราก"]').click()
  await page.getByLabel('ชนิดฐานราก').selectOption('F2')
  await clickCanvasFraction(page, 0.24, 0.72)
  await expect(properties).toHaveAttribute('data-object-type', 'structure.foundation')
  await expect(properties).toContainText('Footing F2')

  await page.locator('.cf-tool-button[title^="คาน"]').click()
  await page.getByLabel('ชนิดคาน').selectOption('B2')
  await clickCanvasFraction(page, 0.22, 0.26)
  await clickCanvasFraction(page, 0.78, 0.26)
  await page.keyboard.press('Escape')
  await expect(properties).toHaveAttribute('data-object-type', 'structure.beam')
  await expect(properties).toContainText('Beam B2')

  await page.locator('.cf-tool-button[title^="ผนัง"]').click()
  await page.getByLabel('ชนิดผนัง').selectOption('AAC 150 mm')
  await clickCanvasFraction(page, 0.18, 0.45)
  await clickCanvasFraction(page, 0.82, 0.45)
  await page.keyboard.press('Escape')
  await expect(properties).toHaveAttribute('data-object-type', 'architecture.wall')
  await expect(properties).toContainText('AAC 150 mm')

  await page.locator('.cf-tool-button[title^="ประตู"]').click()
  await page.getByLabel('ชนิดประตู').selectOption('D2')
  await clickCanvasFraction(page, 0.34, 0.45)
  await expect(properties).toHaveAttribute('data-object-type', 'door_window.door')
  await expect(properties).toContainText('Door D2')

  await page.locator('.cf-tool-button[title^="หน้าต่าง"]').click()
  await page.getByLabel('ชนิดหน้าต่าง').selectOption('W2')
  await clickCanvasFraction(page, 0.70, 0.45)
  await expect(properties).toHaveAttribute('data-object-type', 'door_window.window')
  await expect(properties).toContainText('Window W2')
})

test('placement type choices are applied to created slabs and roofs', async ({ page }) => {
  await page.goto('/')
  const properties = page.getByTestId('properties-selection')
  await expect.poll(async () => readStoredProjectJson(page)).toBeTruthy()
  const initialJson = await readStoredProjectJson(page)
  if (!initialJson) throw new Error('Project catalog was not persisted')
  const initialProject = JSON.parse(initialJson) as { types: Array<{ id: string; name: string }> }
  const expectedSlabTypeId = initialProject.types.find(type => type.name === 'S1')?.id
  const expectedRoofTypeId = initialProject.types.find(type => type.name === 'RF-TIMBER')?.id
  expect(expectedSlabTypeId).toBeTruthy()
  expect(expectedRoofTypeId).toBeTruthy()

  await page.locator('.cf-tool-button[title^="พื้น ("]').click()
  const slabType = page.getByLabel('ชนิดพื้น')
  await expect(slabType).toBeVisible()
  await slabType.selectOption('S1')
  await clickCanvasFraction(page, 0.22, 0.22)
  await clickCanvasFraction(page, 0.42, 0.22)
  await clickCanvasFraction(page, 0.42, 0.42)
  await canvas(page).focus()
  await page.keyboard.press('Enter')
  await expect(properties).toHaveAttribute('data-object-type', 'structure.slab')
  const slabId = await properties.getAttribute('data-object-id')
  expect(slabId).toBeTruthy()

  await page.locator('.cf-tool-button[title^="หลังคา"]').click()
  const roofType = page.getByLabel('ชนิดระบบหลังคา')
  await expect(roofType).toBeVisible()
  await roofType.selectOption('RF-TIMBER')
  await clickCanvasFraction(page, 0.58, 0.22)
  await clickCanvasFraction(page, 0.78, 0.22)
  await clickCanvasFraction(page, 0.78, 0.42)
  await clickCanvasFraction(page, 0.58, 0.42)
  await canvas(page).focus()
  await page.keyboard.press('Enter')
  await expect(properties).toHaveAttribute('data-object-type', 'roof.system')
  const roofId = await properties.getAttribute('data-object-id')
  expect(roofId).toBeTruthy()

  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json) as {
      types: Array<{ id: string; name: string }>
      objects: Record<string, { module_data: Record<string, unknown> }>
    }
    return [project.objects[slabId!]?.module_data.type_id, project.objects[roofId!]?.module_data.type_id]
  }).toEqual([expectedSlabTypeId, expectedRoofTypeId])
})

test('selected slabs and roofs can change catalog type from Properties', async ({ page }) => {
  await page.goto('/')
  await seedLocalProjectSnapshot(page, createSlabAndRoofTypeAssignmentProject())
  await page.reload()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const properties = page.getByTestId('properties-selection')
  const picker = page.getByLabel('ชนิดของชิ้นที่เลือก')

  const slabRow = page.locator('li[data-object-type="structure.slab"] .cf-browser-object')
  await slabRow.click()
  await expect(properties).toHaveAttribute('data-object-type', 'structure.slab')
  await expect(picker).toHaveValue('GS')
  await picker.selectOption('S1')
  await expect(picker).toHaveValue('S1')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const roofRow = page.locator('li[data-object-type="roof.system"] .cf-browser-object')
  await page.getByRole('button', { name: 'ทั้งโครงการ' }).click()
  await roofRow.click()
  await expect(properties).toHaveAttribute('data-object-type', 'roof.system')
  await expect(picker).toHaveValue('RF1')
  await picker.selectOption('RF-TIMBER')
  await expect(picker).toHaveValue('RF-TIMBER')
  await expect(page.getByRole('button', { name: 'ย้อนกลับ' })).toBeEnabled()
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(picker).toHaveValue('RF1')
})

test('personal type library persists saved types and imports a project copy through the command bus', async ({ page }) => {
  await page.goto('/')
  await page.getByTitle('คลังชนิด').click()
  let dialog = page.getByRole('dialog', { name: 'คลังชนิด' })
  await dialog.getByLabel('ค้นหาชนิด').fill('C1')
  await expect(dialog.locator('.cf-type-card').first()).toContainText('C1')
  await dialog.getByRole('button', { name: 'บันทึก C1 ลงคลังส่วนตัว' }).click()
  await expect(dialog.getByRole('status')).toContainText('บันทึก C1 ลงคลังส่วนตัวแล้ว')
  const [libraryDownload] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'ส่งออกคลังส่วนตัว' }).click(),
  ])
  expect(libraryDownload.suggestedFilename()).toBe('constructflow-type-library.cflib')
  const downloadedPath = await libraryDownload.path()
  if (!downloadedPath) throw new Error('Exported type library file is unavailable')
  const exportedLibrary = await readFile(downloadedPath)
  const libraryDocument = JSON.parse(exportedLibrary.toString('utf8')) as Record<string, unknown>
  expect(libraryDocument.format).toBe('constructflow-type-library')
  expect(libraryDocument.format_version).toBe(1)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.evaluate(() => localStorage.removeItem('cf-personal-type-library-v1'))
  await page.reload()
  await page.getByTitle('คลังชนิด').click()
  dialog = page.getByRole('dialog', { name: 'คลังชนิด' })
  await expect(dialog.getByRole('button', { name: 'คลังส่วนตัว (0)' })).toBeVisible()
  await dialog.getByLabel('เลือกไฟล์คลังชนิด').setInputFiles({
    name: 'invalid.cflib',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'other-library', format_version: 1, types: [] })),
  })
  await expect(dialog.getByRole('alert')).toContainText('ไม่รองรับรูปแบบ')
  await expect(dialog.getByRole('button', { name: 'คลังส่วนตัว (0)' })).toBeVisible()
  await dialog.getByLabel('เลือกไฟล์คลังชนิด').setInputFiles({
    name: libraryDownload.suggestedFilename(),
    mimeType: 'application/json',
    buffer: exportedLibrary,
  })
  await expect(dialog.getByRole('status')).toContainText('นำเข้าคลังชนิดแล้ว · เพิ่ม 1 · อัปเดต 0')
  await dialog.getByRole('button', { name: 'คลังส่วนตัว (1)' }).click()
  await expect(dialog.locator('.cf-type-card').first()).toContainText('C1')
  await dialog.getByRole('button', { name: 'เพิ่มลงโครงการและเลือก' }).click()
  await expect(dialog).toBeHidden()

  await page.locator('.cf-tool-button[title^="เสา"]').click()
  const placementType = page.getByLabel('ชนิดเสา')
  await expect(placementType.locator('option').filter({ hasText: 'C1-2' })).toHaveCount(1)

  await page.getByTitle('คลังชนิด').click()
  dialog = page.getByRole('dialog', { name: 'คลังชนิด' })
  await dialog.getByRole('button', { name: 'คลังส่วนตัว (1)' }).click()
  await dialog.getByRole('button', { name: 'ลบ C1 จากคลังส่วนตัว' }).click()
  await expect(dialog.getByRole('button', { name: 'คลังส่วนตัว (0)' })).toBeVisible()
})

test('bundled type library searches standard types and adds a missing type through the command bus', async ({ page }) => {
  const project = createEmptyProjectDocument(randomUUID(), 'Bundled catalog import')
  project.types = project.types.filter(type => !(type.object_type === 'structure.column' && type.name === 'SC1'))
  await page.goto('/')
  await seedLocalProjectSnapshot(page, serializeProject(project))
  await page.reload()
  await expect(page.locator('.cf-save-status')).toContainText('กู้คืนงานในเครื่อง')

  await page.getByTitle('คลังชนิด').click()
  const dialog = page.getByRole('dialog', { name: 'คลังชนิด' })
  await dialog.locator('.cf-catalog-categories').getByRole('button', { name: /^เสา/ }).click()
  await dialog.getByLabel('ค้นหาชนิด').fill('SC1')
  await dialog.getByRole('button', { name: /มาตรฐาน ConstructFlow/ }).click()
  await expect(dialog.locator('.cf-type-card')).toHaveCount(1)
  await expect(dialog.locator('.cf-type-card')).toContainText('SC1')
  await dialog.getByRole('button', { name: 'เพิ่มลงโครงการและเลือก' }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return null
    const saved = JSON.parse(raw) as { types: { id: string; object_type: string; name: string }[] }
    return saved.types.some(type => type.object_type === 'structure.column' && type.name === 'SC1')
  }).toBe(true)
})

test('extension assembly preset commits as one shared-session Undo/Redo transaction', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  const readObjectIds = async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return null
    return Object.keys((JSON.parse(raw) as { objects: Record<string, unknown> }).objects)
  }
  await expect.poll(readObjectIds).toEqual([])

  await page.locator('summary[aria-label="เมนูโครงการ"]').click()
  await page.getByRole('button', { name: /ส่วนต่อเติมสำเร็จรูป/ }).click()
  await expect(page.getByText('สร้างส่วนต่อเติมสำเร็จรูป (Parametric Extension Presets)')).toBeVisible()
  await page.getByRole('button', { name: 'สั่งสร้างส่วนต่อเติมทันที' }).click()
  await expect(page.getByText('สร้างส่วนต่อเติมสำเร็จรูป (Parametric Extension Presets)')).toBeHidden()
  await expect.poll(readObjectIds).not.toEqual([])
  const committedIds = await readObjectIds()
  expect(committedIds?.length).toBeGreaterThan(1)

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(readObjectIds).toEqual([])
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(readObjectIds).toEqual(committedIds)
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

test('orthographic elevations share zoom and vertical navigation with mirrored horizontal pans', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'รูปด้านเหนือ', exact: true }).click()
  let elevation = page.getByTestId('elevation-canvas')
  const canvasElement = elevation.locator('canvas')
  const bounds = await canvasElement.boundingBox()
  if (!bounds) throw new Error('North elevation canvas is not visible')
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(start.x + 62, start.y + 28, { steps: 4 })
  await page.mouse.up({ button: 'middle' })
  const northPanX = Number(await elevation.getAttribute('data-elevation-pan-x'))
  const northPanY = await elevation.getAttribute('data-elevation-pan-y')
  const northZoom = await elevation.getAttribute('data-elevation-zoom')
  expect(northPanX).not.toBe(0)

  await page.getByRole('button', { name: 'รูปด้านใต้', exact: true }).click()
  elevation = page.getByTestId('elevation-canvas')
  await expect(elevation).toHaveAttribute('data-elevation-pan-x', String(-northPanX))
  await expect(elevation).toHaveAttribute('data-elevation-pan-y', northPanY!)
  await expect(elevation).toHaveAttribute('data-elevation-zoom', northZoom!)

  await page.getByRole('button', { name: 'รูปด้านตะวันออก', exact: true }).click()
  elevation = page.getByTestId('elevation-canvas')
  await expect(elevation).toHaveAttribute('data-elevation-pan-y', northPanY!)
  await expect(elevation).toHaveAttribute('data-elevation-zoom', northZoom!)
})

test('dragging one selected elevation member moves the selected group in one edit', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'เสา' }).click()
  await clickCanvasFraction(page, 0.34, 0.56)
  await clickCanvasFraction(page, 0.66, 0.56)
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const rows = page.locator('.cf-browser-tree li[data-object-type="structure.column"]')
  await expect(rows).toHaveCount(2)
  const first = rows.nth(0).locator('.cf-browser-object')
  const second = rows.nth(1).locator('.cf-browser-object')
  const properties = page.getByTestId('properties-selection')
  const readPosition = async (row: ReturnType<typeof rows.nth>) => {
    await page.getByRole('tab', { name: 'รายการ' }).click()
    await row.click()
    await expect(properties).toBeVisible()
    return properties.innerText().then(text => text.match(/ตำแหน่ง:\s*\(([^)]+)\)/)?.[1] ?? '')
  }
  const firstBefore = await readPosition(first)
  const secondBefore = await readPosition(second)
  expect(firstBefore).not.toBe('')
  expect(secondBefore).not.toBe('')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await first.click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await second.click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(second).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: 'รูปด้านเหนือ', exact: true }).click()
  const elevation = page.getByTestId('elevation-canvas')
  const bounds = await elevation.locator('canvas').boundingBox()
  if (!bounds) throw new Error('North elevation canvas is not visible')
  const start = { x: bounds.x + bounds.width * 0.424, y: bounds.y + bounds.height * 0.45 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 45, start.y, { steps: 4 })
  await page.mouse.up()

  const firstAfter = await readPosition(first)
  const secondAfter = await readPosition(second)
  expect(firstAfter).not.toBe(firstBefore)
  expect(secondAfter).not.toBe(secondBefore)
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  expect(await readPosition(first)).toBe(firstBefore)
  expect(await readPosition(second)).toBe(secondBefore)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  expect(await readPosition(first)).toBe(firstAfter)
  expect(await readPosition(second)).toBe(secondAfter)
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(rows).toHaveCount(2)
})

test('DXF underlay imports, calibrates from two points, and preserves scale through project reload', async ({ page }) => {
  await page.goto('/')
  const dxf = [
    '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LINE', '10', '0', '20', '0', '11', '5000', '21', '0',
    '0', 'LWPOLYLINE', '70', '1', '10', '0', '20', '0', '10', '5000', '20', '0', '10', '5000', '20', '3500', '10', '0', '20', '3500',
    '0', 'LWPOLYLINE', '70', '0', '10', '2200', '20', '1800', '42', '0.5', '10', '2600', '20', '1800',
    '0', 'HATCH', '91', '1', '92', '2', '72', '0', '73', '1', '93', '4', '10', '200', '20', '200', '42', '0', '10', '1200', '20', '200', '42', '0', '10', '1200', '20', '900', '42', '0', '10', '200', '20', '900', '42', '0',
    '0', 'SPLINE', '70', '0', '71', '3', '72', '8', '73', '4', '40', '0', '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1', '40', '1', '10', '1500', '20', '500', '10', '1500', '20', '1000', '10', '2000', '20', '1000', '10', '2000', '20', '500',
    '0', 'ELLIPSE', '10', '2500', '20', '1750', '11', '600', '21', '0', '40', '0.5', '41', '0', '42', String(Math.PI * 2),
    '0', 'ENDSEC', '0', 'EOF',
  ].join('\n')
  await page.locator('input[accept="image/*,.dxf,application/dxf"]').setInputFiles({
    name: 'survey-plan.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from(dxf),
  })
  await expect(page.locator('.cf-save-status')).toContainText('นำเข้า DXF 6 รายการแล้ว')
  await expect(page.locator('.cf-underlay-button')).toContainText('Underlay ON')
  await expect(page.locator('.cf-tool-button[title^="ปรับสเกลภาพ"]')).toBeVisible()
  await expect.poll(async () => page.locator('.cf-save-status').innerText()).toContain('กำลังบันทึกในเครื่อง')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')

  const importedJson = await readStoredProjectJson(page)
  expect(importedJson).toBeTruthy()
  const importedProject = JSON.parse(importedJson!) as { underlays: Record<string, { scale_mm_per_px: number }> }
  const underlayKey = Object.keys(importedProject.underlays)[0]
  expect(underlayKey).toBeTruthy()
  const importedScale = importedProject.underlays[underlayKey!].scale_mm_per_px

  await page.locator('.cf-tool-button[title^="ปรับสเกลภาพ"]').click()
  await clickCanvasFraction(page, 0.25, 0.55)
  await clickCanvasFraction(page, 0.75, 0.55)
  const calibration = page.locator('.cf-legacy-dialog')
  await expect(calibration).toBeVisible()
  const measuredText = await calibration.innerText()
  const measuredMatch = measuredText.match(/Current Measured\):\s*([\d.]+)\s*m/)
  expect(measuredMatch).toBeTruthy()
  const measuredDistanceMm = Number(measuredMatch![1]) * 1000
  const pixelDistance = measuredDistanceMm / importedScale
  await calibration.locator('input').fill('4.0')
  await calibration.getByRole('button', { name: 'ยืนยันปรับสเกล 1:1' }).click()
  await expect(calibration).toBeHidden()
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json) as { underlays: Record<string, { scale_mm_per_px: number }> }
    return project.underlays[underlayKey!]?.scale_mm_per_px
  }).toBeCloseTo(4000 / pixelDistance, 3)

  const calibratedJson = await readStoredProjectJson(page)
  expect(calibratedJson).toBeTruthy()
  const calibratedProject = JSON.parse(calibratedJson!) as { underlays: Record<string, { scale_mm_per_px: number; rotation_deg: number }> }
  const calibratedUnderlay = calibratedProject.underlays[underlayKey!]
  expect(calibratedUnderlay.scale_mm_per_px).not.toBe(importedScale)

  await page.reload()
  await expect(page.locator('.cf-underlay-button')).toContainText('Underlay ON')
  await expect(page.locator('.cf-tool-button[title^="ปรับสเกลภาพ"]')).toBeVisible()
  const reopenedJson = await readStoredProjectJson(page)
  expect(reopenedJson).toBeTruthy()
  const reopenedProject = JSON.parse(reopenedJson!) as { underlays: Record<string, { scale_mm_per_px: number; rotation_deg: number }> }
  expect(reopenedProject.underlays[underlayKey!]).toEqual(calibratedUnderlay)
})

test('site survey CSV preserves measured and assumed points through project reload', async ({ page }) => {
  await page.goto('/')
  const csv = [
    'id,name,x,y,elevation,source_status,source_reference,boundary_id,boundary_name,units,coordinate_system',
    'P1,North west,0,0,1.20,measured,Field book 12 station A,LOT-9,Parcel,m,local-grid-01',
    'P2,North east,10,0,1.22,measured,Field book 12 station B,LOT-9,Parcel,m,local-grid-01',
    'P3,South east,10,8,,assumed,Deed sketch estimate,LOT-9,Parcel,m,local-grid-01',
  ].join('\n')
  await page.locator('#cf-survey-open').setInputFiles({ name: 'client-site-survey.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.locator('.cf-save-status')).toContainText('นำเข้าข้อมูลสำรวจ 3 จุด · วัดจริง 2 · สมมติ 1')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')

  await page.getByRole('button', { name: 'จัดแปลนให้อยู่ในหน้าจอ' }).click()
  await clickSurveyPoint(page, 0, 0)
  const selectedSurveyPoint = page.getByRole('region', { name: 'จุดสำรวจที่เลือก' })
  await expect(selectedSurveyPoint).toContainText('North west · วัดจริง', { timeout: 2000 })
  await expect(selectedSurveyPoint).toContainText('Field book 12 station A')
  await clickSurveyPoint(page, 10000, 8000)
  await expect(selectedSurveyPoint).toContainText('South east · สมมติ')
  await expect(selectedSurveyPoint).toContainText('Deed sketch estimate')

  await page.reload()
  await page.getByRole('button', { name: 'จัดแปลนให้อยู่ในหน้าจอ' }).click()
  await clickSurveyPoint(page, 10000, 8000)
  await expect(selectedSurveyPoint).toContainText('South east · สมมติ')
  await expect(selectedSurveyPoint).toContainText('Deed sketch estimate')
  await page.locator('.cf-more-menu summary').click()
  await expect(page.getByRole('status').filter({ hasText: 'Survey · client-site-survey · 2 วัดจริง / 1 สมมติ' })).toBeVisible()
})

test('Project Browser deletes a multi-selection atomically with one Undo and Redo', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')
  await seedLocalProjectSnapshot(page, createMultiObjectDeleteProject())
  await page.reload()
  await expect(page.locator('.cf-save-status')).toContainText('กู้คืนงานในเครื่อง')
  await page.getByRole('tab', { name: 'รายการ' }).click()

  const browser = page.getByLabel('Project Browser')
  await browser.getByRole('button', { name: 'ทั้งโครงการ' }).click()
  const rows = browser.locator('.cf-browser-tree [data-object-type="architecture.wall"]')
  await expect(rows).toHaveCount(2)
  await rows.nth(0).locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await rows.nth(1).locator('.cf-browser-object').click({ modifiers: ['Control'] })

  await page.keyboard.press('Delete')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await expect(rows).toHaveCount(0)
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(rows).toHaveCount(2)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(rows).toHaveCount(0)
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

test('Project Browser splits a hosted wall and transfers openings atomically', async ({ page }) => {
  test.setTimeout(60_000)
  const fixture = createHostedWallSplitFixture()
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  await seedLocalProjectSnapshot(page, fixture.projectJson)
  await page.reload()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const originalRow = page.locator(`li[data-object-id="${fixture.wallId}"]`)
  await expect(originalRow).toBeVisible()
  await originalRow.locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 1 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Split' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()

  await expect(page.locator('li[data-object-type="architecture.wall"]')).toHaveCount(2)
  await expect.poll(async () => {
    const snapshot = await readStoredProjectJson(page)
    if (!snapshot) return 0
    return Object.values(JSON.parse(snapshot).objects).filter((item: any) => item.object_type === 'architecture.wall' && item.status !== 'archived').length
  }).toBe(2)
  const raw = await readStoredProjectJson(page)
  expect(raw).toBeTruthy()
  const splitProject = JSON.parse(raw!) as { objects: Record<string, { id: string; object_type: string; host_refs: string[]; module_data: Record<string, any> }>; relationships: Array<{ kind: string; source_id: string; target_id: string }> }
  const originalWall = splitProject.objects[fixture.wallId]
  const newWall = Object.values(splitProject.objects).find(object => object.object_type === 'architecture.wall' && object.id !== fixture.wallId)
  expect(newWall).toBeTruthy()
  const [leftWindowId, rightWindowId] = fixture.windowIds
  const leftWindow = splitProject.objects[leftWindowId]
  const rightWindow = splitProject.objects[rightWindowId]
  expect(leftWindow.module_data.wall_id).toBe(fixture.wallId)
  expect(leftWindow.module_data.offset_along_wall_mm).toBe(1500)
  expect(rightWindow.module_data.wall_id).toBe(newWall!.id)
  expect(rightWindow.module_data.offset_along_wall_mm).toBe(1500)
  expect(rightWindow.host_refs).toEqual([newWall!.id])
  expect(splitProject.relationships).toContainEqual({ kind: 'hosted_on', source_id: rightWindowId, target_id: newWall!.id, role: 'window_wall_host' })
  expect(splitProject.relationships).toContainEqual({ kind: 'hosts', source_id: newWall!.id, target_id: rightWindowId, role: 'wall_window_opening' })

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(page.locator('li[data-object-type="architecture.wall"]')).toHaveCount(1)
  await expect.poll(async () => {
    const snapshot = await readStoredProjectJson(page)
    if (!snapshot) return false
    const current = JSON.parse(snapshot)
    return current.objects[rightWindowId]?.module_data.wall_id === fixture.wallId
      && current.objects[rightWindowId]?.module_data.offset_along_wall_mm === 4500
  }).toBe(true)
  const undoneRaw = await readStoredProjectJson(page)
  const undone = JSON.parse(undoneRaw!)
  expect(undone.objects[rightWindowId].module_data.wall_id).toBe(fixture.wallId)
  expect(undone.objects[rightWindowId].module_data.offset_along_wall_mm).toBe(4500)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(page.locator('li[data-object-type="architecture.wall"]')).toHaveCount(2)
})

test('Project Browser rejects a wall split that would cut through a hosted opening', async ({ page }) => {
  const fixture = createHostedWallSplitFixture(true)
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  await seedLocalProjectSnapshot(page, fixture.projectJson)
  await page.reload()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const wallRow = page.locator(`li[data-object-id="${fixture.wallId}"]`)
  await expect(wallRow).toBeVisible()
  await wallRow.locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 1 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Split' }).click()

  await expect(page.getByText(/Split ผ่านช่องเปิด/)).toBeVisible()
  await expect(page.getByText('Preview การแปลง')).toHaveCount(0)
  await expect(page.locator('li[data-object-type="architecture.wall"]')).toHaveCount(1)
  const raw = await readStoredProjectJson(page)
  expect(raw).toBeTruthy()
  const project = JSON.parse(raw!)
  for (const windowId of fixture.windowIds) expect(project.objects[windowId].module_data.wall_id).toBe(fixture.wallId)
})

test('Project Browser joins hosted walls and keeps openings at their world positions', async ({ page }) => {
  test.setTimeout(60_000)
  const fixture = createHostedWallJoinFixture()
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  await seedLocalProjectSnapshot(page, fixture.projectJson)
  await page.reload()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const firstRow = page.locator(`li[data-object-id="${fixture.wallIds[0]}"]`)
  const secondRow = page.locator(`li[data-object-id="${fixture.wallIds[1]}"]`)
  await expect(firstRow).toBeVisible()
  await firstRow.locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await secondRow.locator('.cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Join' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()
  await expect(page.locator('li[data-object-type="architecture.wall"]')).toHaveCount(1)
  await expect.poll(async () => {
    const snapshot = await readStoredProjectJson(page)
    if (!snapshot) return 0
    return Object.values(JSON.parse(snapshot).objects).filter((item: any) => item.object_type === 'architecture.wall' && item.status !== 'archived').length
  }).toBe(1)

  const raw = await readStoredProjectJson(page)
  expect(raw).toBeTruthy()
  const joined = JSON.parse(raw!) as { objects: Record<string, { id: string; host_refs: string[]; module_data: Record<string, unknown> }>; relationships: Array<{ kind: string; source_id: string; target_id: string }> }
  expect(joined.objects[fixture.wallIds[0]]).toBeTruthy()
  expect(joined.objects[fixture.wallIds[1]]).toBeUndefined()
  expect(joined.objects[fixture.windowIds[0]].module_data.wall_id).toBe(fixture.wallIds[0])
  expect(joined.objects[fixture.windowIds[0]].module_data.offset_along_wall_mm).toBe(2000)
  expect(joined.objects[fixture.windowIds[0]].module_data.location_mm).toEqual([2000, 0, 1200])
  expect(joined.objects[fixture.windowIds[1]].module_data.wall_id).toBe(fixture.wallIds[0])
  expect(joined.objects[fixture.windowIds[1]].module_data.offset_along_wall_mm).toBe(4000)
  expect(joined.objects[fixture.windowIds[1]].module_data.location_mm).toEqual([4000, 0, 1200])
  expect(joined.objects[fixture.windowIds[1]].host_refs).toEqual([fixture.wallIds[0]])
  expect(joined.relationships).toContainEqual({ kind: 'hosted_on', source_id: fixture.windowIds[1], target_id: fixture.wallIds[0], role: 'window_wall_host' })
  expect(joined.relationships).toContainEqual({ kind: 'hosts', source_id: fixture.wallIds[0], target_id: fixture.windowIds[1], role: 'wall_window_opening' })

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(page.locator('li[data-object-type="architecture.wall"]')).toHaveCount(2)
  await expect.poll(async () => {
    const snapshot = await readStoredProjectJson(page)
    if (!snapshot) return false
    const restored = JSON.parse(snapshot)
    return restored.objects[fixture.windowIds[1]]?.module_data.wall_id === fixture.wallIds[1]
  }).toBe(true)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(page.locator('li[data-object-type="architecture.wall"]')).toHaveCount(1)
})

test('Project Browser splits and rejoins an unhosted beam with preview and UUID-preserving undo', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="คาน"]').click()
  await clickCanvasFraction(page, 0.28, 0.52)
  await clickCanvasFraction(page, 0.72, 0.52)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const beams = page.locator('li[data-object-type="structure.beam"]')
  await expect(beams).toHaveCount(1)
  const originalId = await beams.first().getAttribute('data-object-id')
  expect(originalId).toBeTruthy()
  await beams.first().locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 1 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Split' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()

  await expect(beams).toHaveCount(2)
  await expect(page.locator(`li[data-object-id="${originalId}"]`)).toBeVisible()
  const splitIds = await beams.evaluateAll(rows => rows.map(row => row.getAttribute('data-object-id')))
  expect(new Set(splitIds).size).toBe(2)
  expect(splitIds).toContain(originalId)

  await beams.nth(0).locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await beams.nth(1).locator('.cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Join' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()

  await expect(beams).toHaveCount(1)
  await expect(page.locator(`li[data-object-id="${originalId}"]`)).toBeVisible()
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(beams).toHaveCount(2)
  for (const id of splitIds) await expect(page.locator(`li[data-object-id="${id}"]`)).toBeVisible()
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(beams).toHaveCount(1)
  await expect(page.locator(`li[data-object-id="${originalId}"]`)).toBeVisible()
})

test('Project Browser splits a continuous beam at its middle support and rejoins it atomically', async ({ page }) => {
  test.setTimeout(60_000)
  const fixture = createContinuousBeamSplitJoinFixture()
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  await seedLocalProjectSnapshot(page, fixture.projectJson)
  await page.reload()
  await expect(page.locator('.cf-save-status')).toContainText('กู้คืนงานในเครื่อง', { timeout: 30_000 })

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const beams = page.locator('li[data-object-type="structure.beam"]')
  await expect(beams).toHaveCount(1)
  await page.locator(`li[data-object-id="${fixture.beamId}"] .cf-browser-object`).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 1 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Split' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()

  await expect(beams).toHaveCount(2)
  const splitIds = await beams.evaluateAll(rows => rows.map(row => row.getAttribute('data-object-id')))
  expect(splitIds).toContain(fixture.beamId)
  await expect.poll(async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return false
    const current = JSON.parse(raw) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    const currentBeams = splitIds.map(id => current.objects[id!])
    return currentBeams.every(beam => beam && beam.module_data.beam_system === 'continuous')
  }).toBe(true)
  const splitProjectJson = await readStoredProjectJson(page)
  expect(splitProjectJson).toBeTruthy()
  const splitProject = JSON.parse(splitProjectJson!) as { objects: Record<string, { module_data: Record<string, unknown>; host_refs: string[] }> }
  for (const id of splitIds) {
    const beam = splitProject.objects[id!]
    expect(beam.module_data.beam_system).toBe('continuous')
  }
  const splitBeams = splitIds.map(id => splitProject.objects[id!])
  expect(splitBeams.some(beam => beam.module_data.start_column_id === fixture.columnIds[2] || beam.module_data.end_column_id === fixture.columnIds[2])).toBe(true)
  expect(splitBeams.map(beam => beam.module_data.intermediate_support_column_ids).sort((a, b) => String(a?.[0]).localeCompare(String(b?.[0])))).toEqual([[fixture.columnIds[1]], [fixture.columnIds[3]]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))

  await beams.nth(0).locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await beams.nth(1).locator('.cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Join' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()

  await expect(beams).toHaveCount(1)
  await expect(page.locator(`li[data-object-id="${fixture.beamId}"]`)).toBeVisible()
  await expect.poll(async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return false
    const current = JSON.parse(raw) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    const data = current.objects[fixture.beamId]?.module_data
    return data?.middle_support_column_id === fixture.columnIds[1]
      && JSON.stringify(data.intermediate_support_column_ids) === JSON.stringify(fixture.columnIds.slice(1, 4))
      && data.beam_system === 'continuous'
  }).toBe(true)
  const joinedProjectJson = await readStoredProjectJson(page)
  expect(joinedProjectJson).toBeTruthy()
  const joinedProject = JSON.parse(joinedProjectJson!) as { objects: Record<string, { module_data: Record<string, unknown>; host_refs: string[] }> }
  const joinedBeam = joinedProject.objects[fixture.beamId]
  expect(joinedBeam.module_data.middle_support_column_id).toBe(fixture.columnIds[1])
  expect(joinedBeam.module_data.intermediate_support_column_ids).toEqual(fixture.columnIds.slice(1, 4))
  expect(joinedBeam.module_data.beam_system).toBe('continuous')
  expect(joinedBeam.module_data.continuity_type).toBe('interior_span')
  for (const columnId of fixture.columnIds) expect(joinedBeam.host_refs).toContain(columnId)

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(beams).toHaveCount(2)
  for (const id of splitIds) await expect(page.locator(`li[data-object-id="${id}"]`)).toBeVisible()
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(beams).toHaveCount(1)
  const redoneProjectJson = await readStoredProjectJson(page)
  expect(redoneProjectJson).toBeTruthy()
  const redoneProject = JSON.parse(redoneProjectJson!) as { objects: Record<string, { module_data: Record<string, unknown>; host_refs: string[] }> }
  expect(redoneProject.objects[fixture.beamId].module_data.intermediate_support_column_ids).toEqual(fixture.columnIds.slice(1, 4))
})

test('Project Browser aligns hosted windows across parallel walls with preview and one-step Undo/Redo', async ({ page }) => {
  const fixture = createHostedWindowAlignmentFixture()
  await page.goto('/')
  await seedLocalProjectSnapshot(page, fixture.projectJson)
  await page.reload()
  await page.getByRole('tab', { name: 'รายการ' }).click()

  const rows = fixture.windowIds.map(id => page.locator(`li[data-object-id="${id}"]`))
  await rows[0].locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await rows[1].locator('.cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  await page.getByRole('combobox', { name: 'แนวจัดวัตถุที่เลือก' }).selectOption('center-x')
  await page.getByRole('button', { name: 'แสดงตัวอย่างการจัดแนว' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()

  const readWindowState = async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return null
    const project = JSON.parse(raw) as { objects: Record<string, { module_data: { wall_id: string; offset_along_wall_mm: number } }> }
    return fixture.windowIds.map(id => {
      const data = project.objects[id]?.module_data
      return data ? { host: data.wall_id, offset: data.offset_along_wall_mm } : null
    })
  }
  const original = await readWindowState()
  expect(original).toEqual([{ host: fixture.wallIds[0], offset: 1500 }, { host: fixture.wallIds[1], offset: 4000 }])
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()
  await expect.poll(readWindowState).toEqual([{ host: fixture.wallIds[0], offset: 1500 }, { host: fixture.wallIds[1], offset: 1500 }])
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(readWindowState).toEqual(original)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(readWindowState).toEqual([{ host: fixture.wallIds[0], offset: 1500 }, { host: fixture.wallIds[1], offset: 1500 }])
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
})

test('Properties rehost a window through the validated command path and preserve its UUID', async ({ page }) => {
  const fixture = createHostedWindowAlignmentFixture()
  await page.goto('/')
  await seedLocalProjectSnapshot(page, fixture.projectJson)
  await page.reload()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.locator(`li[data-object-id="${fixture.windowIds[0]}"] .cf-browser-object`).click()
  await page.getByRole('tab', { name: 'คุณสมบัติ' }).click()
  await page.locator('details.cf-inspector-section').filter({ hasText: 'ผนัง Host' }).locator('summary').click()
  await page.getByRole('combobox', { name: 'ผนัง Host ปลายทาง' }).selectOption(fixture.wallIds[1])
  await page.getByRole('button', { name: 'เปลี่ยนผนัง Host · Undo ได้' }).click()

  const readHost = async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return null
    const project = JSON.parse(raw) as { objects: Record<string, { id: string; module_data: { wall_id: string; offset_along_wall_mm: number; location_mm: number[] }; host_refs: string[] }> }
    const opening = project.objects[fixture.windowIds[0]]
    return opening ? { id: opening.id, host: opening.module_data.wall_id, offset: opening.module_data.offset_along_wall_mm, location: opening.module_data.location_mm, hostRefs: opening.host_refs } : null
  }
  const rehosted = { id: fixture.windowIds[0], host: fixture.wallIds[1], offset: 1500, location: [1500, 3000, 1200], hostRefs: [fixture.wallIds[1]] }
  await expect.poll(readHost).toEqual(rehosted)
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(readHost).toEqual({ id: fixture.windowIds[0], host: fixture.wallIds[0], offset: 1500, location: [1500, 0, 1200], hostRefs: [fixture.wallIds[0]] })
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(readHost).toEqual(rehosted)
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
  const readLineGeometry = async () => {
    const raw = await readStoredProjectJson(page)
    if (!raw) return null
    const project = JSON.parse(raw) as { objects: Record<string, { module_data: { start_point_mm: number[]; end_point_mm: number[] } }> }
    const lines = ids.map(id => {
      const data = project.objects[id!]?.module_data
      return data ? { start: data.start_point_mm, end: data.end_point_mm } : null
    })
    return lines.every((line): line is { start: number[]; end: number[] } => line !== null) ? lines : null
  }
  await expect.poll(readLineGeometry).not.toBeNull()
  const originalGeometry = await readLineGeometry()
  expect(originalGeometry).not.toBeNull()
  const undo = page.getByRole('button', { name: 'ย้อนกลับ' })
  const redo = page.getByRole('button', { name: 'ทำซ้ำ' })
  const commitAndUndoRedo = async (buttonName: string, geometryChanged: (geometry: NonNullable<typeof originalGeometry>) => boolean) => {
    await openEditTools()
    await page.getByRole('button', { name: buttonName }).click()
    await expect(preview).toBeVisible()
    await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()
    await expect.poll(async () => {
      const geometry = await readLineGeometry()
      return geometry !== null && geometryChanged(geometry as NonNullable<typeof originalGeometry>)
    }).toBe(true)
    const committedGeometry = await readLineGeometry()
    await undo.click()
    await expect.poll(readLineGeometry).toEqual(originalGeometry)
    await redo.click()
    await expect.poll(readLineGeometry).toEqual(committedGeometry)
    await undo.click()
    await expect.poll(readLineGeometry).toEqual(originalGeometry)
  }
  await openEditTools()
  await page.getByRole('button', { name: 'แสดงตัวอย่างการจัดแนว' }).click()
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(preview).toHaveCount(0)

  await commitAndUndoRedo('แสดงตัวอย่างการจัดแนว', geometry => {
    const leftEdges = geometry.map(line => Math.min(line.start[0], line.end[0]))
    return Math.abs(leftEdges[0] - leftEdges[1]) <= 1
  })

  await openEditTools()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Offset' }).click()
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(preview).toHaveCount(0)

  await commitAndUndoRedo('แสดงตัวอย่าง Offset', geometry => {
    const dx = geometry.map((line, index) => line.start[0] - originalGeometry![index].start[0])
    const dy = geometry.map((line, index) => line.start[1] - originalGeometry![index].start[1])
    return Math.hypot(dx[0], dy[0]) > 1 && Math.abs(dx[0] - dx[1]) <= 1 && Math.abs(dy[0] - dy[1]) <= 1
  })

  await openEditTools()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Mirror' }).click()
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(preview).toHaveCount(0)

  await commitAndUndoRedo('แสดงตัวอย่าง Mirror', geometry =>
    JSON.stringify(geometry) !== JSON.stringify(originalGeometry),
  )

  await openEditTools()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Join' }).click()
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()
  await expect(walls).toHaveCount(1)
  await expect(page.locator(`li[data-object-id="${ids[0]}"]`)).toBeVisible()
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(walls).toHaveCount(2)
  await expect(page.locator(`li[data-object-id="${ids[0]}"]`)).toBeVisible()
  await expect(page.locator(`li[data-object-id="${ids[1]}"]`)).toBeVisible()
  await redo.click()
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

test('Project Browser trims a wall while retaining hosted openings and their world positions', async ({ page }) => {
  test.setTimeout(60_000)
  const fixture = createHostedWallTrimFixture()
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  await seedLocalProjectSnapshot(page, fixture.projectJson)
  await page.reload()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const targetRow = page.locator(`li[data-object-id="${fixture.wallId}"]`)
  const cutterRow = page.locator(`li[data-object-id="${fixture.cutterId}"]`)
  await expect(targetRow).toBeVisible()
  await targetRow.locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await cutterRow.locator('.cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Trim' }).click()
  await expect(page.getByText('Preview การแปลง')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยัน · Undo ได้' }).click()
  await expect.poll(async () => {
    const snapshot = await readStoredProjectJson(page)
    if (!snapshot) return false
    const current = JSON.parse(snapshot)
    const wall = current.objects[fixture.wallId]
    const window = current.objects[fixture.windowId]
    return wall?.module_data.start_point_mm?.[0] === 1000
      && window?.module_data.offset_along_wall_mm === 2500
      && window?.module_data.location_mm?.[0] === 3500
  }).toBe(true)

  const raw = await readStoredProjectJson(page)
  const trimmed = JSON.parse(raw!) as { objects: Record<string, { module_data: Record<string, any> }> }
  expect(trimmed.objects[fixture.windowId].module_data.wall_id).toBe(fixture.wallId)
  expect(trimmed.objects[fixture.windowId].module_data.location_mm).toEqual([3500, 0, 1200])
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(async () => {
    const snapshot = await readStoredProjectJson(page)
    if (!snapshot) return false
    const restored = JSON.parse(snapshot)
    return restored.objects[fixture.windowId]?.module_data.offset_along_wall_mm === 3500
  }).toBe(true)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(async () => {
    const snapshot = await readStoredProjectJson(page)
    if (!snapshot) return false
    return JSON.parse(snapshot).objects[fixture.windowId]?.module_data.offset_along_wall_mm === 2500
  }).toBe(true)
})

test('Project Browser rejects trimming a wall through a hosted opening', async ({ page }) => {
  const fixture = createHostedWallTrimFixture(700)
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  await seedLocalProjectSnapshot(page, fixture.projectJson)
  await page.reload()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const targetRow = page.locator(`li[data-object-id="${fixture.wallId}"]`)
  const cutterRow = page.locator(`li[data-object-id="${fixture.cutterId}"]`)
  await targetRow.locator('.cf-browser-object').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await cutterRow.locator('.cf-browser-object').click({ modifiers: ['Control'] })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.getByText('แก้ไขและทำสำเนา · 2 ชิ้น').click()
  await page.getByRole('button', { name: 'แสดงตัวอย่าง Trim' }).click()
  await expect(page.getByText(/Trim ผ่านช่องเปิด/)).toBeVisible()
  await expect(page.getByText('Preview การแปลง')).toHaveCount(0)
  const raw = await readStoredProjectJson(page)
  const unchanged = JSON.parse(raw!)
  expect(unchanged.objects[fixture.wallId].module_data.start_point_mm).toEqual([0, 0, 0])
  expect(unchanged.objects[fixture.windowId].module_data.offset_along_wall_mm).toBe(700)
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

test('move drag dimensions preview, cancel with Escape, and commit numeric deltas with Enter', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.50, 0.50)
  await page.locator('.cf-tool-button[title^="เลือก"]').click()
  await clickCanvasFraction(page, 0.50, 0.50)

  const properties = page.getByTestId('properties-selection')
  const objectId = await properties.getAttribute('data-object-id')
  const initialText = await properties.innerText()
  const initialPosition = initialText.match(/\(([-\d.]+ m, [-\d.]+ m)\)/)?.[0]
  expect(objectId).toBeTruthy()
  expect(initialPosition).toBeTruthy()
  const initialCoordinates = initialPosition!.match(/\(([-\d.]+) m, ([-\d.]+) m\)/)
  expect(initialCoordinates).toBeTruthy()

  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  const origin = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const dx = page.getByRole('textbox', { name: 'ระยะย้ายแกน X (m)' })
  const dy = page.getByRole('textbox', { name: 'ระยะย้ายแกน Y (m)' })

  const beginMove = async () => {
    await page.mouse.move(origin.x, origin.y)
    await page.mouse.down()
    await page.mouse.move(origin.x + 8, origin.y + 8)
    await expect(dx).toBeVisible()
  }

  await beginMove()
  await dx.fill('1.0')
  await dy.fill('0.5')
  await dy.press('Escape')
  await page.mouse.up()
  await expect(properties).toHaveAttribute('data-object-id', objectId!)
  await expect(properties).toContainText(initialPosition!)

  await beginMove()
  await dx.fill('1.0')
  await dy.fill('0.5')
  await dy.press('Enter')
  await page.mouse.up()
  await expect(properties).toHaveAttribute('data-object-id', objectId!)
  const expectedPosition = `(${(Number(initialCoordinates![1]) + 1).toFixed(3)} m, ${(Number(initialCoordinates![2]) + 0.5).toFixed(3)} m)`
  await expect(properties).toContainText(expectedPosition)
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

test('slab edge grip accepts a numeric offset with preview cancellation and UUID-preserving Undo/Redo', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="พื้น ("]').click()
  await clickCanvasFraction(page, 0.25, 0.25)
  await clickCanvasFraction(page, 0.70, 0.25)
  await clickCanvasFraction(page, 0.70, 0.70)
  await canvas(page).focus()
  await page.keyboard.press('Enter')

  await page.locator('.cf-tool-button[title^="เลือก"]').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const slabRow = page.locator('li[data-object-type="structure.slab"]').first()
  await expect(slabRow).toBeVisible()
  const slabId = await slabRow.getAttribute('data-object-id')
  expect(slabId).toBeTruthy()
  await slabRow.locator('.cf-browser-object').click()
  const properties = page.getByTestId('properties-selection')
  await expect(properties).toHaveAttribute('data-object-id', slabId!)

  const readBoundary = async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json)
    return project.objects[slabId!]?.module_data.boundary_mm as [number, number][] | undefined
  }
  await expect.poll(readBoundary).toBeTruthy()
  const originalBoundary = structuredClone((await readBoundary())!)
  const area = (boundary: [number, number][]) => Math.abs(boundary.reduce((sum, point, index) => {
    const next = boundary[(index + 1) % boundary.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2)
  const originalArea = area(originalBoundary)

  const viewport = page.locator('.cf-plan-canvas').first()
  const viewportBounds = await viewport.boundingBox()
  if (!viewportBounds) throw new Error('Plan viewport is not visible')
  const panX = Number(await viewport.getAttribute('data-viewport-pan-x'))
  const panY = Number(await viewport.getAttribute('data-viewport-pan-y'))
  const zoom = Number(await viewport.getAttribute('data-viewport-zoom'))
  const edgeMidpoint: [number, number] = [
    (originalBoundary[0][0] + originalBoundary[1][0]) / 2,
    (originalBoundary[0][1] + originalBoundary[1][1]) / 2,
  ]
  const gripScreen = { x: viewportBounds.x + panX + edgeMidpoint[0] * zoom, y: viewportBounds.y + panY + edgeMidpoint[1] * zoom }
  const offset = page.getByRole('textbox', { name: 'ระยะเยื้องขอบพื้น (m)' })

  const beginEdgeEdit = async () => {
    await page.mouse.move(gripScreen.x, gripScreen.y)
    await page.mouse.down()
    await page.mouse.move(gripScreen.x + 4, gripScreen.y + 4)
    await expect(offset).toBeVisible()
  }

  await beginEdgeEdit()
  await offset.fill('0.2')
  await offset.press('Escape')
  await page.mouse.up()
  await expect(properties).toHaveAttribute('data-object-id', slabId!)
  await expect.poll(readBoundary).toEqual(originalBoundary)

  await beginEdgeEdit()
  await offset.fill('0.2')
  await offset.press('Enter')
  await page.mouse.up()
  await expect(properties).toHaveAttribute('data-object-id', slabId!)
  await expect.poll(async () => {
    const boundary = await readBoundary()
    return boundary ? area(boundary) : originalArea
  }).toBeLessThan(originalArea)
  const resizedBoundary = structuredClone((await readBoundary())!)

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(readBoundary).toEqual(originalBoundary)
  await expect(properties).toHaveAttribute('data-object-id', slabId!)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(readBoundary).toEqual(resizedBoundary)
  await expect(properties).toHaveAttribute('data-object-id', slabId!)
})

test('slab vertex accepts numeric ΔX/ΔY with preview, Escape, commit, and UUID-preserving Undo/Redo', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="พื้น ("]').click()
  await clickCanvasFraction(page, 0.25, 0.25)
  await clickCanvasFraction(page, 0.70, 0.25)
  await clickCanvasFraction(page, 0.70, 0.70)
  await canvas(page).focus()
  await page.keyboard.press('Enter')
  await page.locator('.cf-tool-button[title^="เลือก"]').click()

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const slabRow = page.locator('li[data-object-type="structure.slab"]').first()
  await expect(slabRow).toBeVisible()
  const slabId = await slabRow.getAttribute('data-object-id')
  expect(slabId).toBeTruthy()
  await slabRow.locator('.cf-browser-object').click()
  const properties = page.getByTestId('properties-selection')
  await expect(properties).toHaveAttribute('data-object-id', slabId!)

  const readBoundary = async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json)
    return project.objects[slabId!]?.module_data.boundary_mm as [number, number][] | undefined
  }
  await expect.poll(readBoundary).toBeTruthy()
  const originalBoundary = structuredClone((await readBoundary())!)
  const viewport = page.locator('.cf-plan-canvas').first()
  const bounds = await viewport.boundingBox()
  if (!bounds) throw new Error('Plan viewport is not visible')
  const panX = Number(await viewport.getAttribute('data-viewport-pan-x'))
  const panY = Number(await viewport.getAttribute('data-viewport-pan-y'))
  const zoom = Number(await viewport.getAttribute('data-viewport-zoom'))
  const vertex = originalBoundary[0]
  const grip = { x: bounds.x + panX + vertex[0] * zoom, y: bounds.y + panY + vertex[1] * zoom }
  const deltaX = page.getByRole('textbox', { name: 'ระยะย้ายแกน X (m)' })
  const deltaY = page.getByRole('textbox', { name: 'ระยะย้ายแกน Y (m)' })
  const beginVertexEdit = async () => {
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    await page.mouse.move(grip.x + 4, grip.y + 4)
    await expect(deltaX).toBeVisible()
  }

  await beginVertexEdit()
  await deltaX.fill('0.2')
  await deltaY.fill('0.1')
  await expect.poll(readBoundary).toEqual(originalBoundary)
  await deltaY.press('Escape')
  await page.mouse.up()
  await expect(properties).toHaveAttribute('data-object-id', slabId!)
  await expect.poll(readBoundary).toEqual(originalBoundary)

  await beginVertexEdit()
  await deltaX.fill('0.2')
  await deltaY.fill('0.1')
  await deltaY.press('Enter')
  await page.mouse.up()
  const editedBoundary = structuredClone(originalBoundary)
  editedBoundary[0] = [vertex[0] + 200, vertex[1] + 100]
  const boundaryMatchesEdited = async () => {
    const boundary = await readBoundary()
    return Boolean(boundary && boundary.length === editedBoundary.length && boundary.every((point, index) =>
      Math.hypot(point[0] - editedBoundary[index][0], point[1] - editedBoundary[index][1]) < 1))
  }
  await expect.poll(boundaryMatchesEdited).toBe(true)
  await expect(properties).toHaveAttribute('data-object-id', slabId!)

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(readBoundary).toEqual(originalBoundary)
  await expect(properties).toHaveAttribute('data-object-id', slabId!)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(boundaryMatchesEdited).toBe(true)
  await expect(properties).toHaveAttribute('data-object-id', slabId!)
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

test('beam endpoint grip accepts target span and preserves its UUID through Undo/Redo', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="คาน"]').click()
  await clickCanvasFraction(page, 0.25, 0.40)
  await clickCanvasFraction(page, 0.75, 0.40)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.locator('.cf-tool-button[title^="เลือก"]').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()

  const beamRow = page.locator('.cf-browser-tree [data-object-type="structure.beam"]').first()
  await expect(beamRow).toBeVisible()
  const beamId = await beamRow.getAttribute('data-object-id')
  expect(beamId).toBeTruthy()
  await beamRow.locator('.cf-browser-object').click()
  const properties = page.getByTestId('properties-selection')
  await expect(properties).toHaveAttribute('data-object-id', beamId!)
  const initialSpanMatch = (await properties.innerText()).match(/SPAN LENGTH \(ความยาวช่วงคาน\)\s*([\d.]+)\s*m/)
  expect(initialSpanMatch).toBeTruthy()
  const initialSpan = initialSpanMatch![1]

  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  const lengthInput = page.getByRole('textbox', { name: 'ความยาวเป้าหมาย (m)' })
  let foundGrip = false
  for (const point of await findGripPoints(page, 'blue')) {
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
  await expect(properties).toHaveAttribute('data-object-id', beamId!)
  await expect(properties).toContainText('3.000 m')

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.locator(`li[data-object-id="${beamId}"] .cf-browser-object`).click()
  await expect(page.getByTestId('properties-selection')).toHaveAttribute('data-object-id', beamId!)
  await expect(page.getByTestId('properties-selection')).toContainText(`${initialSpan} m`)

  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.locator(`li[data-object-id="${beamId}"] .cf-browser-object`).click()
  await expect(page.getByTestId('properties-selection')).toHaveAttribute('data-object-id', beamId!)
  await expect(page.getByTestId('properties-selection')).toContainText('3.000 m')
})

test('room-separator endpoint exposes a temporary target length and keeps identity through Undo/Redo', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เส้นแบ่งห้อง"]').click()
  await clickCanvasFraction(page, 0.25, 0.50)
  await clickCanvasFraction(page, 0.75, 0.50)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.locator('.cf-tool-button[title^="เลือก"]').click()
  await page.getByRole('tab', { name: 'รายการ' }).click()

  const separator = page.locator('.cf-browser-tree [data-object-type="architecture.room_separator"]').first()
  await expect(separator).toBeVisible()
  const separatorId = await separator.getAttribute('data-object-id')
  expect(separatorId).toBeTruthy()
  await separator.locator('.cf-browser-object').click()
  const properties = page.getByTestId('properties-selection')
  await expect(properties).toHaveAttribute('data-object-id', separatorId!)

  await expect.poll(async () => readStoredProjectJson(page)).toBeTruthy()
  const originalJson = await readStoredProjectJson(page)
  expect(originalJson).toBeTruthy()
  const originalProject = JSON.parse(originalJson!) as { objects: Record<string, { module_data: Record<string, unknown> }> }
  const originalData = originalProject.objects[separatorId!].module_data
  const originalStart = originalData.start_point_mm as number[]
  const originalEnd = originalData.end_point_mm as number[]
  const originalLength = Math.hypot(originalEnd[0] - originalStart[0], originalEnd[1] - originalStart[1])

  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  const lengthInput = page.getByRole('textbox', { name: 'ความยาวเป้าหมาย (m)' })
  let foundGrip = false
  for (const point of await findGripPoints(page, 'blue')) {
    const endpoint = { x: bounds.x + point.x, y: bounds.y + point.y }
    await page.mouse.move(endpoint.x, endpoint.y)
    await page.mouse.down()
    await page.mouse.move(endpoint.x + 3, endpoint.y + 3)
    if (await lengthInput.isVisible().catch(() => false)) { foundGrip = true; break }
    await page.keyboard.press('Escape')
    await page.mouse.up()
  }
  expect(foundGrip).toBe(true)
  await lengthInput.fill('2.5')
  await lengthInput.press('Enter')
  await page.mouse.up()
  await expect(properties).toHaveAttribute('data-object-id', separatorId!)
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    const data = project.objects[separatorId!]?.module_data
    if (!data?.start_point_mm || !data?.end_point_mm) return null
    const start = data.start_point_mm as number[], end = data.end_point_mm as number[]
    return Math.hypot(end[0] - start[0], end[1] - start[1])
  }).toBeCloseTo(2500, 0)

  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.locator(`li[data-object-id="${separatorId}"] .cf-browser-object`).click()
  await expect(page.getByTestId('properties-selection')).toHaveAttribute('data-object-id', separatorId!)
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    const data = project.objects[separatorId!]?.module_data
    if (!data?.start_point_mm || !data?.end_point_mm) return null
    const start = data.start_point_mm as number[], end = data.end_point_mm as number[]
    return Math.hypot(end[0] - start[0], end[1] - start[1])
  }).toBeCloseTo(originalLength, 0)
  const undoneJson = await readStoredProjectJson(page)
  expect(undoneJson).toBeTruthy()
  const undoneProject = JSON.parse(undoneJson!) as { objects: Record<string, { module_data: Record<string, unknown> }> }
  const undoneData = undoneProject.objects[separatorId!].module_data
  expect(Math.hypot(
    (undoneData.end_point_mm as number[])[0] - (undoneData.start_point_mm as number[])[0],
    (undoneData.end_point_mm as number[])[1] - (undoneData.start_point_mm as number[])[1],
  )).toBeCloseTo(originalLength, 0)

  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await page.getByRole('tab', { name: 'รายการ' }).click()
  await page.locator(`li[data-object-id="${separatorId}"] .cf-browser-object`).click()
  await expect.poll(async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    const data = project.objects[separatorId!]?.module_data
    if (!data?.start_point_mm || !data?.end_point_mm) return null
    const start = data.start_point_mm as number[], end = data.end_point_mm as number[]
    return Math.hypot(end[0] - start[0], end[1] - start[1])
  }).toBeCloseTo(2500, 0)
  const redoneJson = await readStoredProjectJson(page)
  expect(redoneJson).toBeTruthy()
  const redoneProject = JSON.parse(redoneJson!) as { objects: Record<string, { module_data: Record<string, unknown> }> }
  const redoneData = redoneProject.objects[separatorId!].module_data
  expect(Math.hypot(
    (redoneData.end_point_mm as number[])[0] - (redoneData.start_point_mm as number[])[0],
    (redoneData.end_point_mm as number[])[1] - (redoneData.start_point_mm as number[])[1],
  )).toBeCloseTo(2500, 0)
})

for (const workflow of [
  { name: 'pipe route', tool: 'แนวท่อ', family: 'drainage.pipe_route', field: 'nodes_mm' },
  { name: 'moulding run', tool: 'แนวบัว', family: 'decorative.moulding_run', field: 'path_mm' },
] as const) {
  test(`${workflow.name} endpoint accepts target length and preserves UUID through Undo/Redo`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await page.locator(`.cf-tool-button[title^="${workflow.tool}"]`).click()
    await clickCanvasFraction(page, 0.25, 0.46)
    await clickCanvasFraction(page, 0.75, 0.46)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.locator('.cf-tool-button[title^="เลือก"]').click()
    await page.getByRole('tab', { name: 'รายการ' }).click()

    const row = page.locator(`.cf-browser-tree [data-object-type="${workflow.family}"]`).last()
    await expect(row).toBeVisible()
    const objectId = await row.getAttribute('data-object-id')
    expect(objectId).toBeTruthy()
    await row.locator('.cf-browser-object').click()
    const properties = page.getByTestId('properties-selection')
    await expect(properties).toHaveAttribute('data-object-id', objectId!)

    const getSegmentLength = async () => {
      const json = await readStoredProjectJson(page)
      if (!json) return null
      const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
      const data = project.objects[objectId!]?.module_data
      const points = data?.[workflow.field] as number[][] | undefined
      if (!points || points.length < 2) return null
      const start = points[points.length - 2]
      const end = points[points.length - 1]
      return Math.hypot(end[0] - start[0], end[1] - start[1])
    }
    await expect.poll(getSegmentLength).toBeGreaterThan(3000)
    const originalLength = await getSegmentLength()
    expect(originalLength).toBeGreaterThan(3000)

    const bounds = await canvas(page).boundingBox()
    if (!bounds) throw new Error('Plan canvas is not visible')
    const lengthInput = page.getByRole('textbox', { name: 'ความยาวเป้าหมาย (m)' })
    let foundGrip = false
    for (const point of await findGripPoints(page, 'blue')) {
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
    await expect(properties).toHaveAttribute('data-object-id', objectId!)
    await expect.poll(getSegmentLength).toBeCloseTo(3000, 0)

    await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
    await page.getByRole('tab', { name: 'รายการ' }).click()
    await page.locator(`li[data-object-id="${objectId}"] .cf-browser-object`).click()
    await expect(properties).toHaveAttribute('data-object-id', objectId!)
    await expect.poll(getSegmentLength).toBeCloseTo(originalLength!, 0)

    await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
    await page.getByRole('tab', { name: 'รายการ' }).click()
    await page.locator(`li[data-object-id="${objectId}"] .cf-browser-object`).click()
    await expect(properties).toHaveAttribute('data-object-id', objectId!)
    await expect.poll(getSegmentLength).toBeCloseTo(3000, 0)
  })
}

test('stair width and straight-flight run accept target dimensions with UUID-preserving Undo/Redo', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว', { timeout: 30_000 })
  await seedLocalProjectSnapshot(page, createSyntheticStraightStairProject())
  await page.reload()
  await expect(page.locator('.cf-save-status')).toContainText('กู้คืนงานในเครื่อง', { timeout: 30_000 })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const stairRow = page.locator('.cf-browser-tree [data-object-type="architecture.stair"]').first()
  await expect(stairRow).toBeVisible()
  const stairId = await stairRow.getAttribute('data-object-id')
  expect(stairId).toBeTruthy()
  await stairRow.locator('.cf-browser-object').click()
  const properties = page.getByTestId('properties-selection')
  await expect(properties).toHaveAttribute('data-object-id', stairId!)
  await page.getByRole('button', { name: 'จัดแปลนให้อยู่ในหน้าจอ' }).click()
  for (let zoomOut = 0; zoomOut < 4; zoomOut++) await page.getByRole('button', { name: 'ซูมออก' }).click()

  const readStair = async () => {
    const json = await readStoredProjectJson(page)
    if (!json) return null
    const project = JSON.parse(json) as { objects: Record<string, { module_data: Record<string, unknown> }> }
    return project.objects[stairId!]?.module_data ?? null
  }
  await expect.poll(async () => Number((await readStair())?.width_mm)).toBeGreaterThan(0)
  const original = await readStair()
  expect(original).toBeTruthy()
  const originalWidth = Number(original!.width_mm)
  const originalRun = Math.max(1, Number(original!.num_risers) - 1) * Number(original!.tread_depth_mm)

  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('Plan canvas is not visible')
  const applyGripDimension = async (kind: 'stair-width' | 'stair-run', label: string, target: string) => {
    const input = page.getByRole('textbox', { name: label })
    const data = await readStair()
    if (!data) throw new Error('Selected stair is missing from the project')
    const [sx, sy] = data.start_point_mm as number[]
    const angle = Number(data.rotation_deg ?? 0) * Math.PI / 180
    const run = Math.max(1, Number(data.num_risers) - 1) * Number(data.tread_depth_mm)
    const side = data.turn_direction === 'left' && data.stair_type !== 'straight' ? -1 : 1
    const grip = kind === 'stair-width'
      ? [sx - Math.sin(angle) * Number(data.width_mm) * side, sy + Math.cos(angle) * Number(data.width_mm) * side]
      : [sx + Math.cos(angle) * run, sy + Math.sin(angle) * run]
    const viewport = page.locator('.cf-plan-canvas').first()
    const panX = Number(await viewport.getAttribute('data-viewport-pan-x'))
    const panY = Number(await viewport.getAttribute('data-viewport-pan-y'))
    const zoom = Number(await viewport.getAttribute('data-viewport-zoom'))
    const x = bounds.x + panX + grip[0] * zoom, y = bounds.y + panY + grip[1] * zoom
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 3, y + 3)
    await expect(input).toBeVisible()
    await input.fill(target)
    await input.press('Enter')
    await page.mouse.up()
    await expect(properties).toHaveAttribute('data-object-id', stairId!)
  }

  await applyGripDimension('stair-run', 'ความยาวช่วงบันไดเป้าหมาย (m)', '5.0')
  await expect.poll(async () => {
    const data = await readStair()
    return Math.max(1, Number(data?.num_risers) - 1) * Number(data?.tread_depth_mm)
  }).toBeCloseTo(5000, 0)
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(async () => {
    const data = await readStair()
    return Math.max(1, Number(data?.num_risers) - 1) * Number(data?.tread_depth_mm)
  }).toBeCloseTo(originalRun, 0)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(async () => {
    const data = await readStair()
    return Math.max(1, Number(data?.num_risers) - 1) * Number(data?.tread_depth_mm)
  }).toBeCloseTo(5000, 0)

  await applyGripDimension('stair-width', 'ความกว้างเป้าหมายบันได (m)', '1.2')
  await expect.poll(async () => Number((await readStair())?.width_mm)).toBeCloseTo(1200, 0)
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect.poll(async () => Number((await readStair())?.width_mm)).toBeCloseTo(originalWidth, 0)
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect.poll(async () => Number((await readStair())?.width_mm)).toBeCloseTo(1200, 0)
  await expect.poll(async () => {
    const data = await readStair()
    return Math.max(1, Number(data?.num_risers) - 1) * Number(data?.tread_depth_mm)
  }).toBeCloseTo(5000, 0)
  await expect(properties).toHaveAttribute('data-object-id', stairId!)
})

test('hosted opening jamb accepts a target width with UUID-preserving Escape and Undo/Redo', async ({ page }) => {
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
  const doorId = await doorRow.getAttribute('data-object-id')
  expect(doorId).toBeTruthy()
  await doorRow.locator('.cf-browser-object').click()
  const properties = page.getByTestId('properties-selection')
  await expect(properties).toHaveAttribute('data-object-id', doorId!)
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
  await expect(properties).toHaveAttribute('data-object-id', doorId!)
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
  await expect(properties).toHaveAttribute('data-object-id', doorId!)
  await expect(properties).toContainText('1.200 × 2.000 m')
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await expect(properties).toHaveAttribute('data-object-id', doorId!)
  await expect(properties).toContainText('0.800 × 2.000 m')
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(properties).toHaveAttribute('data-object-id', doorId!)
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

test('sheet composer saves, applies, undoes, and deletes reusable layout templates', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()

  await page.getByLabel('มาตราส่วน').selectOption('50')
  await page.getByRole('button', { name: 'อัปเดต Viewport / Preview' }).click()
  await page.getByLabel('ชื่อ Sheet Layout Template').fill('แปลนบ้าน 1:50')
  await page.getByRole('button', { name: 'บันทึก Layout Template' }).click()
  const templates = page.getByLabel('Sheet Layout Template ที่เลือก')
  await expect(templates.locator('option', { hasText: 'แปลนบ้าน 1:50' })).toHaveCount(1)

  await page.getByLabel('มาตราส่วน').selectOption('200')
  await page.getByRole('button', { name: 'อัปเดต Viewport / Preview' }).click()
  await templates.selectOption({ label: 'แปลนบ้าน 1:50' })
  await page.getByRole('button', { name: 'ใช้ Layout Template' }).click()
  await expect(page.getByLabel('มาตราส่วน')).toHaveValue('50')
  await expect(page.locator('pre[aria-live="polite"]')).toContainText('Undo เดียว')

  await page.getByRole('button', { name: 'ปิดแบบและตาราง' }).click()
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  await expect(page.getByLabel('มาตราส่วน')).toHaveValue('200')
  const restoredTemplates = page.getByLabel('Sheet Layout Template ที่เลือก')
  await restoredTemplates.selectOption({ label: 'แปลนบ้าน 1:50' })
  await page.getByRole('button', { name: 'ลบ Layout Template' }).click()
  await expect(restoredTemplates.locator('option', { hasText: 'แปลนบ้าน 1:50' })).toHaveCount(0)
})

test('sheet composer stores independent framing for a secondary view on a paired sheet', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('select').first().selectOption('A-05')
  const rootScale = dialog.locator('select').nth(1)
  await expect(rootScale).toHaveValue('50')
  await rootScale.selectOption('100')
  await expect(dialog.getByLabel('ประเภท viewport 2')).toHaveValue('east')
  await dialog.getByLabel('มาตราส่วน viewport ที่สอง').selectOption('25')
  await dialog.getByLabel('กำหนดจุดกึ่งกลาง viewport 2').check()
  const secondCenter = dialog.locator('fieldset').filter({ hasText: 'center viewport 2' }).last().locator('input')
  await secondCenter.nth(0).fill('1.2')
  await secondCenter.nth(1).fill('0.8')
  await expect(secondCenter.nth(0)).toHaveValue('1.2')
  await expect(secondCenter.nth(1)).toHaveValue('0.8')
  await dialog.getByRole('button', { name: 'อัปเดต Viewport / Preview' }).click()
  const preview = page.getByTestId('sheet-composer-preview')
  await expect(preview.locator('svg text').filter({ hasText: /^1:25$/ })).toBeVisible()
  await expect(preview.locator('svg text').filter({ hasText: /^1:100$/ })).toBeVisible()
  await preview.scrollIntoViewIfNeeded()
  const previewBounds = await preview.boundingBox()
  if (!previewBounds) throw new Error('Sheet preview is not visible')
  const paperPixelsPerMm = previewBounds.width / 420
  const secondaryFrame = { x: 213, y: 40, width: 180, height: 138 }
  const secondaryFrameCenter = {
    x: previewBounds.x + ((secondaryFrame.x + secondaryFrame.width / 2) * paperPixelsPerMm),
    y: previewBounds.y + ((secondaryFrame.y + secondaryFrame.height / 2) * paperPixelsPerMm),
  }
  await page.mouse.move(secondaryFrameCenter.x, secondaryFrameCenter.y)
  await page.mouse.down()
  await expect(preview).toHaveAttribute('data-dragging', 'true')
  await page.mouse.move(secondaryFrameCenter.x + 36, secondaryFrameCenter.y + 20)
  await expect(preview.getByRole('status')).toContainText('Viewport 2')
  await page.mouse.up()
  const draggedCenter = [await secondCenter.nth(0).inputValue(), await secondCenter.nth(1).inputValue()]
  expect(draggedCenter).not.toEqual(['1.2', '0.8'])
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')

  await page.getByRole('button', { name: 'ปิดแบบและตาราง' }).click()
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const undoDialog = page.getByRole('dialog')
  await undoDialog.locator('select').first().selectOption('A-05')
  const undoCenter = undoDialog.locator('fieldset').filter({ hasText: 'center viewport 2' }).last().locator('input')
  await expect(undoCenter.nth(0)).toHaveValue('1.2')
  await expect(undoCenter.nth(1)).toHaveValue('0.8')
  await page.getByRole('button', { name: 'ปิดแบบและตาราง' }).click()
  await page.getByRole('button', { name: 'ทำซ้ำ' }).click()
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const redoDialog = page.getByRole('dialog')
  await redoDialog.locator('select').first().selectOption('A-05')
  const redoCenter = redoDialog.locator('fieldset').filter({ hasText: 'center viewport 2' }).last().locator('input')
  await expect(redoCenter.nth(0)).toHaveValue(draggedCenter[0])
  await expect(redoCenter.nth(1)).toHaveValue(draggedCenter[1])
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')

  await page.getByRole('button', { name: 'ปิดแบบและตาราง' }).click()
  await page.reload()
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const reloadedDialog = page.getByRole('dialog')
  await reloadedDialog.locator('select').first().selectOption('A-05')
  await expect(reloadedDialog.getByLabel('กำหนดจุดกึ่งกลาง viewport 2')).toBeChecked()
  await expect(reloadedDialog.getByLabel('มาตราส่วน viewport ที่สอง')).toHaveValue('25')
  const restoredCenter = reloadedDialog.locator('fieldset').filter({ hasText: 'center viewport 2' }).last().locator('input')
  await expect(restoredCenter.nth(0)).toHaveValue(draggedCenter[0])
  await expect(restoredCenter.nth(1)).toHaveValue(draggedCenter[1])
})

test('sheet composer adds, reorders, compiles, and reloads custom viewports', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('select').first().selectOption('A-05')
  const rootScale = dialog.locator('select').nth(1)
  await expect(rootScale).toHaveValue('50')
  await rootScale.selectOption('100')
  await dialog.getByLabel('ชนิด viewport ใหม่').selectOption('rcp')
  await dialog.getByRole('button', { name: 'เพิ่ม Viewport' }).click()
  await expect(dialog.getByLabel('ประเภท viewport 3')).toHaveValue('rcp')
  await dialog.getByLabel('ประเภท viewport 2').selectOption('west')
  await dialog.getByLabel('มาตราส่วน viewport ที่สอง').selectOption('50')
  await dialog.getByLabel('มาตราส่วน viewport ที่ 3').selectOption('25')
  await dialog.getByRole('button', { name: 'เลื่อน viewport 3 ขึ้น' }).click()
  await expect(dialog.getByLabel('ประเภท viewport 2')).toHaveValue('rcp')
  await expect(dialog.getByLabel('ประเภท viewport 3')).toHaveValue('west')
  await dialog.getByRole('button', { name: 'อัปเดต Viewport / Preview' }).click()
  const preview = page.getByTestId('sheet-composer-preview')
  await expect(preview.locator('svg text').filter({ hasText: /^1:100$/ })).toBeVisible()
  await expect(preview.locator('svg text').filter({ hasText: /^1:50$/ })).toBeVisible()
  await expect(preview.locator('svg text').filter({ hasText: /^1:25$/ })).toBeVisible()
  await dialog.getByLabel('กำหนดจุดกึ่งกลาง viewport 3').check()
  const thirdCenter = dialog.locator('fieldset').filter({ hasText: 'center viewport 3' }).last().locator('input')
  await thirdCenter.nth(0).fill('2.0')
  await thirdCenter.nth(1).fill('1.5')
  await dialog.getByRole('button', { name: 'อัปเดต Viewport / Preview' }).click()
  await expect(preview).toHaveAttribute('data-additional-manual-centers', 'false,true')
  await preview.scrollIntoViewIfNeeded()
  const previewBounds = await preview.boundingBox()
  if (!previewBounds) throw new Error('Custom sheet preview is not visible')
  const paperPixelsPerMm = previewBounds.width / 420
  const [thirdX, thirdY, thirdWidth, thirdHeight] = JSON.parse((await preview.getAttribute('data-paper-frames')) ?? '[]')[2]
  const thirdFrame = { x: thirdX, y: thirdY, width: thirdWidth, height: thirdHeight }
  const thirdFrameCenter = {
    x: previewBounds.x + ((thirdFrame.x + thirdFrame.width / 2) * paperPixelsPerMm),
    y: previewBounds.y + ((thirdFrame.y + thirdFrame.height / 2) * paperPixelsPerMm),
  }
  await page.mouse.move(thirdFrameCenter.x, thirdFrameCenter.y)
  await page.mouse.down()
  await expect(preview).toHaveAttribute('data-dragging', 'true')
  await page.mouse.move(thirdFrameCenter.x + 24, thirdFrameCenter.y + 18)
  await expect(preview.getByRole('status')).toContainText('Viewport 3')
  await page.mouse.up()
  const draggedThirdCenter = [await thirdCenter.nth(0).inputValue(), await thirdCenter.nth(1).inputValue()]
  expect(draggedThirdCenter).not.toEqual(['2', '1.5'])
  await dialog.getByRole('button', { name: 'จัดกรอบ viewport บนแผ่น' }).click()
  const thirdPaperFrame = preview.getByTestId('paper-frame-3')
  const beforeFrameEdit = JSON.parse((await preview.getAttribute('data-paper-frames')) ?? '[]')
  await thirdPaperFrame.scrollIntoViewIfNeeded()
  const frameBounds = await thirdPaperFrame.boundingBox()
  if (!frameBounds) throw new Error('Third viewport paper frame is not visible')
  await thirdPaperFrame.hover({ position: { x: frameBounds.width / 2, y: frameBounds.height / 2 } })
  const visibleFrameBounds = await thirdPaperFrame.boundingBox()
  if (!visibleFrameBounds) throw new Error('Third viewport paper frame is not visible after scrolling')
  await page.mouse.move(visibleFrameBounds.x + visibleFrameBounds.width / 2, visibleFrameBounds.y + visibleFrameBounds.height / 2)
  await page.mouse.down()
  await expect(preview).toHaveAttribute('data-frame-dragging', 'true')
  await page.mouse.move(visibleFrameBounds.x + visibleFrameBounds.width / 2 + 18, visibleFrameBounds.y + visibleFrameBounds.height / 2 + 12)
  await page.mouse.up()
  await expect.poll(async () => JSON.parse((await preview.getAttribute('data-paper-frames')) ?? '[]')[2]).not.toEqual(beforeFrameEdit[2])
  const afterMove = JSON.parse((await preview.getAttribute('data-paper-frames')) ?? '[]')
  const resizeHandle = thirdPaperFrame.getByRole('button', { name: 'ปรับขนาดกรอบ viewport 3' })
  const resizeBounds = await resizeHandle.boundingBox()
  if (!resizeBounds) throw new Error('Third viewport resize handle is not visible')
  await page.mouse.move(resizeBounds.x + resizeBounds.width / 2, resizeBounds.y + resizeBounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(resizeBounds.x + resizeBounds.width / 2 + 22, resizeBounds.y + resizeBounds.height / 2 + 16)
  await page.mouse.up()
  await expect.poll(async () => JSON.parse((await preview.getAttribute('data-paper-frames')) ?? '[]')[2]).not.toEqual(afterMove[2])
  const savedPaperFrames = JSON.parse((await preview.getAttribute('data-paper-frames')) ?? '[]')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')

  await page.getByRole('button', { name: 'ปิดแบบและตาราง' }).click()
  await page.reload()
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const restored = page.getByRole('dialog')
  await restored.locator('select').first().selectOption('A-05')
  await expect(page.getByTestId('sheet-composer-preview')).toHaveAttribute('data-paper-frames', JSON.stringify(savedPaperFrames))
  await expect(restored.getByLabel('ประเภท viewport 2')).toHaveValue('rcp')
  await expect(restored.getByLabel('ประเภท viewport 3')).toHaveValue('west')
  await expect(restored.getByLabel('มาตราส่วน viewport ที่สอง')).toHaveValue('25')
  await expect(restored.getByLabel('มาตราส่วน viewport ที่ 3')).toHaveValue('50')
  const restoredThirdCenter = restored.locator('fieldset').filter({ hasText: 'center viewport 3' }).last().locator('input')
  await expect(restoredThirdCenter.nth(0)).toHaveValue(draggedThirdCenter[0])
  await expect(restoredThirdCenter.nth(1)).toHaveValue(draggedThirdCenter[1])
})

test('sheet composer supports eight views in compact A3 frames and reloads the layout', async ({ page }) => {
  await page.goto('/')
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('select').first().selectOption('A-05')

  for (const [index, kind] of ['south', 'west', 'section_x', 'section_y', 'rcp', 'isometric'].entries()) {
    await dialog.getByLabel('ชนิด viewport ใหม่').selectOption(kind)
    await dialog.getByRole('button', { name: 'เพิ่ม Viewport' }).click()
    await expect(dialog.getByLabel(`ประเภท viewport ${index + 3}`)).toHaveValue(kind)
  }
  await expect(dialog.getByLabel('ประเภท viewport 8')).toHaveValue('isometric')
  await expect(dialog.getByRole('button', { name: 'เพิ่ม Viewport' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'อัปเดต Viewport / Preview' }).click()

  const preview = page.getByTestId('sheet-composer-preview')
  const frames = JSON.parse((await preview.getAttribute('data-paper-frames')) ?? '[]')
  expect(frames).toHaveLength(8)
  for (const [x, y, width, height] of frames) {
    expect(x).toBeGreaterThanOrEqual(0)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(x + width).toBeLessThanOrEqual(420)
    expect(y + height).toBeLessThanOrEqual(297)
    expect(height).toBeGreaterThanOrEqual(50)
  }
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')
  await page.getByRole('button', { name: 'ปิดแบบและตาราง' }).click()
  await page.reload()
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'ชุดแบบและตาราง' }).click()
  const restored = page.getByRole('dialog')
  await restored.locator('select').first().selectOption('A-05')
  await expect(restored.getByLabel('ประเภท viewport 8')).toHaveValue('isometric')
  await expect(page.getByTestId('sheet-composer-preview')).toHaveAttribute('data-paper-frames', JSON.stringify(frames))
})

test('split workbench keeps selection identity and plan navigation coordinated', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('.cf-tool-button[title^="เสา"]').click()
  await clickCanvasFraction(page, 0.5, 0.48)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const row = page.locator('li[data-object-type="structure.column"]').first()
  await expect(row).toBeVisible()
  const objectId = await row.getAttribute('data-object-id')
  expect(objectId).toBeTruthy()
  await row.locator('.cf-browser-object').click()
  await page.getByRole('button', { name: 'แปลนพื้น', exact: true }).click()
  await page.getByLabel('แบ่งมุมมอง').click()
  await page.getByLabel('แสดงหลายมุมมอง').check()
  const secondView = page.getByLabel('มุมมองที่สอง')
  await expect(secondView).toBeVisible()
  await secondView.selectOption('framing')

  const panes = page.locator('.cf-multiview-pane')
  await expect(panes).toHaveCount(2)
  for (const pane of await panes.all()) await expect(pane).toHaveAttribute('data-primary-selected-object-id', objectId!)
  const canvases = page.locator('.cf-plan-canvas')
  await expect(canvases).toHaveCount(2)
  const box = await canvases.first().boundingBox()
  if (!box) throw new Error('Primary plan viewport is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 3 })
  await page.mouse.up({ button: 'middle' })
  await expect.poll(async () => {
    const [primaryBox, secondaryBox] = await Promise.all([canvases.nth(0).boundingBox(), canvases.nth(1).boundingBox()])
    if (!primaryBox || !secondaryBox) return Infinity
    const [primaryPanX, primaryPanY, primaryZoom] = await Promise.all(['data-viewport-pan-x', 'data-viewport-pan-y', 'data-viewport-zoom'].map(async name => Number(await canvases.nth(0).getAttribute(name))))
    const [secondaryPanX, secondaryPanY, secondaryZoom] = await Promise.all(['data-viewport-pan-x', 'data-viewport-pan-y', 'data-viewport-zoom'].map(async name => Number(await canvases.nth(1).getAttribute(name))))
    const primaryCenter = [(primaryBox.width / 2 - primaryPanX) / primaryZoom, (primaryBox.height / 2 - primaryPanY) / primaryZoom]
    const secondaryCenter = [(secondaryBox.width / 2 - secondaryPanX) / secondaryZoom, (secondaryBox.height / 2 - secondaryPanY) / secondaryZoom]
    return Math.max(Math.abs(primaryCenter[0] - secondaryCenter[0]), Math.abs(primaryCenter[1] - secondaryCenter[1]), Math.abs(primaryZoom - secondaryZoom) * 1000)
  }).toBeLessThan(5)

  await page.getByLabel('จำนวนมุมมอง').selectOption('3')
  const thirdView = page.getByLabel('มุมมองที่สาม')
  await thirdView.selectOption('east')
  await expect(panes).toHaveCount(3)
  for (const pane of await panes.all()) await expect(pane).toHaveAttribute('data-primary-selected-object-id', objectId!)
  const viewportStage = page.locator('.cf-viewport-stage')
  const layout = page.getByLabel('การจัดวางมุมมอง')
  await layout.selectOption('rows')
  const rowTracks = await viewportStage.evaluate(element => getComputedStyle(element).gridTemplateRows.split(' ').length)
  expect(rowTracks).toBe(3)
  await layout.selectOption('focus')
  const primaryTracks = await viewportStage.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  expect(primaryTracks).toBe(2)
  expect(await panes.first().evaluate(element => getComputedStyle(element).gridRowStart)).toBe('span 2')

  await page.getByLabel('จำนวนมุมมอง').selectOption('4')
  await page.getByLabel('มุมมองที่สี่').selectOption('west')
  await expect(page.locator('.cf-multiview-pane')).toHaveCount(4)
  await expect(page.getByTestId('fourth-view-pane')).toHaveAttribute('data-primary-selected-object-id', objectId!)
  for (const pane of await page.locator('.cf-multiview-pane').all()) await expect(pane).toHaveAttribute('data-primary-selected-object-id', objectId!)
  const gridTracks = await viewportStage.evaluate(element => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
    rows: getComputedStyle(element).gridTemplateRows.split(' ').length,
  }))
  expect(gridTracks).toEqual({ columns: 2, rows: 2 })
  await page.getByLabel('จำนวนมุมมอง').selectOption('3')

  await secondView.selectOption('model3d')
  await page.getByLabel('แบ่งมุมมอง').click()
  const model3d = page.getByTestId('secondary-view-pane').getByTestId('model3d-viewport')
  await expect(model3d).toHaveAttribute('data-auto-framed-selection', objectId!)
  const planCanvas = canvases.first()
  const expectPlanAnd3DCenterToMatch = async () => {
    const size = await planCanvas.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }))
    const panX = Number(await planCanvas.getAttribute('data-viewport-pan-x'))
    const panY = Number(await planCanvas.getAttribute('data-viewport-pan-y'))
    const zoom = Number(await planCanvas.getAttribute('data-viewport-zoom'))
    const centerXmm = (size.width / 2 - panX) / zoom
    const centerYmm = (size.height / 2 - panY) / zoom
    const cameraXmm = Number(await model3d.getAttribute('data-camera-target-x')) * 1000
    const cameraYmm = Number(await model3d.getAttribute('data-camera-target-y')) * 1000
    expect(Math.abs(cameraXmm - centerXmm)).toBeLessThan(25)
    expect(Math.abs(cameraYmm - centerYmm)).toBeLessThan(25)
  }
  await expect.poll(expectPlanAnd3DCenterToMatch).toBeUndefined()

  const planBox = await planCanvas.boundingBox()
  if (!planBox) throw new Error('Primary plan viewport is not visible')
  await page.mouse.move(planBox.x + planBox.width / 2, planBox.y + planBox.height / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(planBox.x + planBox.width / 2 + 34, planBox.y + planBox.height / 2 + 22, { steps: 3 })
  await page.mouse.up({ button: 'middle' })
  await expect.poll(expectPlanAnd3DCenterToMatch).toBeUndefined()

  const modelBox = await model3d.boundingBox()
  if (!modelBox) throw new Error('3D viewport is not visible')
  const cameraDistanceBeforeZoom = await model3d.getAttribute('data-camera-distance')
  await page.mouse.move(modelBox.x + modelBox.width / 2, modelBox.y + modelBox.height / 2)
  await page.mouse.wheel(0, -120)
  await expect.poll(() => model3d.getAttribute('data-camera-distance')).not.toBe(cameraDistanceBeforeZoom)
  await expect.poll(expectPlanAnd3DCenterToMatch).toBeUndefined()

  const cameraTargetBeforeOrbitPan = await model3d.getAttribute('data-camera-target-x')
  await page.mouse.move(modelBox.x + modelBox.width / 2, modelBox.y + modelBox.height / 2)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(modelBox.x + modelBox.width / 2 + 28, modelBox.y + modelBox.height / 2 + 16, { steps: 3 })
  await page.mouse.up({ button: 'right' })
  await expect.poll(() => model3d.getAttribute('data-camera-target-x')).not.toBe(cameraTargetBeforeOrbitPan)
  await expect.poll(expectPlanAnd3DCenterToMatch).toBeUndefined()

  await page.getByLabel('แบ่งมุมมอง').click()
  await thirdView.selectOption('rcp')
  const rcp = page.getByTestId('tertiary-view-pane').getByTestId('elevation-canvas')
  await expect(rcp).toHaveAttribute('data-elevation-direction', 'rcp')
  const expectPlanAndRcpNavigationToMatch = async () => {
    const size = await planCanvas.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }))
    const panX = Number(await planCanvas.getAttribute('data-viewport-pan-x'))
    const panY = Number(await planCanvas.getAttribute('data-viewport-pan-y'))
    const zoom = Number(await planCanvas.getAttribute('data-viewport-zoom'))
    const centerXmm = (size.width / 2 - panX) / zoom
    const centerYmm = (size.height / 2 - panY) / zoom
    const rcpCenterXmm = Number(await rcp.getAttribute('data-plan-navigation-center-x'))
    const rcpCenterYmm = Number(await rcp.getAttribute('data-plan-navigation-center-y'))
    const rcpZoom = Number(await rcp.getAttribute('data-elevation-zoom'))
    expect(Math.abs(rcpCenterXmm - centerXmm)).toBeLessThan(25)
    expect(Math.abs(rcpCenterYmm - centerYmm)).toBeLessThan(25)
    expect(Math.abs(rcpZoom - zoom)).toBeLessThan(0.002)
  }
  await expect.poll(expectPlanAndRcpNavigationToMatch).toBeUndefined()

  const rcpBox = await rcp.boundingBox()
  if (!rcpBox) throw new Error('RCP viewport is not visible')
  await page.mouse.move(rcpBox.x + rcpBox.width / 2, rcpBox.y + rcpBox.height / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(rcpBox.x + rcpBox.width / 2 + 30, rcpBox.y + rcpBox.height / 2 - 18, { steps: 3 })
  await page.mouse.up({ button: 'middle' })
  await expect.poll(expectPlanAndRcpNavigationToMatch).toBeUndefined()
  const rcpZoomBefore = Number(await rcp.getAttribute('data-elevation-zoom'))
  await rcp.locator('canvas').dispatchEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true })
  await expect.poll(async () => Number(await rcp.getAttribute('data-elevation-zoom'))).toBeGreaterThan(rcpZoomBefore)
  await expect.poll(expectPlanAndRcpNavigationToMatch).toBeUndefined()
  await page.getByLabel('จัดภาพให้พอดี').click()
  await expect.poll(expectPlanAndRcpNavigationToMatch).toBeUndefined()
})

test('multiview layout and auxiliary views restore for the same project after reload', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('แบ่งมุมมอง').click()
  await page.getByLabel('แสดงหลายมุมมอง').check()
  await page.getByLabel('มุมมองที่สอง').selectOption('framing')
  await page.getByLabel('จำนวนมุมมอง').selectOption('4')
  await page.getByLabel('มุมมองที่สาม').selectOption('north')
  await page.getByLabel('มุมมองที่สี่').selectOption('rcp')
  await expect(page.getByLabel('การจัดวางมุมมอง')).toHaveValue('grid')
  const primaryShare = page.getByLabel('สัดส่วน pane หลัก')
  await primaryShare.focus()
  await primaryShare.press('End')
  await expect(primaryShare).toHaveValue('70')
  await expect(page.locator('.cf-viewport-stage')).toHaveAttribute('style', /minmax\(0(?:px)?, 70fr\) minmax\(0(?:px)?, 30fr\)/)

  await page.getByLabel('การจัดวางมุมมอง').selectOption('custom')
  await page.getByLabel('จำนวนคอลัมน์มุมมองหลาย pane').selectOption('3')
  await expect(page.locator('.cf-viewport-stage')).toHaveAttribute('style', /minmax\(0(?:px)?, 70fr\) minmax\(0(?:px)?, 15fr\) minmax\(0(?:px)?, 15fr\)/)
  await expect(page.locator('[data-testid="fourth-view-pane"]')).toHaveCSS('grid-column', /span 3/)

  await page.reload()
  await page.getByLabel('แบ่งมุมมอง').click()
  await expect(page.getByLabel('แสดงหลายมุมมอง')).toBeChecked()
  await expect(page.getByLabel('มุมมองที่สอง')).toHaveValue('framing')
  await expect(page.getByLabel('จำนวนมุมมอง')).toHaveValue('4')
  await expect(page.getByLabel('มุมมองที่สาม')).toHaveValue('north')
  await expect(page.getByLabel('มุมมองที่สี่')).toHaveValue('rcp')
  await expect(page.getByLabel('การจัดวางมุมมอง')).toHaveValue('custom')
  await expect(page.getByLabel('จำนวนคอลัมน์มุมมองหลาย pane')).toHaveValue('3')
  await expect(page.getByLabel('สัดส่วน pane หลัก')).toHaveValue('70')
  await expect(page.locator('[data-testid="fourth-view-pane"]')).toHaveCSS('grid-column', /span 3/)
  const viewportStage = page.locator('.cf-viewport-stage')
  const gridTracks = await viewportStage.evaluate(element => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
    rows: getComputedStyle(element).gridTemplateRows.split(' ').length,
  }))
  expect(gridTracks).toEqual({ columns: 3, rows: 2 })
  await page.getByLabel('การจัดวางมุมมอง').selectOption('grid')
  await expect(page.locator('.cf-viewport-stage')).toHaveAttribute('style', /minmax\(0(?:px)?, 70fr\) minmax\(0(?:px)?, 30fr\)/)
})

test('two-storey residential demo supports browser review, 3D selection, and autosave reload at 239 objects', async ({ page }) => {
  test.setTimeout(90_000)
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto('/')
  await page.locator('.cf-more-menu summary').click()
  await page.getByRole('button', { name: 'เปิดแบบบ้านเดโม 2 ชั้น' }).click()
  await expect(page.locator('.cf-save-status')).toContainText('เปิดแบบบ้านเดโม 2 ชั้นแล้ว')
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')

  await page.getByRole('tab', { name: 'รายการ' }).click()
  const browser = page.getByLabel('Project Browser')
  await browser.getByRole('button', { name: 'ทั้งโครงการ' }).click()
  const rows = browser.locator('li[data-object-id]')
  await expect(rows).toHaveCount(239, { timeout: 30_000 })
  const objectId = await browser.locator('li[data-object-type="structure.column"]').first().getAttribute('data-object-id')
  expect(objectId).toBeTruthy()

  await browser.getByLabel('ค้นหาวัตถุในโครงการ').fill(objectId!)
  await expect(rows).toHaveCount(1)
  await rows.first().locator('.cf-browser-object').click()
  const primaryPane = page.locator('.cf-multiview-pane').first()
  await expect(primaryPane).toHaveAttribute('data-primary-selected-object-id', objectId!)
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const activeBrowser = page.getByLabel('Project Browser')
  await activeBrowser.getByLabel('ค้นหาวัตถุในโครงการ').fill('')
  await activeBrowser.getByRole('button', { name: 'ตะวันออก' }).click()
  await expect(primaryPane).toHaveAttribute('data-primary-selected-object-id', objectId!)
  await expect(page.locator('canvas').first()).toBeVisible()
  await expect(page.locator('.cf-save-status')).toContainText('บันทึกในเครื่องแล้ว')

  await page.reload()
  await expect(page.locator('.cf-save-status')).toContainText('กู้คืนงานในเครื่อง', { timeout: 30_000 })
  await page.getByRole('tab', { name: 'รายการ' }).click()
  const restoredBrowser = page.getByLabel('Project Browser')
  await restoredBrowser.getByRole('button', { name: 'ทั้งโครงการ' }).click()
  await expect(restoredBrowser.locator('li[data-object-id]')).toHaveCount(239, { timeout: 30_000 })
  await restoredBrowser.getByLabel('ค้นหาวัตถุในโครงการ').fill(objectId!)
  const restoredObjectRow = restoredBrowser.locator(`li[data-object-id="${objectId}"]`)
  await expect(restoredObjectRow).toHaveCount(1)
  await restoredObjectRow.locator('.cf-browser-object').click()
  await expect(page.getByTestId('properties-selection')).toHaveAttribute('data-object-id', objectId!)
  await page.getByRole('button', { name: '3D ดูตัวอย่าง', exact: true }).click()
  const houseModel = page.getByTestId('model3d-viewport')
  await expect(houseModel).toBeVisible()
  await expect(page.getByTestId('properties-selection')).toHaveAttribute('data-object-id', objectId!)
  await expect(houseModel.getByRole('button', { name: 'ซูมเข้า 3D' })).toBeEnabled()
  const cameraPose = await houseModel.evaluate(element => ({
    x: Number(element.getAttribute('data-camera-target-x')),
    y: Number(element.getAttribute('data-camera-target-y')),
    distance: Number(element.getAttribute('data-camera-distance')),
  }))
  expect(Object.values(cameraPose).every(Number.isFinite)).toBe(true)
  expect(cameraPose.distance).toBeGreaterThan(0)
  expect(pageErrors).toEqual([])
})

