import type { ToolType } from './Toolbar.js'

export const toolNames: Partial<Record<ToolType, string>> = {
  select: 'เลือกวัตถุ', erase: 'ลบวัตถุ', column: 'เสา', foundation: 'ฐานราก', beam: 'คาน', wall: 'ผนัง', door: 'ประตู',
  window: 'หน้าต่าง', slab: 'พื้นโครงสร้าง', slabVoid: 'ช่องเจาะพื้น/หลังคา', archFloor: 'พื้นสถาปัตย์', ceiling: 'ฝ้าเพดาน', roof: 'หลังคา',
  pipe: 'แนวท่อ', fixture: 'อุปกรณ์ไฟฟ้า', cabinet: 'บิลท์อิน', furniture: 'เฟอร์นิเจอร์', moulding: 'แนวบัว', roomSeparator: 'เส้นแบ่งห้อง',
  stair: 'บันได', grid: 'เส้นกริด', gridSystem: 'ระบบกริด', gridCopy: 'คัดลอกกริด', measure: 'ตลับเมตร', dimension: 'บอกระยะ', calibrate: 'ปรับสเกลภาพ',
}
