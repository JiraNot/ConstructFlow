import { TOOL_INTERACTION_REGISTRY } from './toolInteractionRegistry.mjs'

const labels = {
  column: 'เสา', foundation: 'ฐานราก', beam: 'คาน', wall: 'ผนัง', door: 'ประตู', window: 'หน้าต่าง',
  slab: 'พื้นโครงสร้าง', slabVoid: 'ช่องเจาะพื้น/หลังคา', archFloor: 'พื้นสถาปัตย์', ceiling: 'ฝ้าเพดาน', roof: 'หลังคา',
  pipe: 'แนวท่อ', fixture: 'อุปกรณ์ไฟฟ้า', cabinet: 'บิลท์อิน', moulding: 'แนวบัว', roomSeparator: 'เส้นแบ่งห้อง',
  stair: 'บันได', grid: 'เส้นกริด', gridSystem: 'ระบบกริด', gridCopy: 'สำเนาเส้นกริด', measure: 'ตลับเมตร', calibrate: 'ปรับสเกลภาพ',
}

const getStep = (tool, state) => {
  if (tool === 'select' || tool === 'erase') return 'ready'
  if (['wall', 'beam', 'grid', 'roomSeparator', 'pipe', 'cabinet', 'moulding', 'stair'].includes(tool)) {
    const hasStart = tool === 'wall' ? state.wallStartNode : tool === 'beam' ? state.beamStartNode
      : tool === 'grid' ? state.gridStartPoint : tool === 'stair' ? state.stairStartPoint
        : Boolean(state.roomSeparatorStart)
    return hasStart ? 'end-point' : 'start-point'
  }
  if (['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof'].includes(tool)) return state.slabBoundary?.length ? 'add-vertex' : 'first-vertex'
  if (tool === 'measure') return state.tapeMeasure?.complete ? 'complete' : state.tapeMeasure ? 'end-point' : 'start-point'
  if (tool === 'calibrate') return state.calibrationP1 ? 'second-reference' : 'first-reference'
  if (tool === 'gridSystem') return state.gridSystemError ? 'fix-intervals' : 'origin'
  if (tool === 'gridCopy') return state.gridCopySourceId ? 'place-copy' : 'select-source'
  if (tool === 'door' || tool === 'window') return 'host-and-position'
  return 'position'
}

const stepText = {
  ready: 'พร้อมเลือกวัตถุ', 'start-point': 'กำหนดจุดเริ่ม', 'end-point': 'กำหนดจุดปลาย',
  'first-vertex': 'กำหนดจุดแรก', 'add-vertex': 'เพิ่มจุดหรือปิดรูป', complete: 'เสร็จแล้ว',
  'second-reference': 'กำหนดจุดอ้างอิงที่สอง', 'first-reference': 'กำหนดจุดอ้างอิงแรก',
  'fix-intervals': 'แก้ช่วงระยะกริด', origin: 'กำหนดจุดกำเนิด', 'place-copy': 'กำหนดตำแหน่งสำเนา',
  'select-source': 'เลือกกริดต้นทาง', 'host-and-position': 'เลือกผนังและตำแหน่ง', position: 'กำหนดตำแหน่ง',
}

export function resolveToolInteractionStatus(tool, state = {}) {
  if (!TOOL_INTERACTION_REGISTRY[tool]) return null
  const step = getStep(tool, state)
  let instruction = ''
  switch (tool) {
    case 'select': instruction = state.selectionHint ?? 'เลือก · คลิกเลือกหรือลากครอบวัตถุ · Tab สลับวัตถุซ้อน'; break
    case 'erase': instruction = 'ยางลบ · คลิกหรือลากผ่านวัตถุเพื่อลบ'; break
    case 'wall': instruction = `ผนัง · ${step === 'end-point' ? 'เลื่อนหาจุดปลาย' : 'เลือกจุดเริ่ม'} · Enter ${step === 'end-point' ? 'วาดช่วงและต่อแนว' : 'กำหนดจุดเริ่ม'}`; break
    case 'beam': instruction = `คาน · ${step === 'end-point' ? 'เลื่อนหาจุดปลาย' : 'เลือกจุดเริ่ม'} · Enter ${step === 'end-point' ? 'วาดช่วงและต่อแนว' : 'กำหนดจุดเริ่ม'}`; break
    case 'column': instruction = 'เสา · Snap ศูนย์กลาง/จุดตัดกริด · เลื่อนแล้ว Enter วาง'; break
    case 'foundation': instruction = 'ฐานราก · Snap เสาหรือจุดกริด · เลื่อนแล้ว Enter วาง'; break
    case 'door': case 'window': instruction = `${labels[tool]} · วางบนผนัง · Tab ขอบ/กึ่งกลาง · Enter วาง`; break
    case 'grid': instruction = `เส้นกริด · ${step === 'end-point' ? 'เลือกจุดปลาย' : 'เลือกจุดเริ่ม'} · Enter ยืนยันจุด`; break
    case 'gridCopy': instruction = 'สำเนาเส้นกริด · Shift ล็อกแนวขนาน · Enter วางสำเนา'; break
    case 'gridSystem': instruction = 'ระบบกริด · กรอกช่วงระยะ แล้วเลือกจุดกำเนิดหรือ Enter วางตรงเคอร์เซอร์'; break
    case 'slab': case 'slabVoid': case 'archFloor': case 'ceiling': case 'roof':
      instruction = `${labels[tool]} · ${step === 'add-vertex' ? 'กรอกระยะ/องศาแล้ว Enter เพิ่มจุด' : 'คลิกหรือ Enter จุดแรก'} · Enter บนแปลนปิดรูปเมื่อครบ 3 จุด`; break
    case 'roomSeparator': instruction = `เส้นแบ่งห้อง · ${step === 'end-point' ? 'กำหนดระยะ/องศาแล้วเลือกจุดปลาย' : 'เลือกจุดเริ่ม'} · Enter ยืนยันจุด`; break
    case 'pipe': {
      const system = ({ waste: 'น้ำทิ้ง', soil: 'โสโครก', rainwater: 'น้ำฝน', vent: 'อากาศ', cold_water: 'น้ำดีเย็น', hot_water: 'น้ำร้อน' })[state.pipeSystem] ?? 'น้ำทิ้ง'
      instruction = `แนวท่อ ${system} · ${step === 'end-point' ? 'เลือกจุดปลายเพื่อสร้างช่วงท่อ' : 'เลือกจุดเริ่ม'} · Enter ยืนยันจุด`; break
    }
    case 'cabinet': instruction = `บิลท์อิน · ${step === 'end-point' ? 'เลือกปลายแนวหน้าตู้เพื่อกำหนดความกว้างและทิศ' : 'เลือกมุมเริ่มแนวหน้าตู้'} · Enter ยืนยันจุด`; break
    case 'moulding': instruction = `แนวบัว · ${step === 'end-point' ? 'เลือกจุดปลายแนวบัว' : 'เลือกจุดเริ่มแนวบัว'} · Enter ยืนยันจุด`; break
    case 'fixture': instruction = `อุปกรณ์ไฟฟ้า ${state.fixtureKind ?? 'light'} · เลื่อนแล้ว Enter วาง`; break
    case 'stair': instruction = `บันได · ${step === 'end-point' ? 'เลือกปลายเที่ยวแรก · ระยะ/องศากำหนดเอง · Shift ล็อกแกน · Enter วาง' : 'เลือกจุดเริ่มริมเที่ยวแรก · เลือกระดับจบและรูปแบบก่อนวาง'}`; break
    case 'measure': instruction = 'ตลับเมตร · เลือกจุดเริ่มและจุดปลาย · Enter ยืนยันจุด'; break
    case 'calibrate': instruction = 'ปรับสเกลภาพ · เลือกจุดอ้างอิงสองจุด · Enter ยืนยันจุด'; break
  }
  const constraint = ['wall', 'beam'].includes(tool)
    ? `${state.lineConstraintLabel ?? 'อัตโนมัติ: ขนาน/ตั้งฉาก'} · แนวอ้างอิง${state.placementReferenceLabel ?? 'กึ่งกลาง'}`
    : state.snapCount === 0 ? 'วางอิสระ' : `Snap เปิด ${state.snapCount ?? 0} ประเภท`
  const snapFeedback = state.activeSnap?.description ?? null
  return { tool, step, stepLabel: stepText[step] ?? step, instruction, constraint, snapFeedback }
}

export function resolveEscapeAction(tool, hasPendingStep, hasSelection = false) {
  if (hasPendingStep) return 'cancel-step'
  if (tool === 'select') return hasSelection ? 'clear-selection' : 'noop'
  return 'exit-tool'
}

export function hasPendingToolStep(state = {}) {
  return Boolean(state.draggingObject || state.objectContextMenu || state.stairStartPoint || state.gridStartPoint
    || state.gridCopySourceId
    || state.beamStartNode || state.wallStartNode || state.roomSeparatorStart || state.slabBoundary?.length
    || state.calibrationP1 || state.tapeMeasure || state.dimensionInputX?.trim() || state.dimensionInputY?.trim()
    || state.drawLengthMeters?.trim() || state.drawAngleDegrees?.trim() || state.gridSystemError)
}
