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

          # Stage flyout buttons (one toolbar button per stage)
          'group.setup.tooltip'        => '[ขั้นตอนที่ 1] เปิดแผงเครื่องมือกลุ่มตั้งค่าโครงการ (Inspector, Level, Phase)',
          'group.setup.status'         => 'คลิกเพื่อเลือกเครื่องมือในกลุ่มตั้งค่าโครงการ',
          'group.structure.tooltip'    => '[ขั้นตอนที่ 2] เปิดแผงเครื่องมือกลุ่มงานโครงสร้าง (Foundation, Column, Grid, Beam, Framing, Rebar)',
          'group.structure.status'     => 'คลิกเพื่อเลือกเครื่องมือในกลุ่มงานโครงสร้าง',
          'group.architecture.tooltip' => '[ขั้นตอนที่ 3] เปิดแผงเครื่องมือกลุ่มงานสถาปัตยกรรม (Wall, Opening, Door/Window, Floor, Ceiling, Stair, Curtain Wall, Roof, Gutter)',
          'group.architecture.status'  => 'คลิกเพื่อเลือกเครื่องมือในกลุ่มงานสถาปัตยกรรม',
          'group.mep.tooltip'          => '[ขั้นตอนที่ 4] เปิดแผงเครื่องมือกลุ่มงานระบบ MEP (Manhole, Pipe, Panelboard, Conduit)',
          'group.mep.status'           => 'คลิกเพื่อเลือกเครื่องมือในกลุ่มงานระบบ MEP',
          'group.interior.tooltip'     => '[ขั้นตอนที่ 5] เปิดแผงเครื่องมือกลุ่มงานภายในและผิวอาคาร (Surface, Cabinet, Wardrobe)',
          'group.interior.status'      => 'คลิกเพื่อเลือกเครื่องมือในกลุ่มงานภายในและผิวอาคาร',
          'group.costing.tooltip'      => '[ขั้นตอนที่ 6] เปิดแผงเครื่องมือกลุ่มครุภัณฑ์และถอดแบบราคา (Asset, BOQ, CSV)',
          'group.costing.status'       => 'คลิกเพื่อเลือกเครื่องมือในกลุ่มครุภัณฑ์และถอดแบบราคา',
          'group.drawing'              => '7. งานเขียนแบบและวัดระยะ (Drawing)',
          'group.drawing.tooltip'      => '[ขั้นตอนที่ 7] เปิดแผงเครื่องมือกลุ่มงานเขียนแบบและวัดระยะ (Dimension, Elevation, Scene, Stretch, Laser, Array)',
          'group.drawing.status'       => 'คลิกเพื่อเลือกเครื่องมือในกลุ่มงานเขียนแบบและวัดระยะ',

          # Tool 0: Panel launcher (full editor)
          'tool.panel.label'          => '0.0 แผงควบคุมรวม',
          'tool.panel.tooltip'        => '[ศูนย์รวม] เปิดแผงควบคุม ConstructFlow: แคตตาล็อก ตั้งค่าพารามิเตอร์ และดู BOQ',
          'tool.panel.status'         => 'เปิดหน้าต่างแผงควบคุมหลักของ ConstructFlow (คีย์ลัด: CF)',

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

          # Structure detailing tools
          'tool.grid_framing.label'   => '2.3 กริดโครงสร้าง',
          'tool.grid_framing.tooltip' => '[ขั้นตอนที่ 2.3] กริดโครงสร้าง: วางเสา-คานตามแนวกริดอัตโนมัติ',
          'tool.grid_framing.status'  => 'เลือกเส้นกริดเพื่อสร้างโครงเสาและคานตามแนว',

          'tool.beam.label'           => '2.4 คาน',
          'tool.beam.tooltip'         => '[ขั้นตอนที่ 2.4] คานโครงสร้าง: วาดคานเชื่อมระหว่างเสาหรือกริด พร้อมล็อกแนวระดับพื้น',
          'tool.beam.status'          => 'คลิกจุดเริ่ม แล้วคลิกจุดจบเพื่อวาดคาน • Esc เพื่อยกเลิก',

          'tool.grid.label'           => '2.5 เส้นกริด',
          'tool.grid.tooltip'         => '[ขั้นตอนที่ 2.5] เส้นกริด: สร้างเส้นอ้างอิงโครงสร้างสำหรับวางเสาและคาน',
          'tool.grid.status'          => 'คลิกจุดเริ่มและจุดจบเพื่อลากเส้นกริดอ้างอิง',

          'tool.rebar.label'          => '2.6 เหล็กเสริม 3D',
          'tool.rebar.tooltip'        => '[ขั้นตอนที่ 2.6] เหล็กเสริม 3D: ใส่ตะแกรงเหล็กและโครงปลอกในเสา คาน หรือฐานรากที่เลือก',
          'tool.rebar.status'         => 'เลือกวัตถุโครงสร้าง (เสา/คาน/ฐานราก) แล้วใส่ชุดเหล็กเสริม',

          'tool.bbs.label'            => '2.7 ตารางดัดเหล็ก',
          'tool.bbs.tooltip'          => '[ขั้นตอนที่ 2.7] ตารางดัดเหล็ก (BBS): สรุปจำนวน ขนาด และน้ำหนักเหล็กเสริมทั้งหมดในโมเดล',
          'tool.bbs.status'           => 'คลิกเพื่อดูตารางดัดเหล็กและน้ำหนักรวมจากการใส่เหล็กเสริม',

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

          # Architecture shell tools
          'tool.floor.label'          => '3.4 พื้น',
          'tool.floor.tooltip'        => '[ขั้นตอนที่ 3.4] พื้นอาคาร: วาดขอบเขตพื้น ปิดลูปอัตโนมัติ พร้อมกำหนดความหนา',
          'tool.floor.status'         => 'คลิกจุดขอบเขตตามลำดับ แล้วปิดลูปเพื่อสร้างพื้น • Esc เพื่อยกเลิก',

          'tool.ceiling.label'        => '3.5 ฝ้าเพดาน',
          'tool.ceiling.tooltip'      => '[ขั้นตอนที่ 3.5] ฝ้าเพดาน: วาดระนาบฝ้าเพดานพร้อมโครงคร่าว C-Line',
          'tool.ceiling.status'       => 'คลิกจุดขอบเขตห้องเพื่อสร้างแนวฝ้าเพดาน • Esc เพื่อยกเลิก',

          'tool.stair.label'          => '3.6 บันได',
          'tool.stair.tooltip'        => '[ขั้นตอนที่ 3.6] บันได: สร้างบันไดเชื่อมระหว่างชั้น พร้อมลูกตั้ง-ลูกนอน',
          'tool.stair.status'         => 'คลิกจุดเริ่มเพื่อวางบันได • Esc เพื่อยกเลิก',

          'tool.curtain_wall.label'   => '3.7 ผนังกระจก/ระแนง',
          'tool.curtain_wall.tooltip' => '[ขั้นตอนที่ 3.7] ผนังกระจก/ระแนง: สร้างผนังม่านกระจกหรือระแนงพร้อมเสา-ราง',
          'tool.curtain_wall.status'  => 'คลิกจุดเริ่มและจุดจบเพื่อสร้างผนังกระจก • Esc เพื่อยกเลิก',

          'tool.curtain_wall_edit.label'   => '3.8 แก้ไขผนังกระจก',
          'tool.curtain_wall_edit.tooltip' => '[ขั้นตอนที่ 3.8] แก้ไขผนังกระจก: เลือกผนังกระจก/ระแนงแล้วปรับระยะเสา-รางและจำนวนช่อง',
          'tool.curtain_wall_edit.status'  => 'เลือกผนังกระจกในแบบก่อน แล้วเรียกใช้คำสั่งนี้เพื่อแก้ไขค่า',

          # Tool 9: Roof
          'tool.roof.label'           => '3.9 หลังคา',
          'tool.roof.tooltip'         => '[ขั้นตอนที่ 3.9] สร้างหลังคา: ขึ้นรูปหลังคาจากพื้นผิว (Face) พร้อมคำนวณสโลป',
          'tool.roof.status'          => 'เลือกพื้นผิว (Face) ที่ต้องการสร้างหลังคา แล้วคลิกปุ่มนี้',

          # Tool 10: Gutter
          'tool.gutter.label'         => '3.10 รางน้ำฝน',
          'tool.gutter.tooltip'       => '[ขั้นตอนที่ 3.10] รางน้ำฝน: ติดตั้งรางระบายน้ำฝนตามขอบชายคาหลังคา',
          'tool.gutter.status'        => 'เลือกหลังคาที่ต้องการ แล้วระบุขอบชายคาเพื่อติดตั้งรางน้ำฝน',

          # Roof family — steel framing, edits, generated forms
          'tool.roof_framing.label'      => '3.11 โครงหลังคาเหล็ก',
          'tool.roof_framing.tooltip'    => '[ขั้นตอนที่ 3.11] โครงหลังคาเหล็ก: ขึ้นจันทัน แป และโครงถัก พร้อมกำหนดความชันและระยะยื่นชายคา',
          'tool.roof_framing.status'     => 'คลิกบนผืนหลังคาเพื่อสร้างโครงหลังคาเหล็ก • Esc เพื่อยกเลิก',

          'tool.roof_framing_edit.label'   => '3.12 แก้ไขโครงหลังคา',
          'tool.roof_framing_edit.tooltip' => '[ขั้นตอนที่ 3.12] แก้ไขโครงหลังคา: เลือกโครงหลังคาเหล็กที่มีอยู่ แล้วปรับความชัน ระยะจันทัน แป และชายคา',
          'tool.roof_framing_edit.status'  => 'เลือกโครงหลังคาเหล็กในแบบก่อน แล้วเรียกใช้คำสั่งนี้เพื่อแก้ไขค่า',

          'tool.roof_hip_gable.label'      => '3.13 หลังคาปั้นหยา/จั่ว',
          'tool.roof_hip_gable.tooltip'    => '[ขั้นตอนที่ 3.13] หลังคาปั้นหยา/จั่ว: สร้างหลังคาพร้อมเชิงชายจากแนวผนังที่ปิดรอบ',
          'tool.roof_hip_gable.status'     => 'เลือกผนังหรือพื้นที่ปิดรอบ แล้วสร้างหลังคาปั้นหยา/จั่วพร้อมเชิงชาย',

          'tool.roof_auto.label'      => '3.14 หลังคา Auto Revit',
          'tool.roof_auto.tooltip'    => '[ขั้นตอนที่ 3.14] หลังคา Auto Revit: สร้างหลังคาจาก footprint พร้อมแนบหัวผนังและปิดจั่วอัตโนมัติ',
          'tool.roof_auto.status'     => 'เลือกผนังหรือพื้นที่ แล้วสร้างหลังคาอัตโนมัติพร้อมแนบผนัง',

          # Interior finishes & detailing
          'tool.room.label'           => '3.15 ตรวจหาห้อง',
          'tool.room.tooltip'         => '[ขั้นตอนที่ 3.15] ตรวจหาห้อง: สร้างห้องอัตโนมัติจากแนวผนัง พร้อมคำนวณพื้นที่และเส้นรอบรูป',
          'tool.room.status'          => 'คลิกเพื่อให้ระบบตรวจหาและสร้างห้องจากผนังที่ปิดรอบ',

          'tool.paving.label'         => '3.16 ปูกระเบื้องลายพื้น',
          'tool.paving.tooltip'       => '[ขั้นตอนที่ 3.16] ปูกระเบื้องลายพื้น: สร้างแผ่นกระเบื้อง 3D ลายก้างปลาหรือสลับแผ่นบนผิว Face',
          'tool.paving.status'        => 'เลือก Face ผิวพื้น แล้วกดเพื่อปูกระเบื้องลายพื้น',

          'tool.profile_new.label'    => '3.17 บันทึกหน้าตัดใหม่',
          'tool.profile_new.tooltip'  => '[ขั้นตอนที่ 3.17] บันทึกหน้าตัดใหม่: สกัด Face ที่เลือกเป็นโปรไฟล์สำหรับกวาดบัวและราว',
          'tool.profile_new.status'   => 'เลือก Face หน้าตัดก่อน แล้วบันทึกเป็นโปรไฟล์ใหม่',

          'tool.profile_sweep.label'  => '3.18 กวาดบัว/ราวมือจับ',
          'tool.profile_sweep.tooltip'=> '[ขั้นตอนที่ 3.18] กวาดบัว/ราวมือจับ: ลากเส้นกวาดโปรไฟล์ต่อเนื่องพร้อมเข้ามุม 45°',
          'tool.profile_sweep.status' => 'คลิกต่อจุดตามแนวผนัง แล้วดับเบิ้ลคลิกเพื่อจบงาน • Esc เพื่อยกเลิก',

          'tool.profile_sweep_selection.label'   => '3.19 กวาดบัวตามเส้น',
          'tool.profile_sweep_selection.tooltip' => '[ขั้นตอนที่ 3.19] กวาดบัวตามเส้น: กวาดโปรไฟล์ตามเส้นที่เลือกไว้ในโมเดล',
          'tool.profile_sweep_selection.status'  => 'เลือกเส้นแนวในแบบก่อน แล้วกวาดโปรไฟล์ตามเส้นนั้น',

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
          'tool.costing.status'       => 'คลิกเพื่อคำนวณปริมาณงานก่อสร้างทั้งหมดและสรุปยอดงบประมาณ',

          'tool.export_csv.label'     => '6.3 ส่งออก BOQ CSV',
          'tool.export_csv.tooltip'   => '[ขั้นตอนที่ 6.3] ส่งออก BOQ CSV: ส่งรายการปริมาณและราคาทั้งหมดออกเป็นไฟล์ CSV',
          'tool.export_csv.status'    => 'คลิกเพื่อเลือกตำแหน่งบันทึกและส่งออก BOQ เป็น CSV',

          # Tool 7.x: Drawing, annotation and measurement
          'tool.dimension.label'      => '7.1 ดึงระยะ Auto',
          'tool.dimension.tooltip'    => '[ขั้นตอนที่ 7.1] ดึงระยะ Auto: สร้างเส้นบอกระยะเสา ผนัง และระยะรวมอัตโนมัติ',
          'tool.dimension.status'     => 'คลิกเพื่อสร้างเส้นบอกระยะอัตโนมัติจากวัตถุในแบบ',

          'tool.spot_elevation.label'   => '7.2 ปักหมุดระดับ',
          'tool.spot_elevation.tooltip' => '[ขั้นตอนที่ 7.2] ปักหมุดระดับ: คลิกปักหมุดสัญลักษณ์ระดับ (FL./GL./BEAM) บนพื้นผิว',
          'tool.spot_elevation.status'  => 'คลิกบนพื้นผิวเพื่อปักหมุดระดับ • Esc เพื่อยกเลิก',

          'tool.scenes.label'         => '7.3 Scene LayOut',
          'tool.scenes.tooltip'       => '[ขั้นตอนที่ 7.3] Scene LayOut: สร้างชุด Scenes แปลน รูปด้าน รูปตัด ส่งเข้า LayOut',
          'tool.scenes.status'        => 'คลิกเพื่อสร้าง Scenes สำหรับจัดทำแบบส่งเข้า LayOut',

          'tool.smart_stretch.label'  => '7.4 ยืดขอบไม่เพี้ยน',
          'tool.smart_stretch.tooltip'=> '[ขั้นตอนที่ 7.4] ยืดขอบไม่เพี้ยน: ยืด/ย่อสเกลประตู หน้าต่าง ตู้ โดยขอบเฟรมไม่เพี้ยน',
          'tool.smart_stretch.status' => 'เลือก Group หรือ Component ก่อน แล้วยืดขนาดเป้าหมาย',

          'tool.stretch_area.label'   => '7.5 ยืดตามพื้นที่',
          'tool.stretch_area.tooltip' => '[ขั้นตอนที่ 7.5] ยืดตามพื้นที่: ขยายวัตถุตามพื้นที่เป้าหมาย (ตร.ม.) ที่กำหนด',
          'tool.stretch_area.status'  => 'เลือกวัตถุ แล้วเรียกใช้เครื่องมือยืดตามพื้นที่',

          'tool.laser_level.label'    => '7.6 เลเซอร์วัดระดับ',
          'tool.laser_level.tooltip'  => '[ขั้นตอนที่ 7.6] เลเซอร์วัดระดับ: ฉายเส้นเลเซอร์แนวนอน วัดระดับ Z แบบ Realtime',
          'tool.laser_level.status'   => 'คลิกจุด Benchmark แล้วขยับเมาส์เพื่ออ่านค่าระดับ • Esc เพื่อยกเลิก',

          'tool.array_face.label'     => '7.7 อาร์เรย์บนผิว',
          'tool.array_face.tooltip'   => '[ขั้นตอนที่ 7.7] อาร์เรย์บนผิว: วางแผ่นวัสดุ/ระแนงกระจายเต็มพื้นที่ Face ที่ลาดเอียง',
          'tool.array_face.status'    => 'เลือก Face แล้วกดเพื่อวางชิ้นงานกระจายบนผิว'
        }.freeze

        def self.t(key, default = nil)
          STRINGS.fetch(key, default || key)
        end
      end
    end
  end
end
