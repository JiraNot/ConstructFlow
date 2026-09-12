# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module I18n
        STRINGS = {
          # Application & Toolbar
          'app.name'                  => 'ConstructFlow',
          'toolbar.name'              => 'ConstructFlow - ลำดับขั้นตอนก่อสร้าง',
          'menu.main'                 => 'ConstructFlow',
          'menu.inspector'            => '1.0 ตรวจสอบโครงการ (Project Inspector)',

          # Workflow Groups
          'group.setup'               => '1. ตั้งค่าโครงการ (Setup)',
          'group.structure'           => '2. งานโครงสร้าง (Structure)',
          'group.architecture'        => '3. งานสถาปัตยกรรม (Architecture)',
          'group.mep'                 => '4. งานระบบ MEP (Sanitary & Electrical)',
          'group.interior'            => '5. งานภายในและผิวอาคาร (Interiors & Finishes)',
          'group.costing'             => '6. ครุภัณฑ์และถอดแบบราคา (FF&E and Costing)',

          # Tool 1: Inspector
          'tool.inspector.label'      => '1.0 ตรวจสอบโครงการ',
          'tool.inspector.tooltip'    => '[ขั้นตอนที่ 1.0] ตรวจสอบโครงการ: แสดงสถานะโมเดล ชั้นอาคาร และประวัติการทำงาน',
          'tool.inspector.status'     => 'คลิกเพื่อเปิดหน้าต่างตรวจสอบสถานะโครงการและระดับชั้นอาคาร',

          # Tool 2: Level
          'tool.level.label'          => '1.1 ระดับชั้นอาคาร',
          'tool.level.tooltip'        => '[ขั้นตอนที่ 1.1] ระดับชั้นอาคาร: สร้างและกำหนดระดับความสูงของชั้น (Elevation)',
          'tool.level.status'         => 'กำหนดระดับชั้นอาคารเพื่อใช้เป็นจุดอ้างอิงความสูงของเสา ผนัง และพื้น',

          # Tool 3: Phase
          'tool.phase.label'          => '1.2 เฟสการทำงาน',
          'tool.phase.tooltip'        => '[ขั้นตอนที่ 1.2] เฟสการทำงาน: สลับระยะเวลาก่อสร้าง (มีอยู่เดิม / รื้อถอน / ก่อสร้างใหม่)',
          'tool.phase.status'         => 'ตั้งค่าระยะเวลาทำงานปัจจุบัน: 0=มีอยู่เดิม, 1=รื้อถอน, 2=สร้างใหม่',

          # Tool 4: Foundation
          'tool.foundation.label'     => '2.1 ฐานราก',
          'tool.foundation.tooltip'   => '[ขั้นตอนที่ 2.1] ฐานรากคอนกรีต: สร้างฐานรากใต้เสาที่เลือก หรือกำหนดตำแหน่งอิสระ',
          'tool.foundation.status'    => 'เลือกเสาโครงสร้าง แล้วคลิกเพื่อสร้างฐานรากคอนกรีต',

          # Tool 5: Column
          'tool.column.label'         => '2.2 เสาโครงสร้าง',
          'tool.column.tooltip'       => '[ขั้นตอนที่ 2.2] เสาโครงสร้าง: วางเสาคสล./เหล็ก ตามพิกัดและระดับชั้น',
          'tool.column.status'        => 'คลิกเพื่อวางเสาโครงสร้าง • Esc เพื่อยกเลิก',

          # Tool 6: Wall
          'tool.wall.label'           => '3.1 วาดผนัง',
          'tool.wall.tooltip'         => '[ขั้นตอนที่ 3.1] วาดผนังอัจฉริยะ: ลากเส้นแนวกำแพง กำหนดความหนาและความสูง',
          'tool.wall.status'          => 'คลิกจุดเริ่มต้น จากนั้นคลิกจุดสิ้นสุดเพื่อวาดผนัง • Esc เพื่อยกเลิก',

          # Tool 7: Opening
          'tool.opening.label'        => '3.2 ช่องเปิดผนัง',
          'tool.opening.tooltip'      => '[ขั้นตอนที่ 3.2] เจาะช่องเปิด: สร้างช่องประตู-หน้าต่างบนผนังที่ระบุ',
          'tool.opening.status'       => 'คลิกบนผนังเพื่อเจาะช่องเปิด ระบุความกว้าง ความสูง และระดับยกขอบ',

          # Tool 8: Door & Window
          'tool.door_window.label'    => '3.3 ประตู-หน้าต่าง',
          'tool.door_window.tooltip'  => '[ขั้นตอนที่ 3.3] ประตูและหน้าต่าง: ติดตั้งชุดบานประตู/หน้าต่างลงในช่องเปิด',
          'tool.door_window.status'   => 'เลือกช่องเปิดที่ต้องการ แล้วคลิกเพื่อติดตั้งบานประตูหรือหน้าต่าง',

          # Tool 9: Roof
          'tool.roof.label'           => '3.4 หลังคา',
          'tool.roof.tooltip'         => '[ขั้นตอนที่ 3.4] สร้างหลังคา: ขึ้นรูปหลังคาจากพื้นผิว (Face) พร้อมคำนวณสโลป',
          'tool.roof.status'          => 'เลือกพื้นผิว (Face) ที่ต้องการสร้างหลังคา แล้วคลิกปุ่มนี้',

          # Tool 10: Gutter
          'tool.gutter.label'         => '3.5 รางน้ำฝน',
          'tool.gutter.tooltip'       => '[ขั้นตอนที่ 3.5] รางน้ำฝน: ติดตั้งรางระบายน้ำฝนตามขอบชายคาหลังคา',
          'tool.gutter.status'        => 'เลือกหลังคาที่ต้องการ แล้วระบุขอบชายคาเพื่อติดตั้งรางน้ำฝน',

          # Tool 11: Manhole
          'tool.manhole.label'        => '4.1 บ่อพักน้ำทิ้ง',
          'tool.manhole.tooltip'      => '[ขั้นตอนที่ 4.1] บ่อพักน้ำทิ้ง: วางบ่อพักท่อระบายน้ำภายนอก/ภายใน',
          'tool.manhole.status'       => 'คลิกวางบ่อพักน้ำทิ้ง กำหนดระดับฝาและระดับก้นท่อ',

          # Tool 12: Pipe
          'tool.pipe.label'           => '4.2 ท่อระบายน้ำ',
          'tool.pipe.tooltip'         => '[ขั้นตอนที่ 4.2] ท่อระบายน้ำ: เดินท่อเชื่อมระหว่างบ่อพัก 2 จุด พร้อมเช็คระดับลาดเอียง',
          'tool.pipe.status'          => 'เลือกบ่อพักต้นทางและปลายทาง (2 บ่อ) เพื่อเชื่อมท่อระบายน้ำ',

          # Tool 13: Panelboard
          'tool.panelboard.label'     => '4.3 ตู้เมนไฟฟ้า',
          'tool.panelboard.tooltip'   => '[ขั้นตอนที่ 4.3] ตู้ควบคุมไฟฟ้า: ติดตั้งตู้ MDB / DB และกระจายโหลดวงจรย่อย',
          'tool.panelboard.status'    => 'ระบุชื่อตู้ไฟ พิกัดกระแส (A) จำนวนวงจรย่อย และแรงดันไฟฟ้า',

          # Tool 14: Cable & Conduit
          'tool.cable.label'          => '4.4 สายไฟ/ท่อร้อยสาย',
          'tool.cable.tooltip'        => '[ขั้นตอนที่ 4.4] ท่อร้อยสายและสายไฟ: กำหนดแนวท่อร้อยสายไฟฟ้าบนฝ้าหรือพื้น',
          'tool.cable.status'         => 'กำหนดจุดเริ่มต้น-สิ้นสุดเพื่อสร้างแนวท่อร้อยสายและคำนวณขนาดท่อ',

          # Tool 15: Surface & Paving
          'tool.surface.label'        => '5.1 ผิวพื้นและลายปู',
          'tool.surface.tooltip'      => '[ขั้นตอนที่ 5.1] ผิวพื้นและลายปู: ปูลวดลายพื้น บล็อกตัวหนอน และขอบคันทางบน Face',
          'tool.surface.status'       => 'เลือกพื้นผิว (Face) เพื่อสร้างผิวพื้น กำหนดลวดลายปู และคันหิน',

          # Tool 16: Cabinet
          'tool.cabinet.label'        => '5.2 ตู้บิวท์อิน',
          'tool.cabinet.tooltip'      => '[ขั้นตอนที่ 5.2] ตู้และเคาน์เตอร์บิวท์อิน: วางแนวตู้ครัว แบ่งช่อง และใส่วัสดุปิดผิว',
          'tool.cabinet.status'       => 'คลิกวางแนวตู้เคาน์เตอร์บิวท์อิน กำหนดขนาดและจำนวนช่องโมดูล',

          # Tool 17: Wardrobe
          'tool.wardrobe.label'       => '5.3 ตู้เสื้อผ้าบิวท์อิน',
          'tool.wardrobe.tooltip'     => '[ขั้นตอนที่ 5.3] ตู้เสื้อผ้าบิวท์อิน: สร้างตู้เสื้อผ้า เลือกบานเปิด/บานเลื่อน',
          'tool.wardrobe.status'      => 'ระบุขนาดตู้เสื้อผ้า รูปแบบบาน (บานเปิด หรือ บานเลื่อน) และการแบ่งช่อง',

          # Tool 18: Asset
          'tool.asset.label'          => '6.1 ครุภัณฑ์สำเร็จรูป',
          'tool.asset.tooltip'        => '[ขั้นตอนที่ 6.1] ครุภัณฑ์สำเร็จรูป: วางเฟอร์นิเจอร์และสุขภัณฑ์จากแคตตาล็อก',
          'tool.asset.status'         => 'ระบุรหัสครุภัณฑ์จากแคตตาล็อกเพื่อวางลงในโมเดล',

          # Tool 19: Costing
          'tool.costing.label'        => '6.2 ถอดแบบและราคา (BOQ)',
          'tool.costing.tooltip'      => '[ขั้นตอนที่ 6.2] ถอดแบบและราคา (BOQ): คำนวณปริมาณวัสดุ แรงงาน และสรุปราคาโครงการ',
          'tool.costing.status'       => 'คลิกเพื่อคำนวณปริมาณงานก่อสร้างทั้งหมดและสรุปยอดงบประมาณ'
        }.freeze

        def self.t(key, default = nil)
          STRINGS.fetch(key, default || key)
        end
      end
    end
  end
end
