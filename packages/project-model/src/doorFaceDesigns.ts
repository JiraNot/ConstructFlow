import type { DoorFaceComponent } from './doorFace.js'

let serial = 0
const panel = (x: number, y: number, width: number, height: number, contour: DoorFaceComponent['contour'] = 'rectangle'): DoorFaceComponent => ({
  id: `face0000-0000-4000-8000-${String(++serial).padStart(12, '0')}`, kind: 'panel', contour, x, y, width, height,
})
const grooves = (x: number, y: number, width: number, height: number, count: number, direction: 'horizontal' | 'vertical'): DoorFaceComponent => ({
  ...panel(x, y, width, height), kind: 'grooves', count, direction,
})
export const DOOR_FACE_DESIGNS: readonly { key: string; name: string; components: DoorFaceComponent[] }[] = [
  { key: 'plank-8', name: 'ไม้กระดานแนวนอน 8 เส้น', components: [grooves(.11, .06, .78, .88, 8, 'horizontal')] },
  { key: 'plank-14', name: 'ไม้กระดานแนวนอนถี่ 14 เส้น', components: [grooves(.11, .06, .78, .88, 14, 'horizontal')] },
  { key: 'reeded-full', name: 'เซาะร่องตั้งเต็มบาน', components: [grooves(.025, .025, .95, .95, 30, 'vertical')] },
  { key: 'reeded-frame', name: 'ร่องตั้งถี่ในกรอบ', components: [grooves(.12, .08, .76, .84, 24, 'vertical')] },
  { key: 'asymmetric', name: 'ร่องข้างผสมกระดานนอน', components: [grooves(.10, .06, .18, .88, 7, 'vertical'), grooves(.32, .06, .57, .88, 7, 'horizontal')] },
  { key: 'classic-three', name: 'คลาสสิกสามส่วน', components: [panel(.12, .56, .76, .36), panel(.12, .43, .76, .08), panel(.12, .08, .76, .30)] },
  { key: 'arch-two', name: 'ลูกฟักโค้งบน–สี่เหลี่ยมล่าง', components: [panel(.12, .40, .76, .52, 'arch'), panel(.12, .08, .76, .26)] },
  { key: 'capsule', name: 'คิ้วแคปซูลยาว', components: [panel(.16, .07, .68, .86, 'capsule')] },
  { key: 'oval', name: 'คิ้ววงรียาว', components: [panel(.15, .08, .70, .84, 'ellipse')] },
  { key: 'circle-middle', name: 'วงกลมกลางบาน', components: [panel(.12, .55, .76, .37), panel(.25, .325, .50, .215, 'ellipse'), panel(.12, .08, .76, .23)] },
  { key: 'five-panel', name: 'ห้าลูกฟักแบบไม้คลาสสิก', components: [panel(.11, .53, .36, .39, 'arch'), panel(.53, .53, .36, .39, 'arch'), panel(.11, .40, .78, .08), panel(.11, .08, .36, .27), panel(.53, .08, .36, .27)] },
  { key: 'tall-panel', name: 'คิ้วกรอบสูงเต็มบาน', components: [panel(.12, .06, .76, .88)] },
]
