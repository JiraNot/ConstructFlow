import type { FamilyDefinition } from '@constructflow/project-model'

export function FamilyModelGuide({ family }: { family: FamilyDefinition }) {
  if (!family.meshes.length) return null
  const unnamed = family.meshes.filter(mesh => !mesh.name?.trim())
  const combined = family.meshes.length === 1
  return <details className="cf-family-guide">
    <summary>วิธีเตรียมโมเดล · {family.meshes.length} ชิ้น</summary>
    <div>
      <p><strong>แกนโมเดล</strong> แดง X = กว้าง, เขียว Y = ลึก, น้ำเงิน Z = สูง · SketchUp ส่งหน่วยเป็น mm ให้อัตโนมัติ</p>
      <ol>
        <li>แยกสิ่งที่ต้องยืดหรือขยับต่างกันเป็น Group/Component เช่น กรอบ, บาน, มือจับ แล้วตั้งชื่อให้จำง่าย</li>
        <li>อย่ารวมชิ้นส่วนที่ต้องปรับแยกกันไว้ใน Group เดียว โมเดลชิ้นเดียวจะแก้สูตรได้ทั้งชิ้นเท่านั้น</li>
        <li>เปิด “การปรับขนาดและลวดลาย” ของชิ้นส่วน แล้วเลือก ยืดตามขนาด, คงขนาด, รักษาสัดส่วน หรือจัดซ้ำ แยกตามแกน</li>
        <li>ใช้ “จัดซ้ำ” กับลายหรือลูกฟักที่แยกเป็นชิ้น เพื่อเพิ่ม/ลดจำนวนและคงขนาดเดิม พร้อมกำหนดช่องไฟ · สูตร Scale/Offset อยู่ในส่วนขั้นสูง</li>
        <li>ดูตัวอย่าง 2D/3D แล้วปรับ W/D/H ก่อนบันทึกและวาง เพื่อเช็กการยืดและระยะประกบ</li>
      </ol>
      {combined && <p className="cf-family-guide-warning" role="status">พบ Mesh เดียว · ถ้าต้องการให้กรอบกับบานปรับแยกกัน ให้แยกเป็น Group/Component ใน SketchUp แล้วส่งออกใหม่</p>}
      {!!unnamed.length && <p className="cf-family-guide-warning" role="status">มี {unnamed.length} ชิ้นที่ยังไม่มีชื่อ · ตั้งชื่อในรายการ Mesh เพื่อหาแก้ไขได้ง่าย</p>}
      <p className="cf-family-guide-footnote">ตัวตรวจเช็กสูตรและขอบเขตพารามิเตอร์ก่อนบันทึก · Mesh ที่รวมกันยังไม่สามารถแยกส่วนหรือเดาเจตนาของลายได้เอง</p>
    </div>
  </details>
}
