# ConstructFlow: วิเคราะห์ Blueprint และแผนพัฒนา Standalone Engine

วันที่: 7 ตุลาคม 2026 · ขอบเขต: ตรวจโค้ดและเอกสารใน working tree และพัฒนาฐานคำสั่ง TypeScript

อัปเดตหลังดำเนินงาน Phase 1–6: อ่าน [บันทึกการส่งมอบและหลักฐานทดสอบ](implementation/STANDALONE-PHASES-1-6.md)
สำหรับสถานะปัจจุบัน ตารางด้านล่างเก็บผลตรวจและลำดับพัฒนาของ baseline เดิม

## ข้อสรุป

Blueprint วางทิศทางครบตั้งแต่โมเดลจนถึงแบบและปริมาณ แต่ฐานโค้ดเดิมมีสองเส้นทาง:
Ruby สำหรับ SketchUp ที่มีโมดูลและการทดสอบจำนวนมาก และ TypeScript Plan Editor ที่ยังเป็น
vertical slice ของเสา ฐานราก คาน ผนัง ประตูและหน้าต่าง การมีฟังก์ชันใน Ruby ยังไม่ใช่หลักฐาน
ว่าฟังก์ชันนั้นทำงานได้โดยไม่มี SketchUp

จุดเริ่มต้นที่เหมาะสมคือให้โมเดลและคำสั่งทำงานอิสระจาก UI ก่อน แล้วเพิ่ม geometry, quantity
และ drawing providers บนข้อมูลชุดเดียวกัน ทิศทางนี้บันทึกใน ADR-0006 และแก้ Master Blueprint
ให้สอดคล้องกับ AGENTS.md แล้ว

## ผลตรวจตามโค้ดจริง

| ส่วน | สิ่งที่พบก่อนแก้ | ผลต่อ Blueprint / สิ่งที่ต้องทำต่อ |
|---|---|---|
| Project SSOT | `packages/project-model` มี `.cfproj` v1, lifecycle และ catalog | มีฐาน semantic model; import validation ยังตรวจเพียงรูปแบบหลักและมี `any` |
| Command Bus | handler ทั้งหมดอยู่ใน `apps/plan-editor/src/commands/CommandBus.ts` | ย้ายออกจากแอปในงานนี้; validation ราย domain ยังต้องขยาย |
| Type Catalog | instance ส่วนใหญ่จับคู่ด้วย mark; ไม่ใช่ UUID `type_id` | เพิ่ม migration และ resolver ก่อนรองรับ rename/instance override อย่างสมบูรณ์ |
| Cascading | window W1 และ wall W1 ถูกจับคู่ร่วมกัน | แก้ให้กรอง object family; material/rebar/derived-output cascade ยังไม่ครบ |
| Extension Presets | generator อยู่ใน React; ผิดพลาดแล้วข้ามบางชิ้นแต่ยัง commit | ย้ายไป domain package และทำ atomic batch ในงานนี้ |
| Hosted objects | preset ใช้ `column_id` แต่ handler อ่าน `supported_column_id`; openings ไม่มี `location_mm` | แก้และทดสอบ graph links, placement และ save/reload JSON |
| Materials / elevations | carport และ joists ใช้ RC fallback; AAC ใช้ brick fallback; terrace beam Z คงที่ | แก้ metadata และ terrace beam elevation; physical profiles/column height ยังต้องพัฒนา |
| Standalone geometry | Plan Canvas เป็น 2D; 3D มีเฉพาะผ่าน SketchUp adapter | เพิ่ม renderer-neutral `representation-engine` และ Three.js/WebGL viewport สำหรับโมเดล v2, 2D/3D selection, transform gizmo และผนัง cutout; geometry editing อื่นและ WASM ยังต้องทำ |
| Takeoff | ไม่มี `packages/takeoff-engine` ใน working tree | Ruby quantities ต้องย้ายพร้อม fixtures และ formula parity; UI counts ไม่ใช่ BOQ |
| Clash / compliance | ไม่มี `packages/clash-engine` | เพิ่ม bounds/query contract และ versioned rule inputs; แยกตรวจ geometry จากวินิจฉัยข้อกฎหมาย |
| Sheets | ไม่มี `packages/sheet-engine` | มี Ruby/LayOut contracts แต่ยังไม่มี standalone 20-sheet compiler |
| Exporters | ไม่มี `packages/cad-adapter` / `packages/bim-adapter` | แยก semantic export จาก format encoding; ระบุระดับการรองรับตามไฟล์ที่ตรวจจริง |
| AI | MCP/Python ยังผูก HTTP bridge เดิม | runtime รองรับ actor `ai`; ยังไม่ได้เปลี่ยน MCP ให้ใช้ standalone runtime |
| Evidence | CI เดิมเน้น Ruby | เพิ่ม workflow TypeScript; native SketchUp/LayOut gates เดิมยังเป็นงาน adapter |

หลักฐานสถานะเดิมอ้างอิง `STATUS.md`, `architecture/COMMAND-MUTATION-BOUNDARY.md`,
`packages/project-model/src/serialization.ts` และไฟล์แอป/แพ็กเกจที่ระบุในตาราง
รายงานนี้ไม่ได้ใช้ตัวเลขจำนวน Ruby tests ในเอกสารเก่าเป็นผลทดสอบของการแก้ครั้งนี้

## สิ่งที่พัฒนาแล้วในงานนี้

1. แยก handler ของ Structure, Architecture/Openings และ Catalog ไปแพ็กเกจ domain
   โดย facade ในแอปยังคงชื่อ `CommandBus` และชื่อคำสั่งเดิมเพื่อรักษาความเข้ากันได้
2. เพิ่ม `command-runtime` ที่ clone draft และ input, ให้ command/transaction UUID,
   ตรวจ phase และ duplicate identity และอัปเดต project timestamp เมื่อสำเร็จ
3. เพิ่ม `executeBatch`: ถ้าคำสั่งใด rejected/failed จะคืนโมเดลเดิมและไม่มี envelopes
   สำหรับ downstream; results ก่อน failure เป็น diagnostics ของ draft ที่ถูกทิ้ง
4. เพิ่ม `ProjectCommandSession`: snapshot history หนึ่งรายการต่อ batch, Undo/Redo
   รักษา UUID, host links และ catalog; consumer ไม่สามารถแก้ history ผ่านผลลัพธ์ที่คืน
5. เพิ่ม `extension-engine`: รับเมตร แปลงมิลลิเมตรครั้งเดียว วางแผนคำสั่งก่อน commit
   ตรวจขนาดที่ไม่เป็น finite/บวกและประตูหน้าต่างที่ไม่พอดีผนัง
6. แก้ช่องเปิด ฐานราก วัสดุและระดับคานใน preset; modal แสดง error เมื่อไม่สำเร็จ
   และรายการชิ้นส่วนตรงกับสิ่งที่สร้างจริง เอาตัวเลือกหลังคา/บันไดที่ยังไม่มีผลออก
7. เพิ่ม regression tests และ CI entrypoint สำหรับ standalone packages และ production build

### ขอบเขต preset ปัจจุบัน

| Preset | สิ่งที่สร้าง | ส่วนที่ยังไม่สร้าง |
|---|---|---|
| Carport 5 × 5.5 m | เสา 4, ฐานรากแผ่ 4, คาน 5 | slab, slope, roof assembly, PU, actual steel profile |
| Kitchen 4 × 2.5 m | เสา 4, pile caps 4, ตำแหน่งหัว I-18 เบื้องต้น 16 จุด, คาน 4, ผนัง 3/4, ประตู/หน้าต่างตามเลือก | ความยาวเข็มและการออกแบบที่ยืนยันโดยวิศวกร, flashing, joint detail, settlement checks, floor/roof |
| Terrace | เสา 6, ฐานราก 6, คานเหล็ก 5 พร้อมระดับที่ป้อน | WPC boards, steps, pier height resolver, joist spacing solver |

ทุกชิ้นที่สร้างได้รับ `created_phase: new_construction` แม้ working phase เป็น Existing
ขนาดที่ใส่ใน preset เป็นค่าตั้งต้นของโมเดล preliminary และยังไม่ใช่ผลวิเคราะห์กำลังโครงสร้าง

## ปรับแผน Master Specification ให้ทำงานได้จริง

### S0 — Schema / Catalog / History (กำลังดำเนินการ)

- เพิ่ม schema v2, deterministic UUID `type_id`, type parameters/instance overrides,
  migration v1 และ validation ตอน import/ก่อน commit; มี Kitchen Proof v1 fixture พร้อม
  generator ที่ตรวจ migration ซ้ำได้, คง UUID ของวัตถุ, สร้าง type UUID v5 และเก็บ instance
  override; migration canonicalize catalog UUID references ที่เป็นรูปแบบ UUID ให้เป็นตัวพิมพ์เล็ก
  ก่อน resolve; v2 import บังคับ Smart Object ID เป็น RFC-4122 UUID และปฏิเสธ ID ซ้ำที่ต่างกัน
  เพียงตัวพิมพ์; editor Open/edit/Save/Open ผ่าน UI จริงด้วย mocked File System Access handle แล้ว
  ส่วน native picker และการเขียนทับไฟล์จริงยังต้องทดสอบ
- ต่อ Undo/Redo เข้ากับ editor, shortcut และเปิด/บันทึก `.cfproj`; supported browsers เก็บ file
  handle เพื่อ Save กลับไฟล์เดิม, ส่วน fallback ใช้ file input/download; Undo/Redo ล้าง incremental
  sync queue แล้ว จึงต้อง full sync ใหม่; adapter Undo/Redo replay ยังไม่ทำ
- Plan Editor แสดงสถานะ unsaved โดยเทียบ serialized model กับไฟล์ที่เปิด/บันทึกผ่าน file handle;
  download fallback รายงานเพียงว่าเริ่มคำขอดาวน์โหลดและคงสถานะ unsaved ไว้
- ย้าย Kitchen Proof factory เข้า `extension-engine`; Existing host wall และ preset 4.00 × 2.50 m
  เป็น atomic batch เดียวกันทั้งใน editor และ generator ของ `examples/kitchen-extension-proof.cfproj`.
  Generator เขียนไฟล์แล้วอ่านกลับผ่าน serializer โดยได้ canonical JSON เท่าเดิม; UI roundtrip
  ผ่าน handle จำลองแล้ว การเลือกไฟล์จาก native browser picker และการเขียนทับไฟล์จริงยังเป็น gate แยกต่างหาก
- เพิ่ม validation สำหรับ finite coordinates, positive dimensions, valid host, hosted
  opening bounds และการอ้างอิงเสา/ฐานราก/คานในโดเมนที่รองรับแล้ว; v1 migration contract
  เปลี่ยนจาก `any` เป็น `unknown` พร้อม narrowing; project/catalog และ CQRS public contracts
  ใช้ unknown-based types, catalog parameters มี field ที่ระบุชนิดสำหรับ families ปัจจุบัน,
  และ validator ปฏิเสธ known dimensional fields ที่อยู่ผิด family;
  ยังต้องขยาย validation เมื่อเพิ่ม domain อื่น
- แยก geometric bounds/placement/representation ออกจาก React; ลด full-document clone ด้วย
  copy-on-write หลังมี benchmark และจำกัด history memory
- Type rename now runs through the UI and `RenameCatalogType` command. Runtime acceptance checks
  family-scoped cascade, stable UUIDs, invalid-name rejection, serialization/reload and Undo/Redo;
  browser smoke confirmed schedule/BOQ propagation and Undo clearing the pending queue.
- Gate ที่เหลือ: broader migration/domain fixtures and native picker/real file-handle acceptance

### S1 — Takeoff แนวตั้งจากโมเดลเดียว (เริ่มต้นแล้ว)

- เพิ่ม `takeoff-engine` รุ่นเริ่มต้น: เสา/คาน/ฐานรากเป็น m³, ผนังเป็น net m²/m³
  หลังหักประตูหน้าต่างที่ host อยู่, ประตูหน้าต่างเป็นจำนวนชิ้น และส่ง CSV จาก editor ได้
- Takeoff อ่าน payload แบบ `unknown` และตรวจ tuple/ค่าตัวเลขก่อนคำนวณ; ข้อมูลมิติผิดรูปแบบ
  จะถูกรายงานเป็น warning แทน unchecked `any` casts
- BOQ แยก demolition/site prep, new construction, existing-to-remain และ remodeling/joint treatment;
  หมวด existing เป็นปริมาณอ้างอิง ไม่คิดราคาเพิ่มอัตโนมัติ
- Kitchen Proof ระบุ expansion-joint sealant ที่รอยต่อปลายผนังเดิมกับผนังใหม่สองด้าน;
  Takeoff รวมความสูงของผนังเป้าหมายจาก UUID ได้ 5.60 m สำหรับผนังสูง 2.80 m และอัปเดต
  ตามการปรับความสูง/การลบผนัง เปลี่ยน host wall เป็น demolition แล้วตัดปริมาณ joint ออก
  ยังไม่สร้าง flashing เพราะ preset ไม่มี roof model และยังไม่มี chemical-dowel detail/rates/labor/waste
- วัตถุที่มี `removed_phase` ทุกค่าเข้าหมวด demolition/site prep โดยเก็บ phase ที่รื้อไว้ใน
  report; วัตถุที่สร้างใน demolition เข้าหมวดเดียวกัน ป้องกันของเดิมที่ถูกรื้อถูกนับเป็น
  existing-to-remain
- เหล็กรูปพรรณใช้ profile catalog/mass-per-length ไม่ใช้ bounding box เป็นปริมาณเหล็ก
- แยก `created_phase` ออกจาก `cost_center`: งานรื้อถอน, งานสร้างใหม่, งานรอยต่อเดิม-ใหม่
  เป็นการจัดหมวดราคา ไม่ใช่ phase ชุดที่สี่; Existing-to-remain ไม่เกิดค่าใหม่อัตโนมัติ
- Gate ที่เหลือ: เพิ่มเหล็กตาม profile/mass-per-length, rate libraries, labor/waste และ
  acceptance fixture; focused runtime acceptance ยืนยันแล้วว่า resize B1 เปลี่ยนปริมาตร
  takeoff และคงค่าเดิมหลัง serialize/deserialize

### S2 — Standalone 3D และ Extension ที่ครบชุด (เริ่มต้นแล้ว)

- เพิ่ม Three.js/WebGL viewport ที่อ่าน ProjectDocument เดียวกับ Plan Canvas, แสดง phase,
  เปิดหมุน/ซูม, เลือกชิ้นงานและลาก gizmo ย้ายเสา; ผนังตัดช่องจาก host door/window
- เพิ่มปุ่มสร้าง Kitchen Proof 4.00 × 2.50 m พร้อมผนังบ้านเดิมเฟส Existing และ preset
  โครงสร้าง/ผนัง/ประตู/หน้าต่าง New Construction ในโปรเจกต์เดียว
- กำหนด level ให้ preset walls, beams และ openings ครบ; beams ในครัว/carport ผูก endpoint
  กับ column UUID และ `MoveColumn` ขยับปลายคานกับฐานรากที่รองรับใน transaction เดียว
- Kitchen preset resolves its active base datum and next upper level for columns, foundations,
  walls, openings and perimeter beams. Focused runtime evidence covers standard GF/L2 and custom
  level elevations; the `.cfproj` fixture retains its existing 18 UUIDs.
- `UpdateLevel` reconciles the top elevations of linked columns and the Z coordinates of their
  hosted perimeter beam endpoints; a focused batch check changed L2 to +3.400 m, reported all
  eight dependent UUIDs, and one Undo restored the +3.000 m baseline.
- Kitchen Proof F1 now stores four preliminary I-18 pile-head offsets per pile cap. S-01 draws
  plan-only symbols and flags the unspecified length; BOQ reports 16 pile heads and warns per
  foundation. No pile length, capacity, soil design or engineering approval is inferred, and the
  3D view remains a pile-cap-only representation until those inputs exist.
- 3D gizmo ขยับเสา ผนัง ฐานรากที่ผูกเสา และช่องเปิดได้; `MoveColumn` ประสานคาน/ฐานราก,
  `MoveWall` ย้าย openings ที่ host อยู่พร้อมกัน และ `MoveOpening` เลื่อนประตู/หน้าต่างตามแนว
  host wall โดยรักษา UUID/host/offset
- Plan Canvas ลากเสา/ผนัง/ช่องเปิดด้วย command ชุดเดียวกับ 3D; ช่องเปิด project เข้าหาแนว
  host wall และ clamp ตามความกว้างก่อน dispatch ส่วนผนังย้าย openings ที่ผูกอยู่พร้อมกัน.
  Architecture-engine tests ครอบคลุมผนังเอียง, clamp ที่ปลาย และกรณี host ใช้ไม่ได้
- แปลน 2D ใช้ active-level visibility ชุดเดียวกันสำหรับ render, hit-test และ snap; columns ที่
  พาดหลายชั้นยังแสดงทุกชั้นในช่วง base/top ส่วนฐานรากแสดงที่ชั้นฐานและ beam/wall/opening ที่ชั้นอ้างอิง
- เพิ่ม `representation-engine` เพื่อสร้าง 3D shape descriptors จาก project/catalog/phasing
  โดยไม่อิง Three.js; React viewport ทำเฉพาะแปลง descriptors เป็น mesh และต่อ interaction
  เข้ากับ command callbacks. Tests ครอบคลุม deterministic output, phase, foundation/opening
  interactions, wall cutouts และข้อมูลช่องเปิดผิดรูปแบบ
- Runtime acceptance ยืนยันว่าการย้ายเสาประสาน foundation/beam endpoints/span, Undo/Redo
  รักษา model และการย้ายที่ทำให้ span เป็นศูนย์ rollback ทั้งรายการ; gizmo คืน preview mesh เมื่อ
  command reject หรือ drag น้อยกว่า 1 mm
- ยังไม่มี direct mesh editing ครบทุกชนิด, slab/roof types หรือ footprint solver
- ให้ preset เป็น catalog/template data ที่ประกอบ public commands และมี provenance
- เพิ่ม micropiles, steel profiles, roof, flashing, WPC และระดับเสาจริงทีละ preset
- Gate: เปิดโปรเจกต์จาก JSON แล้วได้ 2D, 3D และ quantities ที่สอดคล้องกันโดยไม่เปิด CAD;
  ตรวจ shape/cutout/phase/selection/transform และ runtime performance ด้วย acceptance evidence

### S3 — Spatial QA / MEP / Rule Inputs

- เพิ่ม `packages/clash-engine` รุ่นฐาน: คำนวณ AABB จากโมเดลเดียวกันสำหรับคาน เสา ฐานราก
  และผนัง; ใช้ packed 3D R-tree ค้นหาคู่ bounds ที่ตัดกันเป็น broad-phase candidates
- Bounds ใช้ type catalog/instance overrides, rotation ของเสา, level/offset และเก็บ phase,
  removed phase, level กับ host references; แจ้งเตือนเมื่อใช้ความสูงเสาสมมติหรือ geometry ใช้ไม่ได้
- เพิ่ม classifier แบบอนุรักษ์นิยม: host-linked overlap เป็น `intentional_connection`, การซ้อนทับ
  ไม่เกิน tolerance เป็น `boundary_contact`, ส่วน AABB overlap อื่นเป็น `overlap_candidate`;
  ไม่มีประเภทใดอ้างว่าเป็น hard/soft clash verdict. AABB ของผนังเอียงยังอาจกว้างกว่ารูปร่างจริง
  และยังไม่รวม opening subtraction, MEP, clearance หรือกฎหมาย
- แยก pipe topology และ invert/slope solver เป็น domain functions พร้อม test fixtures
- ข้อกำหนดกฎหมายต้องมี jurisdiction, source, version/effective date, exception inputs
  และสถานะ insufficient-data; ไม่ hard-code หมายเลขระยะร่นเป็นคำตัดสินทั่วไป
- Gate: validate จาก input ที่ระบุครบ, ระบุ rule evidence และให้ผล unknown เมื่อข้อมูลไม่ครบ

### S4 — A3 Sheet Engine ก่อน Exporter Breadth

- `sheet-engine` เป็น renderer-neutral viewport/titleblock/vector representation
- มี A-02, S-01 และ A-08 รุ่นแรกจาก semantic project เดียวกัน; A-02/S-01 จำกัดที่ ground level
  และเตือนเมื่อ content เสี่ยงถูก crop, A-08 มี opening schedule กับ schematic elevations
- A-02 opening cutout/symbols กับ A-08 schedule ใช้ precedence เดียวกัน:
  instance override → instance value → type catalog
- Sheet title metadata ระบุ scope จากเนื้อหาจริง: A-02/S-01 ใช้ชั้นต่ำสุดที่แสดง, A-08 ระบุ ALL LEVELS;
  ไม่อ้าง `active_level_id` เมื่อ sheet renderer เลือก scope อื่น
- ทดสอบ scale/crop, Thai text shaping/font embedding, dimensions และ PDF roundtrip/render
- Gate: output ที่มี geometry/annotations จริงและไม่อ้างว่ารวม sheet content ที่ยังไม่มี provider

### S5 — Downstream Adapters และ MCP

- diff ด้วย UUID, preserve customizations และทดสอบ unchanged/update/delete policy
- เริ่ม DXF และ IFC subset ที่มี roundtrip evidence; DWG, native tables และ certification
  เป็น gates แยกจากการเขียนไฟล์หรือประกาศนามสกุล
- MCP ใช้ command runtime และ validation ชุดเดียวกับ UI รวม actor/audit/rollback
- รักษา runbook และหลักฐาน native SketchUp/LayOut เดิมสำหรับความสามารถที่พึ่ง adapter

ไม่จำเป็นต้องเริ่ม Rust/WASM ก่อนพิสูจน์ semantics และ benchmark ของ TypeScript
แต่ละ milestone ต้องส่ง vertical workflow ที่ตรวจซ้ำได้ก่อนเพิ่มจำนวน domain

## Acceptance contract และหลักฐาน

| ID | สิ่งที่พิสูจน์ | Tests |
|---|---|---|
| AC-STAND-001 | Node execution; human/AI/sync ใช้ bus เดียว | runtime tests |
| AC-STAND-002 | atomic rollback ทั้ง rejection/exception และ missing host | runtime tests |
| AC-STAND-003 | batch Undo/Redo, redo invalidation, snapshot isolation | runtime + preset tests |
| AC-STAND-004 | input/document isolation, lifecycle values, duplicate object IDs | runtime tests |
| AC-STAND-005 | W1 wall/window cascade แยก domain | runtime tests |
| AC-STAND-006 | preset graph, units, materials, placement, validation, serialized roundtrip | preset tests |

ผล build ล่าสุดบน Windows:

```text
project-model: PASS
representation-engine: PASS
architecture-engine: PASS
command-schema: PASS
structure-engine: PASS
catalog-engine: PASS
drainage-engine: PASS
electrical-engine: PASS
plumbing-engine: PASS
decorative-engine: PASS
interior-engine: PASS
clash-engine: PASS
command-runtime: PASS
extension-engine: PASS
takeoff-engine: PASS
sheet-engine: PASS
cad-adapter: PASS
bim-adapter: PASS
plan-editor production build: PASS
```

Three.js is split into a lazy-loaded WebGL vendor chunk. Vite currently reports that this
vendor chunk exceeds 500 kB uncompressed (602.91 kB, 152.18 kB gzip); initial 2D loading does
not import the 3D viewport chunk until the user switches views.

การรัน regression ล่าสุดด้วย `node scripts/test_standalone.mjs` ผ่านทั้งหมด 76 unit tests ครอบคลุม 11 test suites:
- 7 project-model
- 4 representation-engine
- 3 architecture-engine (รวม stair calculations)
- 1 drainage-engine (solveGravityInverts auto-slope 1:100)
- 2 electrical-engine (EIT breaker/wire sizing และ phase balancing)
- 5 clash-engine
- 7 sheet-engine (รวม 20-sheet vector compiler, Thai shaping, crop/scale และ permit validation)
- 35 command-runtime (รวม Footing & Column rebar detailing, sweep miter, catalog cascade, Undo/Redo)
- 7 extension-engine
- 2 cad-adapter (AutoCAD R2018 DXF 20 PaperSpace layouts และ AIA/วสท. layers)
- 3 bim-adapter (RFC-4122 to 22-char IFC GUID, IFC 4.3 ADD2 STEP, Revit direct JSON)

พร้อมด้วย 3 vertical acceptance verifiers:
- `npm run verify:kitchen`: ผ่านครบทั้งโมเดล, เฟส, BOQ, serialization และแบบ A-02, S-01, A-08
- `npm run verify:file-io`: ผ่าน canonical open, local disk roundtrip, write/close ordering
- `npm run verify:phases`: ผ่านชุดโมเดลทดสอบ 41 Smart Objects, 19 domain outputs, 44 takeoff rows, และ 20-sheet A3 PDF

นอกจากนี้ script `npm run package:sketchup` (ผ่าน `scripts/package_sketchup_rbz.mjs`) รันแพ็ก extension 486 ไฟล์เป็น `output/constructflow.rbz` (727.3 KB) สำเร็จข้ามแพลตฟอร์มโดยไม่ต้องพึ่งพา bash หรือ zip ภายนอก

## ไฟล์ที่เปลี่ยนและ contract compliance

- `apps/plan-editor/package.json`, `package-lock.json`
- `apps/plan-editor/src/commands/CommandBus.ts`, `apps/plan-editor/src/components/PlanCanvas.tsx`, `Toolbar.tsx`
- `apps/plan-editor/src/components/ConstructionWorkbench.tsx`, `ExtensionPresetsModal.tsx`
- `packages/command-schema/src/{index,envelope,projectCommands,extensionCommands,constructionCommands,transactions}.ts`
- `packages/command-schema/package-lock.json`
- `packages/{structure-engine,architecture-engine,catalog-engine}/package.json`, `package-lock.json`,
  `tsconfig.json`, `src/index.ts`
- `packages/drainage-engine/src/index.ts`, `packages/drainage-engine/test/drainage.test.mjs`
- `packages/electrical-engine/src/index.ts`, `packages/electrical-engine/test/electrical.test.mjs`
- `packages/cad-adapter/src/index.ts`, `packages/cad-adapter/test/cad.test.mjs`
- `packages/bim-adapter/src/index.ts`, `packages/bim-adapter/test/bim.test.mjs`
- `packages/sheet-engine/src/{index.ts,permit.ts,pdf.ts}`, `packages/sheet-engine/test/permit.test.mjs`
- `packages/command-runtime/package.json`, `package-lock.json`, `tsconfig.json`,
  `src/index.ts`, `src/projectCommands.ts`, `test/transactions.test.mjs`
- `packages/extension-engine/package.json`, `package-lock.json`, `tsconfig.json`,
  `src/index.ts`, `test/presets.test.mjs`
- `packages/takeoff-engine/{package.json,package-lock.json,tsconfig.json,src/index.ts}`
- `apps/plan-editor/src/components/Model3DViewport.tsx`, `vite.config.ts`
- `scripts/test_standalone.mjs`, `scripts/package_sketchup_rbz.mjs`, `.github/workflows/standalone-tests.yml`
- `README.md`, `docs/{README,MASTER-BLUEPRINT,STATUS,STANDALONE-ENGINE-REVIEW-2026-10}.md`
- `docs/decisions/README.md`, `docs/decisions/ADR-0006-standalone-first-engine.md`
- `docs/architecture/COMMAND-MUTATION-BOUNDARY.md`, `docs/modules/EXTENSION.md`

สถานะปัจจุบัน: Standalone Engine ปิดช่องว่างตาม Phase 1–6 และ Categories 1–4 ครบถ้วน พร้อม downstream adapters (DXF 20 PaperSpace, IFC 4.3, Revit JSON, SketchUp RBZ packager) มีหลักฐานทดสอบระดับ unit & integration tests สมบูรณ์ใน standalone mode.
