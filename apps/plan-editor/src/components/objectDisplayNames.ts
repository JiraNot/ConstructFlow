/** Short UI-only names. Keep persisted object_type, marks, and type names untouched. */
export const objectFamilyDisplayNames: Readonly<Record<string, string>> = {
  'structure.grid': 'กริด', 'structure.column': 'เสา', 'structure.foundation': 'ฐานราก',
  'structure.beam': 'คาน', 'structure.slab': 'พื้นโครงสร้าง', 'architecture.wall': 'ผนัง',
  'architecture.floor': 'พื้นสถาปัตย์', 'architecture.ceiling': 'ฝ้า', 'architecture.room': 'ห้อง',
  'architecture.room_separator': 'เส้นแบ่งห้อง', 'architecture.stair': 'บันได',
  'door_window.door': 'ประตู', 'door_window.window': 'หน้าต่าง', 'roof.system': 'หลังคา',
  'plumbing.pipe_route': 'ท่อ', 'drainage.pipe_route': 'ท่อระบายน้ำ',
  'electrical.fixture': 'อุปกรณ์ไฟฟ้า', 'interior.cabinet_run': 'บิลท์อิน', 'interior.furniture': 'เฟอร์นิเจอร์', 'family.instance': 'Family', 'decorative.moulding_run': 'บัว',
}

export const getObjectFamilyDisplayName = (family: string | null | undefined) =>
  family ? objectFamilyDisplayNames[family] ?? family : ''
