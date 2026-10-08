# ConstructFlow — Material & Glass Specification UX Plan

วันที่: 2026-10-08  
สถานะ: **ข้อเสนอจากการตรวจโค้ดจริง ยังไม่ได้ implement ระบบวัสดุใหม่นี้**  
ขอบเขต: ประตู หน้าต่าง ช่องแสง ราวกันตก และสัญญาข้อมูลที่นำไปใช้ต่อกับฉากกั้น/ห้องอาบน้ำ/หน้าบานตู้ได้

## 1. ปัญหาปัจจุบันที่ตรวจพบ

| จุดในโค้ด | สิ่งที่มีจริง | ช่องว่าง |
|---|---|---|
| `apps/plan-editor/src/components/CatalogField.tsx` | วงกบ: ไม้/อะลูมิเนียม/uPVC; วัสดุบาน: ไม้/อะลูมิเนียม/บานเรียบ | ตัวเลือกบานขาด uPVC/กระจก; บานเรียบเป็นรูปแบบ ไม่ใช่ชนิดวัสดุ |
| `apps/plan-editor/src/components/TypeManagerModal.tsx` | วงกบและกระจกแสดงตลอด; ช่องวัสดุบานเพิ่มให้ประตู | ประตู/หน้าต่างไม่ใช้ flow วัสดุเดียวกัน และไม่ได้เลือกกระจกตามส่วน |
| `packages/project-model/src/project.ts` | `frame_material`, `panel_material`, `glazing_material`, `glazing_transmission` | กระจกมีเพียง none/clear/frosted/tinted ไม่มีการผลิต ความหนา หรือชั้นประกอบ |
| `packages/representation-engine/src/index.ts` | resolve กระจกหนึ่งค่าต่อ opening | บานหลักกับช่องแสงใช้สเปกเดียวทั้งหมด ไม่มีกรอบบานแยกวงกบ |
| `apps/plan-editor/src/components/Model3DViewport.tsx` | กระจกใน addSash หนา 0.012 m คงที่; sash ใช้วัสดุวงกบ | ความหนาภาพไม่ใช่ความหนาสเปก และเปลี่ยนวัสดุบานไม่ได้ควบคุม sash อย่างชัดเจน |
| `packages/project-model/src/types.ts` / `architecture-engine/src/railings.ts` | ราวมี `material` หนึ่งค่า; glass_panel เป็นผิวสามเหลี่ยมรวมกับชิ้นส่วนอื่น | ไม่มี glass spec, ความหนา pane, วัสดุแยกเสา/มือจับ หรือปริมาณกระจก m² ใน railingOutputs |
| `packages/takeoff-engine/src/index.ts` | ประตู/หน้าต่างนับหนึ่งรายการต่อช่องเปิด; หักพื้นที่ช่องเปิดจากผนัง | ยังไม่ใช่ตารางกระจกจริงรายแผ่น/สเปก |
| `packages/interior-engine/src/index.ts` | front เป็น solid/glass/open | สถานะ glass ไม่ได้ระบุรายละเอียดการผลิตกระจก |

การแก้ลูกฟักรายบานและแยกช่องแสงที่ทำก่อนหน้านี้ยังใช้ต่อได้ แต่ **การแบ่งลูกฟักไม่เท่ากับการแบ่งสเปกวัสดุ** ต้องเพิ่มสัญญาสำหรับวัสดุของแต่ละส่วน

## 2. Flow ที่เสนอให้ใช้งานง่าย

### 2.1 วงกบ กรอบบาน และส่วนบาน

แสดงข้อมูลหลักสามกลุ่ม โดยซ่อนรายละเอียดที่ไม่ได้ใช้:

1. **วงกบ** — ไม้ / อะลูมิเนียม / uPVC พร้อมสีหรือผิวสำเร็จในรายละเอียด
2. **วัสดุส่วนบาน** — ไม้ / อะลูมิเนียม / uPVC / กระจก / ทึบผสมกระจก
3. **กรอบบาน** — เริ่มด้วย “ใช้ตามวงกบ”; เมื่อยกเลิกจึงให้เลือกไม้ / อะลูมิเนียม / uPVC แยกได้

กรอบบานคือขอบของบานที่เคลื่อนที่ ส่วนบานคือวัสดุที่อยู่ภายในกรอบ เช่น หน้าต่างกรอบ uPVC ใส่กระจก ต่างจากแผง uPVC ทึบ ต้องเก็บทั้งสองอย่าง ไม่ตีความว่าการเลือกอะลูมิเนียมแปลว่าเป็นกระจกโดยอัตโนมัติ

- วงกบและกรอบบานใช้ชุดตัวเลือกวัสดุโครงเดียวกัน ส่วนบานเพิ่มกระจกตามที่ผู้ใช้ร้องขอ
- ย้าย “บานเรียบ/ลูกฟัก/เกล็ด” ไปกลุ่ม **รูปแบบบาน**; ไม้จริง/ไม้ประกอบหรือวัสดุอื่นค่อยเปิดรายละเอียดตามชนิด ไม่ปนกับรูปแบบ
- การเลือกส่วนบานทึบซ่อนช่องตั้งกระจกของส่วนนั้น; หากมีช่องแสง กระจกของช่องแสงยังตั้งได้
- “ไร้กรอบ” เป็นตัวเลือกวิธีประกอบ `frame_mode` ไม่ใช่วัสดุกระจก เพิ่มเฉพาะรูปแบบที่รองรับ
- ค่าเริ่มต้นของชนิดใหม่มาจาก preset ที่เลือกและแสดงให้เห็น ผู้ใช้เปลี่ยนได้ ไม่มีการสลับชนิดวัสดุเงียบ ๆ ระหว่างแก้ฟอร์ม

ตัวอย่างหน้าจอกรณีหน้าต่าง:

```text
วัสดุ
  วงกบ                [ uPVC                 ▾ ]
  กรอบบาน             [✓ ใช้ตามวงกบ             ]
  วัสดุส่วนบาน         [ กระจก                ▾ ]

กระจกบานหลัก
  ชนิด                [ เทมเปอร์             ▾ ]
  ความหนา             [ 6 มม.                 ]
  สี                  [ ใส                   ▾ ]
  ผิว                 [ เรียบใส              ▾ ]
  ▸ รายละเอียดเพิ่มเติม

ช่องแสงบน             [✓ ใช้กระจกเดียวกับบานหลัก]
ช่องแสงล่าง            [✓ ใช้กระจกเดียวกับบานหลัก]

สรุป: วงกบและกรอบบาน uPVC · กระจกเทมเปอร์ใส 6 มม.
```

ตัวเลขในตัวอย่างเป็น input สำหรับอธิบาย UI ไม่ใช่การแนะนำขนาดให้เหมาะกับงานทุกประเภท

### 2.2 กระจกเลือกตามลำดับ ไม่แสดงทุกช่องพร้อมกัน

| ตัวเลือกหลัก | ช่องที่แสดง |
|---|---|
| กระจกธรรมดา | ความหนาแผ่น สี ผิว |
| กระจกเทมเปอร์ | ความหนาแผ่น สี ผิว |
| กระจกลามิเนต | ความหนาแต่ละแผ่น ชนิด/ความหนาฟิล์ม สี ผิว ความหนารวมอัตโนมัติ |
| กระจกเทมเปอร์ลามิเนต | รายละเอียดชั้นประกอบเช่นลามิเนต โดยแผ่นกระจกเป็นเทมเปอร์ |

กลุ่มข้างบนเป็น **preset เพื่อใช้ง่าย**; domain เก็บการอบและการประกอบแยกกัน เพราะเทมเปอร์คือการปรับสภาพกระจกด้วยความร้อน ส่วนลามิเนตประกอบจากหลายแผ่นและ interlayer จึงใช้งานร่วมกันได้ ไม่ควรบังคับให้เลือกระหว่างสองคุณสมบัตินี้ในโครงข้อมูล ([Pilkington Toughened Glass](https://www.pilkington.com/en-gb/united-kingdom/architectural-and-technical-glass/product-categories/safety-and-security/pilkington-toughened-glass), [Pilkington Optilam](https://www.pilkington.com/en/gbl/architectural-and-technical-glass/product-categories/safety-and-security/pilkington-optilam))

แยกคุณสมบัติให้ถูกหมวด:

- **ชนิดการผลิต**: ธรรมดา / เทมเปอร์; heat-strengthened เป็นรายละเอียดขั้นสูงภายหลัง
- **โครงสร้าง**: แผ่นเดี่ยว / ลามิเนต; กระจกฉนวน IGU เป็นงานระยะถัดไป ไม่ใช้คำว่ากระจกสองชั้นแทนลามิเนต
- **สี**: ใส / เขียว / เทา / บรอนซ์ / กำหนดเอง; ระบุเพิ่มได้ว่าสีจากแผ่นหรือ interlayer
- **ผิว**: เรียบใส / ฝ้า / ลาย; รายละเอียดวิธีทำผิวเปิดเมื่อจำเป็น
- **สารเคลือบ**: ไม่มี / Low-E / Solar control ในรายละเอียดเพิ่มเติมเมื่อรองรับและมีข้อมูลผลิตภัณฑ์

ลามิเนตตัวอย่าง `5 + 0.76 + 5 = 10.76 มม.` ต้องคำนวณจากชั้นกระจกและ interlayer ไม่ปัดเป็น 10 มม. ในข้อมูลจริง หากมีชื่อความหนาทางการค้าให้เก็บชื่อแยกจากความหนาคำนวณ

รายการความหนาเป็นตัวเลือกสะดวกพร้อมกรอกเอง ไม่อ้างว่าทุกผู้ผลิตมีครบทุกค่า การตรวจความเข้ากันได้ของวัสดุ/การเคลือบอิงข้อมูลผู้ผลิตเมื่อผูกผลิตภัณฑ์จริง

## 3. วัสดุตามตำแหน่ง และ reuse ข้ามงาน

| งาน | ส่วนที่ต้องตั้งแยกได้ |
|---|---|
| ประตู/หน้าต่าง | วงกบ กรอบบาน ส่วนบานแต่ละบาน ช่องแสงบน ช่องแสงล่าง; ช่องข้างเมื่อ geometry รองรับ |
| ราวกันตก/ราวบันได | แผ่นกระจก เสา มือจับ รางฐาน/อุปกรณ์ยึด |
| ฉากกั้น/ห้องอาบน้ำ | แผ่นกระจก โครง/ขอบ บานเปิด และ hardware ตามระบบที่รองรับ |
| หน้าบานตู้ | กรอบบาน กระจก/แผงทึบ; กระจกเงาเป็น finish ที่ระบุด้าน ไม่ใช่แค่ลดความโปร่ง |

- บานหลักแต่ละบานเริ่มด้วย “ใช้ค่าเดียวกันทุกบาน” ลดความรก; advanced override รายบานตามลำดับบานที่มีจริง
- ช่องแสงบน/ล่างเริ่มเลือก “ใช้สเปกเดียวกับบานหลัก” ได้เฉพาะเมื่อบานหลักมีกระจก; หากบานหลักทึบให้เลือกสเปกของช่องแสงเอง
- “กำหนดแยก” clone spec เป็นรายการใหม่ก่อนแก้ เพื่อไม่เผลอเปลี่ยนทุกส่วนที่อ้าง spec เดิม
- การเปลี่ยนจำนวนบานรักษา assignment บานที่ยังมีอยู่; ตรวจและรายงานส่วนที่ถูกนำออกก่อนบันทึก ไม่เหลือ dangling reference
- บานทึบผสมกระจกต้องมี region geometry จริงพร้อมความสูง/ขนาด ห้ามเริ่มด้วย boolean แล้วให้ภาพกลายเป็นกระจกเต็มบาน
- ภาพ preview เลือก highlight ส่วนที่แก้ได้ และสรุปสเปกด้วยภาษาเดียวกับตารางแบบ/BOQ

## 4. สัญญาข้อมูลและ module boundaries ที่เสนอ

ออกแบบ reusable `GlassSpecification` ใน project-model เป็น catalog ที่มี RFC-4122 UUID อ้างอิงจากวัสดุแต่ละส่วน ไม่ใส่ข้อมูลวิศวกรรมไว้ใน React หรือ THREE.Material

```text
GlassSpecification
  id, name, specification_status (complete / unspecified)
  construction (monolithic / laminated)
  plies[]: thickness_mm?, treatment?, colour?
  interlayers[]: material?, thickness_mm?, colour?
  surface_finish, coating? + coating face when specified
  manufacturer?, product_code?, declared_properties?

OpeningMaterialAssignment
  outer_frame_material
  sash_frame_binding (same_as_outer_frame / explicit material)
  default_leaf_infill (solid / glass / mixed regions)
  optional per_leaf_infill[]
  top_light_infill?, bottom_light_infill?
  each glass region references glass_spec_id

RailingMaterialAssignment
  post_material, handrail_material, base_channel_material?
  glass_spec_id?, support_system?
```

เป็น candidate contract สำหรับพัฒนา ไม่ใช่ fields ที่มีแล้ว; schema version และ command payload ต้องเพิ่มพร้อม migration/test ใน implementation รอบจริง รายละเอียดเต็มให้ใช้ typed interfaces/discriminated unions ห้าม public any

- **project-model**: interfaces, shared registry, serialization/migration, reference integrity; สถานะ unspecified รองรับข้อมูลเก่าอย่างตรงไปตรงมา
- **catalog-engine / command-schema / command-runtime**: create/clone/update/assign spec ผ่าน CommandBus, ตรวจค่าก่อน commit, Undo/Redo และ cascade ทุก type ที่อ้าง spec; instance override ต้องเคารพ contract เดิม
- **architecture-engine**: pure functions คำนวณ thickness, panes, region bounds และ validation; geometry ของราวแยกกระจกกับโลหะ ให้ consumer ระบุวัสดุถูกชิ้น
- **representation-engine**: resolved material/part identities และ dimensions เป็น SSOT ที่ preview/3D ใช้ตรงกัน
- **plan-editor**: form และ rendering ใช้ resolved values; renderer ตั้งสี/ความขุ่นตาม appearance แต่ไม่อนุมานชนิดการผลิตจากสี
- **takeoff-engine / domain outputs / sheet-engine**: จำนวนแผ่น ขนาด พื้นที่สุทธิ และชื่อสเปกตรงกัน; BOQ จัดตาม created_phase ของเจ้าของชิ้นงาน ไม่ทำ spec กลางเป็นวัตถุก่อสร้างซ้ำ
- **interior-engine**: adapter เรียก shared spec สำหรับหน้าบานตู้; ฉากกั้นและ shower screen ต่อเมื่อมี object/placement contract ของโดเมนนั้น

ความหนา glass/interlayer เก็บ mm เช่น 0.76 โดยไม่ปัดเป็น integer UI ระบุหน่วย มม. ชัดเจนสำหรับรายละเอียดผลิตภัณฑ์นี้; ระยะวาง/ขนาดอาคารยังใช้ meter-first ตาม AGENTS.md

`glazing_transmission` เดิมเป็นค่าประกอบการแสดงผล ไม่ควรแปลงเป็นค่าการส่งผ่านแสงที่รับรอง/ประสิทธิภาพความร้อนของผลิตภัณฑ์ ค่า appearance override แยกจาก declared properties

## 5. Migration ที่ต้องรักษาความหมายข้อมูลเก่า

1. คง UUID, created_phase, host, position, handing, panel layout และจำนวนลูกฟักทุกส่วน
2. clear/frosted/tinted map เป็น appearance ของ spec ที่ยังไม่ระบุการผลิต/ความหนา ไม่เติม “เทมเปอร์ 12 มม.” จากความหนา mesh เดิม
3. `glazing_material: none` หมายถึงบานหลักทึบในข้อมูลเก่า ไม่มีการสร้างสเปกกระจกหลักให้เอง; ช่องแสง legacy ที่มี height แต่ไม่มีกระจกให้คงความหมายเดิมและชี้ว่าต้องกำหนดวัสดุส่วนนี้
4. `panel_material: flush` เก็บรูปแบบบานเรียบ แต่วัสดุจริงเป็น unspecified จนผู้ใช้ระบุ ไม่เดาว่าเป็นไม้จริง
5. อย่า map `panel_material` เดิมเป็น sash material อัตโนมัติ เพราะ renderer เดิมใช้ค่าดังกล่าวสำหรับแผงทึบ; sash legacy สืบวงกบตามพฤติกรรมภาพเดิม
6. renderer fallback สำหรับไฟล์ที่ไม่ทราบความหนาใช้เพื่อแสดงภาพเท่านั้น ห้ามนำค่าจำลองไปสเปกผลิต/BOQ
7. การลดโหมดจาก mixed/glass เป็นทึบเตือนเมื่อ region assignment กำลังถูกนำออกและ undo คืนได้; draft เก็บค่าที่ผู้ใช้กรอกระหว่างสลับตัวเลือก

## 6. ขอบเขตการคำนวณที่ต้องทำจริง

- Glass thickness = ผลรวมความหนา ply + interlayer; ค่าต้อง finite และ positive หากระบุ, จำนวนชั้นสอดคล้อง construction
- Net glass area คำนวณจาก pane geometry ที่หักกรอบแล้ว; แยกชิ้นกระจกตามการแบ่งจริง
- ลูกฟักชนิดแท่งแบ่งกระจกกับแถบตกแต่งบนผิวต้องระบุแยก เพราะจำนวนแผ่นไม่เหมือนกัน ห้ามนำเส้น preview มานับเป็นชิ้นผลิตทั้งหมด
- ตารางกระจก: object/type mark, phase, region/leaf index, glass spec, panel width/height, area, count และข้อมูลชั้นประกอบ; BOQ เก็บทั้ง area ต่อ installed assembly และรายละเอียดชั้นเพื่อไม่คูณเป็น installed area ซ้ำ
- ราวกระจกใช้แต่ละช่วงตามระยะเสา/ช่องว่าง/รูปทรงและระดับบันได ไม่มีการใช้มือจับยาว × สูงราวแทนพื้นที่สุทธิโดยไม่หักส่วนประกอบ
- glass_panel ปัจจุบันเป็นผิวใน geometry; ต้องแยก submesh และใช้ความหนาที่ resolve จึงแสดงกระจกโปร่งกับมือจับทึบได้ถูกต้อง
- การเลือกชนิดกระจกเป็นข้อมูลสเปก ไม่ใช่ผลตรวจรับรองราว: validation เดิมตรวจความสูง/ระยะช่อง ไม่ได้ตรวจความหนากระจก แรง วิธีรองรับหรือพฤติกรรมหลังแตก การตรวจเหล่านี้เป็นขอบเขต engineering เพิ่มต่างหาก

## 7. ลำดับ implementation และ acceptance

| รอบ | งาน | เกณฑ์จบ |
|---|---|---|
| A — ข้อมูลและ UX ประตู/หน้าต่าง | typed glass spec + registry/commands/migration; form conditional, วงกบ/กรอบบาน/วัสดุส่วนบาน; preset ธรรมดา/เทมเปอร์/ลามิเนต/เทมเปอร์ลามิเนต | uPVC ปรากฏในทั้งวงกบและบาน; เลือกทึบแล้วไม่มีช่องกระจกส่วนนั้น; บานเรียบอยู่กลุ่มรูปแบบ; save/reopen/Undo ไม่เสียข้อมูล |
| B — Regions และ representation | บานหลักกับช่องแสงแยก spec; clone/assign; shared resolved geometry; 2D/3D ใช้ actual thickness/appearance | ประตูไม้ + ช่องแสงเทมเปอร์ใสทำได้; เปลี่ยนกระจกช่องบนไม่เปลี่ยนบาน; 6 มม. กับ 10.76 มม. สะท้อนความหนาถูกต้อง; update shared spec cascade |
| C — ราวและการถอดปริมาณ | glass submesh/geometry, วัสดุเสา/มือจับ, glass area/schedule; opening glass takeoff | กระจกต่างวัสดุโลหะ, สโลปตามบันได, net area และ phase ไม่ปน, spec ในตารางตรงกับ 3D |
| D — รายละเอียดและงานกระจกอื่น | per-leaf/mixed custom regions, cabinet adapter, partitions/shower placement, IGU/coating/product catalog | reuse GlassSpecification เดิมได้ ไม่สร้างชุด dropdown/schema กระจกใหม่ต่างความหมาย |

Regression tests เมื่อ implement: laminate total 5+0.76+5=10.76; invalid/negative/NaN thickness rollback; dangling spec reference; independent region edits; legacy unspecified preserved; instance override/cascade; save/reopen/Undo; phased area totals; asymmetric leaves และ inclined railing panes

Browser verification เมื่อ implement: preset ทึบและกระจก, top/bottom independent glass, ข้อความสรุป/previewตรงค่าที่บันทึก, conditional fields คีย์บอร์ดใช้งานได้, ultrawide/จอเตี้ยไม่ล้น; build domain packages และ plan-editor พร้อม test ของ packages ที่แก้

## 8. ผลงานของรอบวางแผนนี้

สร้างเอกสารนี้และเพิ่มลิงก์ใน UX catalog plan เท่านั้น ตรวจแนวทางจากไฟล์ source ที่ระบุในข้อ 1 และเอกสารผู้ผลิตที่อ้างในข้อ 2 ยังไม่มีการเปลี่ยน runtime/schema/commands, UUID หรือ phase; ไม่รัน build/tests สำหรับการแก้ Markdown นี้ และไม่อ้างว่าแผน A–D เสร็จแล้ว

งานถัดไปพร้อมเริ่ม: **รอบ A แล้ว B** ให้การเลือกวัสดุประตู/หน้าต่างและช่องแสงถูกก่อนขยายราว/BOQ
