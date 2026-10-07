# ConstructFlow — Feature Planning Audit

วันที่ตรวจ: 7 ตุลาคม 2026

สถานะ: ผล audit เอกสารและข้อเสนอ backlog; ไม่ใช่การรับรอง implementation หรือการตรวจความถูกต้องของกฎหมาย

## ข้อสรุป

**ยังไม่ครบในระดับพร้อมพัฒนาทุกฟีเจอร์ตาม Standalone Architectural & BIM Engine Master Specification**

หมวดงานหลักมีเจ้าของโมดูลและแผนรองรับเกือบทั้งหมดแล้ว และหลายโมดูลมี commands, QA และ acceptance criteria ที่ใช้ต่อได้ แต่รายละเอียดจาก Master Specification บางส่วนยังอยู่เพียงใน `AGENTS.md` หรือเอกสาร exporters ไม่ได้ลงถึง domain contracts, workflows และเกณฑ์รับงาน ชื่อ persisted fields หลายแบบยังต้องระบุการแปลงให้ชัด ส่วนข้อขัดแย้งทิศทางใน F01 แก้แล้วตามคำสั่งผู้ใช้หลัง audit

อัปเดตหลัง audit (2026-10-07): F01 ปิดด้านทิศทางและลำดับงานแล้ว; F13 แก้ส่วน acceptance/test platform แล้ว แต่ performance/evidence-date work ยังเปิดอยู่ Findings อื่นยังไม่ถือว่าปิดจากการเปลี่ยนแผนนี้

ควรเติมรายละเอียดและทำเอกสารให้ตรงกันก่อนเริ่มแต่ละ feature track ไม่จำเป็นต้องขยายรายการฟีเจอร์ใหม่หรือวางแผนทุกโมดูลใหม่ทั้งหมด ฐาน standalone ที่มีแผนและ acceptance ชัดสามารถพัฒนาต่อได้

## ขอบเขตและวิธีตรวจ

- ใช้ [AGENTS.md](../AGENTS.md) เป็นรายการความต้องการ Master Specification ที่ผู้ใช้ให้ตรวจ และ [ADR-0006](decisions/ADR-0006-standalone-first-engine.md) เป็นทิศทาง standalone-first
- ทำ inventory ของ Markdown ใต้ `docs/` จำนวน **136 ไฟล์ก่อนเพิ่มรายงานนี้** รวมไฟล์ใน `docs/modules/` 25 ไฟล์; จำนวนไฟล์ไม่ใช่คะแนนความครบ
- อ่านเจาะลึก Master Blueprint, roadmaps, traceability, object/workflow registries, governance, acceptance/test contracts, standalone review และ module specs ที่เกี่ยวกับความต้องการทั้งหก domain
- ค้นหาคำและแนวคิดเฉพาะของ Master Specification ข้าม Markdown ทั้งชุด แล้วตรวจบริบทของรายการที่พบ การไม่มี keyword เพียงอย่างเดียวไม่ถือเป็นหลักฐานว่าฟีเจอร์หาย
- ประเมิน **ความครบของแผน** แยกจาก **ความครบของโค้ด** และใช้ `STATUS.md`/implementation review เป็นหลักฐานสถานะที่เอกสารรายงานเท่านั้น ไม่ได้รันทดสอบโปรแกรมใหม่ในการ audit นี้
- ไม่ตรวจยืนยันข้อกฎหมาย มาตรฐานวิศวกรรม หรือความสามารถปัจจุบันของ SDK ภายนอก ตัวเลขทางวิศวกรรมใน Master Specification ยังต้องมี rule-source และ applicability ก่อนนำไปทำ validator

เกณฑ์ความพร้อมใช้รายการใน [docs/README.md](README.md): owner, object/schema, commands/validation, events, hosts/connectors, phase/level, LOD, quantities, drawings, QA, catalog และ acceptance/tests ที่เกี่ยวข้อง

## ตารางความครอบคลุม

สถานะ **มีฐานแผน** หมายถึงมี contract/workflow/acceptance รองรับส่วนสำคัญแล้ว ไม่ได้หมายถึง implemented หรือครบทุกกรณี; **บางส่วน** หมายถึงยังขาดรายละเอียดเฉพาะ Master; **ขาดแผนเฉพาะ** หมายถึงพบความต้องการแต่ยังไม่พบชุดข้อกำหนด domain ที่เพียงพอในเอกสารที่ตรวจ

| ความต้องการจาก Master | สถานะแผน | หลักฐานหลัก / ส่วนที่ต้องเติม |
|---|---|---|
| Standalone SSOT และโมดูลแยกจาก UI | มีฐานแผน; direction aligned | ADR-0006, CORE-CONTRACTS และ R0 standalone; native host gates แยกเป็น adapter acceptance |
| Human/AI Command Bus, atomic history, Undo/Redo | มีฐานแผน | CORE-CONTRACTS, COMMAND-MUTATION-BOUNDARY, standalone review; ต้องแยกขอบเขต local transaction กับ output/adapter jobs |
| Persistent UUID, lifecycle และ migrations | มีฐานแผน แต่ mapping ไม่ครบ | SMART-OBJECT-SCHEMA, PHASE-LEVEL-REVISION, PERSISTENCE-MIGRATION ใช้รูปแบบ envelope/field ต่างกัน |
| Meter UI / millimetre storage | มีฐานแผน | AGENTS, DATA-CONVENTIONS และ module parameters; ต้องใช้ contract เดียวกันใน adapters |
| Type/instance, cascading, catalog versions | มีฐานแผน | LIBRARY-CATALOG, DOOR-WINDOW, standalone S0; cascade ทุก domain ยังต้องมี acceptance matrix |
| โฉนด, หลักเขต, bearing และหน่วยที่ดินไทย | บางส่วน | SITE มี boundary/survey; ยังไม่มี deed input/closure/area/unit-conversion acceptance เฉพาะ |
| ระยะร่น, FAR/OSR, zoning และพื้นที่น้ำซึม | ขาดแผนเฉพาะ | AGENTS ระบุเป้าหมาย; S3 มี rule-input policy และ MCP มีชื่อ tool แต่ SITE ยังไม่มี legal rules contract |
| เสา/คาน/ฐานราก/เข็ม/เหล็กและ connections | มีฐานแผน | STRUCTURE มี objects/commands/QA/AC; ต้องเติมชนิด assembly และ construction details จาก Master |
| Drop beam, precast/hollow-core/topping, mesh | บางส่วน | STRUCTURE แบ่ง slab-on-ground/suspended และ rebar metadata; ยังไม่ละเอียดถึงแต่ละระบบที่ Master ระบุ |
| Rebar BBS, laps, hooks, cover, weight | บางส่วน | STRUCTURE AC-STR-005 และ QUANTITY-CONTRACT มี BBS/weight; ยังไม่ระบุสูตร/ข้อยกเว้น/fixtures ราย shape |
| Roof footprint, per-edge slope, hip/gable solver | บางส่วน | ROOF และ ROADMAP R4 มี forms/topology/edge intent; ยังขาด solver contract และ acceptance ตาม form/footprint |
| Fascia/soffit/flashing/gutters/downpipes | มีฐานแผน | ROOF และชุด ROOF-RAINWATER-* มี contracts/QA/AC ค่อนข้างละเอียด |
| Sweep moldings และ compound miter | บางส่วน | DECORATIVE มี profile/path และ AC-DEC-002; ยังไม่ระบุ corner/closed-loop/compound-miter behavior |
| Arches, infill panels, swing handing, cutouts | มีฐานแผน / บางส่วน | OPENING, DOOR-WINDOW มี hosted profiles/panels; ต้องระบุ mapping สี่ handing states และ clearance fixtures |
| Wainscot/slats/cladding | มีฐานแผน | DECORATIVE มี distribution/opening avoidance/quantity/AC |
| Tile origin/rotation/cuts/borders/slope | มีฐานแผน | SURFACE มี parameters, quantities, drawings และ QA; bathroom package ยังต้องประกอบข้าม domain |
| Stair / landing / nosing / railing builder | ขาดแผนเฉพาะ | AGENTS ระบุ builder; OBJECT-REGISTRY มี Step/Ramp และ library มี railing แต่ ARCHITECTURE spec ไม่ได้กำหนด builder/owner/commands/AC |
| Parametric joinery และ materials ราย part | มีฐานแผน | INTERIOR มี hierarchy, carcass, fittings, hardware, part materials, cut-list และ AC |
| Concealed LED profiles + driver watts | บางส่วน | ELECTRICAL มี strip LED/host/wattage และ Interior มี LED service requirement; ยังไม่มี sizing/provider contract ของ driver |
| Cold-water supply และ fixture connectors | มีฐานแผน | PLUMBING มี semantic routes/valves/pump/tank connection และ acceptance |
| 3-valve pump bypass / check valve / isometric | บางส่วน | AGENTS ระบุ assembly; PLUMBING มี primitive objects แต่ schematic เลื่อนไป later phase และไม่มี bypass topology/AC |
| Waste/soil/IL/manholes และ rainwater routing | มีฐานแผน | DRAINAGE และ specs การแก้ route/QA/roof connection มีรายละเอียดมาก |
| Vent/P-trap และ septic PE sizing | ขาดแผนเฉพาะ | ROADMAP R7 มีคำว่า vent แต่จัดไว้ใต้ Plumbing; DRAINAGE ไม่มี vent/septic topology/commands/formula acceptance |
| Bathroom drop/slope/waterproof/rough-in/detail | ขาดแผน package เฉพาะ | หลาย primitive อยู่คนละ domain; ยังไม่มี workflow/ownership/AC สำหรับ A-09 ทั้งชุด |
| Lights/switches/outlets/logical circuits | มีฐานแผน | ELECTRICAL มี persisted definitions, commands และ AC |
| Multi-way controls, grounding, CU/MDB, SLD/load schedule | บางส่วน | ELECTRICAL panel/load เป็น later detail; exporter ระบุ load table แต่ยังไม่ลงถึง domain design/output contract |
| Phased BOQ และราคา/labor/waste | มีฐานแผน / บางส่วน | QUANTITY-COSTING มี rates/snapshots; S1 แยก cost centers แล้ว แต่ authoritative quantity envelope ยังไม่ระบุ cost_center |
| Native 20-sheet A3 PDF/SVG compiler | บางส่วน | AGENTS มีดัชนี 20 แผ่น, DRAWING มี platform contract; S4 มีแผนสามแผ่นแรก ยังไม่มี per-sheet acceptance ครบ 20 |
| UUID sync, DXF/DWG, IFC/Revit, MCP | มีฐานแผน / บางส่วน | DOWNSTREAM-ADAPTERS และ S5 มี direction/verification; backend, subset, conflicts และ release gates ยังต้องลงรายละเอียด |

## Findings ตามลำดับความสำคัญ

### F01 — Resolved: Roadmap และ baseline ใช้ standalone-first

**ผลแก้ตามคำสั่งผู้ใช้:** [ROADMAP.md](ROADMAP.md) ใช้ R0 Standalone Project Reliability; [PRODUCTION-ROADMAP.md](roadmap/PRODUCTION-ROADMAP.md) ลบแผนเดิมและชี้ roadmap หลัก; implementation entrypoint และ modeling upgrade plan ใช้ standalone workbench/command runtime ตรงกับ Master Blueprint/ADR-0006

**ขอบเขต:** canonical persistence และ core acceptance/test contracts ใช้ `.cfproj`; เอกสาร Ruby host/audit/cleanup และ F0–F3 ถูกระบุเป็น optional adapter scope การปิด finding นี้เป็นผลแก้เอกสาร ไม่ใช่การประกาศว่าทุก standalone feature implemented

**ตรวจรับ:** roadmap หลักเชื่อม S0–S5 กับ R tracks และไม่มีเงื่อนไขให้ standalone release ต้องผ่าน external application gate ก่อน

### F02 — P0: Canonical identity/lifecycle ไม่มีตาราง mapping ที่จบครบ

**หลักฐาน:** [SMART-OBJECT-SCHEMA.md](architecture/SMART-OBJECT-SCHEMA.md) แสดง `id: cf_<uuid>` และ `phase.created/demolished`; [Master Blueprint](MASTER-BLUEPRINT.md) ใช้ `created_phase + demolished_phase`; [PHASE-LEVEL-REVISION.md](architecture/PHASE-LEVEL-REVISION.md) และ [CORE-CONTRACTS.md](architecture/CORE-CONTRACTS.md) ใช้ `created_phase + removed_phase`; [SMART-OBJECT-SOURCE-OF-TRUTH.md](architecture/SMART-OBJECT-SOURCE-OF-TRUTH.md) ยก `cf_obj_...`; AGENTS กำหนด RFC-4122 UUID

รูปแบบ logical envelope กับ native storage สามารถต่างกันได้ แต่ต้องบอกว่ารูปแบบใด canonical, legacy หรือ derived และแปลงกันอย่างไร ปัจจุบันยังไม่มี mapping ครบข้าม `.cfproj`, Ruby และ exporters

**สิ่งที่ต้องทำ:** ตาราง field/identity mappings พร้อม schema version, legacy migration, UUID normalization, type UUID vs display mark และ roundtrip acceptance; รักษาความหมาย lifecycle เดิมโดยไม่เปลี่ยน history เพียงเพื่อให้ชื่อเหมือนกัน

### F03 — P1: Legal/deed engine ยังเป็นเป้าหมายมากกว่า implementation specification

**หลักฐาน:** [SITE.md](modules/SITE.md) มี boundary, benchmark, survey และ AC-SITE-001–004 แต่ไม่มี commands/AC สำหรับ deed bearings, Thai land units, FAR/OSR/zoning/consent; S3 ใน [standalone review](STANDALONE-ENGINE-REVIEW-2026-10.md) วาง rule-source policy และ exporter/MCP มี `cf_validate_compliance`

**สิ่งที่ต้องเติม:** input ของ parcel/deed/road/building/neighbor consent, closure tolerance, jurisdiction, rule source/version/effective date, applicability/exceptions, evidence ต่อ finding และผล `pass/fail/insufficient_data/not_applicable`; ระบุ owner ระหว่าง Site/legal validation กับ generic spatial infrastructure พร้อม fixtures

ค่าจาก Master ไม่ควรถูกนำไปเป็นคำตัดสินทั่วไปโดยไม่มี applicability contract การ audit นี้ไม่ได้ยืนยันค่ากฎหมายเหล่านั้น

### F04 — P1: มีดัชนี 20 แผ่น แต่ยังไม่มี specification รายแผ่นครบ

**หลักฐาน:** AGENTS ระบุ A-01–E-02; [DRAWING.md](modules/DRAWING.md) และ [DRAWING-STANDARD.md](architecture/DRAWING-STANDARD.md) ระบุ drawing families/dirty/issue behavior; [DRAWING-ISSUE-SETS.md](architecture/DRAWING-ISSUE-SETS.md) เป็น foundation และยังไม่รวม cover/index/automatic numbering; standalone S4 เริ่ม A-02/S-01/A-08

**สิ่งที่ต้องเติม:** matrix 20 แผ่นที่ระบุ content provider, inputs, level/phase filter, scales/crops, dimensions/tags/schedules, prerequisites, applicability, missing-data behavior และ acceptance ต่อแผ่น รวม PDF multi-page, Thai fonts/shaping, clipping และ print scale verification

ต้องกำหนด policy ของแผ่นที่ไม่เกี่ยวข้องกับโครงการ เช่น upper floor: omit, N/A หรือ alternate content โดยแยก working issue set จากชุดส่งมอบเป้าหมาย การมี 20 หน้าไม่ใช่หลักฐานว่า content ครบ

### F05 — P1: ขาดแผนเฉพาะของบันไดและราว

**หลักฐาน:** AGENTS มี Stair & Railing Profile Builder; [OBJECT-REGISTRY.md](OBJECT-REGISTRY.md) มี Step/Ramp; library ยก railing เป็น parametric asset แต่ [ARCHITECTURE.md](modules/ARCHITECTURE.md) Owns/Commands ไม่ระบุ Stair/Landing/Railing builder

**สิ่งที่ต้องเติม:** ตัดสิน owner ของ semantic Stair/Railing และ structural stair members; flight/landing/riser/tread/nosing/path/profile/level parameters, edit/regeneration commands, clearance/geometry QA, quantities และ plan/section/detail acceptance รวมไม่อ้าง engineering approval จาก preset

### F06 — P1: MEP primitives ยังไม่ครอบคลุมระบบเฉพาะที่ Master สัญญา

**หลักฐาน:** [PLUMBING.md](modules/PLUMBING.md) มี valve/pump/tank connection แต่ schematic อยู่ later phase; [DRAINAGE.md](modules/DRAINAGE.md) ไม่มี vent/septic เป็น owned objects/connector systems; [ROADMAP.md](ROADMAP.md) R7 วาง waste/soil/vent ใต้ Plumbing แม้ module boundary ให้ gravity systems อยู่ Drainage

**สิ่งที่ต้องเติม:** owner/network contract สำหรับ vent/P-trap, septic PE inputs และ capacity catalog/formula versions; pump bypass assembly พร้อม port directions/valve states/check valve/MEP QA; water-supply isometric และ M-01/M-02 acceptance การมี pump กับ valve แยกชิ้นยังไม่ใช่แผน bypass assembly

### F07 — P1: BBS และ structural assemblies ต้องมีสูตรและ reference fixtures

**หลักฐาน:** [STRUCTURE.md](modules/STRUCTURE.md) มี shape/bend/lap/cover metadata และ AC-STR-005; [QUANTITY-CONTRACT.md](architecture/QUANTITY-CONTRACT.md) อนุญาต BBS จาก semantic reinforcement แต่ยังไม่อธิบาย bar-shape calculation contract, zoning ของ stirrup spacing, bend allowances, rounding และ partial data

**สิ่งที่ต้องเติม:** rebar shape/grade catalogs, lap/hook/cover applicability, length/mass formulas, duplicate bar counting, units/tolerances และ expected BBS fixtures; แยก Drop Beam, Precast/Hollow Core/Topping/Mesh/SOG เป็น type/assembly cases พร้อม schedules

ต้องระบุว่าค่าที่เป็น preset/reference กับค่าที่ผ่านการออกแบบวิศวกรรมมีสถานะต่างกัน ไม่ทำให้สูตรตัวอย่างจาก Master กลายเป็นข้อสรุปกำลังโครงสร้าง

### F08 — P1: Full preset assembly และ bathroom package ยังไม่มี definition of complete แบบข้าม domain

**หลักฐาน:** [EXTENSION.md](modules/EXTENSION.md) ยอมรับว่า standalone preset เป็น partial port; [WORKFLOW-REGISTRY.md](WORKFLOW-REGISTRY.md) W06/W07 วาง happy-path; standalone review แยกของที่สร้างกับของที่ยังไม่สร้าง ส่วน bathroom มี primitive กระจายแต่ยังไม่มี package acceptance ตรง A-09

**สิ่งที่ต้องเติม:** bill of generated objects/relations ต่อ Carport/Kitchen/WPC Terrace, support/levels/joint/settlement-isolation inputs, host-reconcile policy หลังแก้รายชิ้น และ acceptance ของ complete assembly; bathroom ระบุ owner ของ drop slab, slope/drain, waterproof zone, tile cuts และ fixture rough-in พร้อม drawings/quantity

แยก **atomic generation command** ที่ undo หนึ่งครั้งออกจาก **construction publication workflow** ซึ่ง [EXTENSION-CONSTRUCTION-WORKFLOW.md](architecture/EXTENSION-CONSTRUCTION-WORKFLOW.md) ระบุหลาย service/transaction boundaries; ต้องเขียน failure/retry/currentness policy โดยไม่เรียกทั้งสองอย่างว่า transaction เดียวกัน

### F09 — P1: Roof/sweep มี feature names แต่ geometric behavior ยังไม่ครบ

**หลักฐาน:** [ROOF.md](modules/ROOF.md) มี roof forms แต่ acceptance หลักเน้น lean-to; ROADMAP R4 มี edge slope/topology; [DECORATIVE.md](modules/DECORATIVE.md) AC-DEC-002 รองรับ path แต่ไม่ลง compound miter

**สิ่งที่ต้องเติม:** roof solver inputs/outputs, per-edge Defines Slope, supported footprint classes/holes, ridge/hip/valley identity, degeneracy/rejection policy และ fixtures ตาม form; sweep ระบุ inner/outer/reflex/closed corners, profile orientation, clipping/self-intersection และ length takeoff

### F10 — P1: Electrical deliverables และ LED driver ยังไม่มี acceptance ครบ

**หลักฐาน:** [ELECTRICAL.md](modules/ELECTRICAL.md) มี lighting/control/circuit semantics แต่ panel เป็น later detail และ load schedule advanced; [DOWNSTREAM-ADAPTERS-SPECIFICATION.md](architecture/DOWNSTREAM-ADAPTERS-SPECIFICATION.md) ระบุ Electrical Load Schedule ใน exporter; strip LED มี wattage/host แต่ไม่มี driver sizing contract

**สิ่งที่ต้องเติม:** multi-way control semantics, grounding/panel/circuit/load/SLD data และ QA; LED length, W/m, driver capacity, voltage/derating/configured limits, profile/diffuser catalog, ownership Interior↔Electrical และ E-01/E-02/LED quantity acceptance

### F11 — P1: BOQ cost centers ยังไม่ได้ยกขึ้นเป็น authoritative contract

**หลักฐาน:** [QUANTITY-COSTING.md](modules/QUANTITY-COSTING.md) และ QUANTITY-CONTRACT ระบุ phase scope แต่ไม่กำหนด `cost_center`; standalone S1 ระบุการแยก phase จาก demolition/site-prep, new-work และ remodeling/joint-treatment แล้ว พร้อม existing informational

**สิ่งที่ต้องเติม:** cost-center field/enum และ mapping, joint treatment source relations/provider, unknown/preliminary quantities, no-double-count rules, rate/labor/waste/snapshot behavior และ tests ให้ three estimates แยกกันทุก domain ไม่ตีความ joint work เป็น phase ใหม่

### F12 — P1: Traceability บอก owner แต่ยังไม่สามารถพิสูจน์ว่า Master requirements ครบ

**หลักฐาน:** [TRACEABILITY.md](TRACEABILITY.md) ระบุชัดว่าเป็น documentation ownership map ไม่ใช่ feature-complete checklist; ไม่มี columns ที่เชื่อม Master item → detailed contract → AC → fixture/evidence → milestone สำหรับทุก requirement ขณะที่ module specs ราย domain จำนวนมากยังมีสถานะ Proposed

**สิ่งที่ต้องเติม:** ขยาย traceability เดิมด้วย mapping และ readiness ต่อ requirement; ใช้ ID convention เดิมใน [TRACEABILITY-ID-CONVENTION.md](architecture/TRACEABILITY-ID-CONVENTION.md) ไม่สร้างชุด IDs แข่งกัน; เพิ่ม AC ที่ขาดและแยก accepted direction, proposed behavior, implemented และ verified

ตัวอย่างที่ต้องไม่ตีความเกินหลักฐาน: `cf_validate_compliance` มีชื่อ tool ≠ legal-engine contract ครบ; load table ใน exporter ≠ electrical system ครบ; library railing ≠ stair/railing builder ครบ

### F13 — P2: Acceptance/status/performance ต้องแยก platform และวันที่หลักฐาน

**ผลแก้บางส่วน:** [ACCEPTANCE-CRITERIA.md](architecture/ACCEPTANCE-CRITERIA.md) AC-CORE-001/002 ใช้ standalone boot และ `.cfproj` UUID roundtrip แล้ว; [TEST-STRATEGY.md](architecture/TEST-STRATEGY.md) ใช้ `.cfproj` golden fixtures และแยก optional adapter suites แล้ว; STATUS ระบุ scope ของ F0–F3 เป็น Ruby adapter

**สิ่งที่ยังต้องเติม:** date/platform/evidence แยกจาก architectural decision; benchmark fixtures ตาม project size ก่อนตั้ง thresholds, history memory/rebuild/save limits และ worker/WASM decision gate ตาม [LOD-PERFORMANCE.md](architecture/LOD-PERFORMANCE.md) ผลแก้ contract ไม่ใช่การอ้างว่าผ่าน test suites เพิ่มในการแก้เอกสารครั้งนี้

ไม่ใช้จำนวน Ruby tests หรือ proof สามแผ่นเพื่ออ้างว่าผ่าน standalone Master Specification ทั้งหมด

## Backlog ที่ควรทำก่อนเปิด feature tracks เพิ่ม

| ลำดับ | งานเอกสาร | ปิด findings | ผลลัพธ์ที่ตรวจรับได้ |
|---|---|---|---|
| 1 | Direction aligned; canonical schema mapping ยังเปิด | F01 ปิด / F02 เปิด | SSOT และ adapter boundary ตรงกันแล้ว; เติม mapping fields/identity ต่อ |
| 2 | Expand TRACEABILITY และ acceptance/evidence columns | F12–F13 | ทุก Master item มี owner/spec/AC/milestone หรือสถานะ missing/deferred ที่มีเหตุผล |
| 3 | Native 20-sheet content/acceptance matrix | F04 | 20 rows เชื่อม providers/prerequisites/phase/scales และ publication policy |
| 4 | Complete Kitchen assembly + bathroom package contracts | F08, F11 | BOM/relations, edit/undo/failure cases, BOQ three cost centers และ affected sheets |
| 5 | Site/deed/compliance rules specification | F03 | deterministic input/result/evidence และ unknown/exception fixtures |
| 6 | Structure/BBS และ roof/sweep specifications | F07, F09 | reference fixtures ตาม assembly/geometry และ expected quantities/drawings |
| 7 | MEP system packages และ electrical/LED contracts | F06, F10 | network topology, formulas/catalog requirements, QA และ M/E sheet outputs |
| 8 | Stair/railing ownership และ detailed spec | F05 | owner/object/command/phase/level/quantity/drawing/AC พร้อมก่อน coding |

ใช้ลำดับนี้เป็นงานเติมแผน ไม่ใช่คำสั่งให้หยุดงาน standalone ที่มี acceptance ชัดอยู่แล้ว การพัฒนาแต่ละ track ต้องผ่าน specification gate ของ track นั้นก่อน

## สิ่งที่ต้องตัดสินใจก่อน implementation ของส่วนที่ยังขาด

1. **Delivery scope:** first release เป็น kitchen vertical workflow ถึงแผ่นใด และ full 20-sheet set อยู่ milestone ใด; แยก feature present จาก production verified
2. **Platform/runtime:** web/offline project workflow และ desktop packaging อยู่ release ใด; TypeScript baseline พร้อม benchmark ก่อนเลือก worker/Rust/WASM สำหรับ bottleneck ที่วัดได้
3. **Canonical contracts:** `.cfproj` fields/UUID/type catalog/lifecycle เป็นรูปแบบใด และ Ruby/export mappings เป็นอย่างไร
4. **Engineering/legal rule inputs:** jurisdictions, verified source versions, user-supplied engineering data, exceptions และ insufficient-data behavior ของแต่ละ validator
5. **Outputs/adapters:** PDF/font shaping backend และ validation fixtures, supported DXF/DWG/IFC subsets, read/write/sync direction และ conflict/customization policy ต่อ adapter

ข้อ 1–5 เป็น decisions ที่ต้องบันทึกก่อนทำ implementation ที่พึ่งพา ไม่ใช่คำขอเลือกเทคโนโลยีใหม่ทุกอย่างทันที

## การปิด audit

รอบ audit แรกเพิ่มรายงานและลิงก์ index หลังจากนั้นผู้ใช้สั่งยกเลิกแผน host-first จึงปรับ roadmap, entrypoints และ baseline/acceptance เอกสารให้เป็น standalone-first ตามผลแก้ F01 ไม่ได้แก้ runtime code หรือปิด gaps ราย domain ด้วยการเปลี่ยนเอกสารทิศทาง

ถือว่า feature planning ครบตาม Master เมื่อไม่มี requirement ที่ไร้ owner/spec/milestone; feature ที่เริ่มพัฒนามี contract และ AC ครบตาม Definition of documentation-complete; และข้อขัดแย้ง P0 มี canonical mapping หรือ superseded notice ชัดเจน
