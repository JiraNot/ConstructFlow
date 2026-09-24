# Function Review & Improvement Analysis — 2026-09-24

> ขอบเขต: ตรวจสอบสุขภาพ test suite + วิเคราะห์ฟังก์ชันที่มีอยู่เพื่อหาจุดปรับปรุง
> **อัปเดต 2026-09-24:** ข้อ 3.1, 3.3, 4.1, 3.2 และ 5.3 **แก้เสร็จแล้ว** (ดู §9) — ข้อที่เหลือยังเป็นข้อเสนอรออนุมัติ
> คู่กับ: `docs/AUDIT-AND-DEVELOPMENT-PLAN-2026-09.md` (ภาพรวมระบบ), `docs/ROADMAP.md` (R0–R10)

## 1. สรุปผู้บริหาร

**สุขภาพระบบ: ดีมากในส่วน unit-level และสถาปัตยกรรมแข็งแรง (command bus / event bus / registry) แต่มี 3 ความเสี่ยงหลักและชุด tech debt ที่ระบุตำแหน่งได้ชัดเจน**

| ชี้วัด | ค่า | ประเมิน |
|---|---|---|
| Test suite (Docker, ruby:3.2, CI-equivalent) | 702 runs / 4,170 assertions / **0 failures, 0 errors, 0 skips** (1.4s) | 🟢 ยืนยันซ้ำวันที่วิเคราะห์ |
| Syntax check `ruby -c` (core + modules) | ผ่านทุกไฟล์ | 🟢 |
| `node --check` ui/panel.js | ผ่าน (Node v24.15.0) | 🟢 แต่ยังไม่มี check นี้ใน CI |
| `python -m compileall` apps/mcp-server | ผ่าน (Python 3.14) | 🟢 แต่ยังไม่มี check นี้ใน CI |
| Boot lifecycle (bootstrap.rb + Runtime.boot!) | **0 เทส** โหลด/รัน | 🔴 ช่องว่าง test ใหญ่ที่สุด |
| ui/panel.js (1,467 บรรทัด) | **0 เทส**, แค่ syntax check | 🟡 |
| apps/mcp-server (526 บรรทัด Python) | **0 เทส**, แค่ compile check | 🟡 |
| Ruby linter (RuboCop) | ไม่มี | 🟡 |

- ขนาดระบบ (app): Ruby ~46k บรรทัด, UI 5.7k บรรทัด (html 2,216 / css 2,011 / js 1,467), test 20.1k บรรทัด / 152 ไฟล์, mcp-server 526 บรรทัด
- แนวโน้มเตือน: ~55–60% ของตัวโค้ดอยู่ในไฟล์ที่เกิน 300 บรรทัด; โครงสร้างแบบ "ไฟล์ละหน้าที่เดียว" เริ่มถูกทำลายโดยไฟล์ registration ยักษ์

## 2. จุดแข็งที่ต้องรักษาไว้

- **สถาปัตยกรรมสม่ำเสมอ**: ทุกการเปลี่ยนแปลงเดินผ่าน CommandBus → SmartObjectManager + repositories → EventBus และเทสจำนวนมากเป็น evidence ว่า pattern ใช้ได้จริง
- **Idempotent install guards ทุก registration** (`return if runtime.commands.registered?(...)`) — ป้องกัน double-boot ดี ควรเป็นแนวปฏิบัติบังคับ
- **Test suite เร็วมาก (1.4s) และแยก boundary SketchUp ออกจาก logic** ทำให้ refactor ได้อย่างมั่นใจ — นี่คือเงื่อนไขเบื้องต้นของทุกข้อเสนอด้านล่าง
- frozen_string_literal ทั่วถึง, ไม่มี TODO/FIXME ค้าง (0 จุด)
- CI (core-tests + build-rbz) เขียว, deterministic RBZ build ทำงานจริง

## 3. ความเสี่ยงระดับสูง (แก้ก่อน)

### 3.1 Debug file writes หลุดไป production boot path 🔴
- **ที่ตั้ง:** `apps/sketchup-extension/constructflow/real_project_generator.rb` ถูก `require` ตอนบูต (bootstrap.rb:152) และ **เขียนไฟล์ทันทีตอน load ที่ line 5**:
  ```ruby
  File.open('C:/Users/Dulla/constructflow_debug.log', 'a') { |f| f.puts("Loaded at #{Time.now}") } rescue nil
  ```
  อีก ~6 จุดในไฟล์เดียวกัน (L279, L622, L624, L628, L631, L634) — เขียนตาม `$cf_gen_timer` ทุก 1 วินาที จนกว่า generation สำเร็จ
- **ผลกระทบ:** ล็อกอินเป็น user อื่น = crash ทันทีตอนเปิด SketchUp (`Errno::EACCES`); user Dulla จะมี log โตไม่จำกัด; นี่คือโค้ด debug ที่หลุดเข้า v1.0.0
- **⚠ ค้นพบเพิ่มระหว่างแก้:** timer เดิมไม่ได้แค่เขียน log — มัน **`model.entities.clear!` แล้ว generate ทับโมเดลที่เปิดอยู่โดยอัตโนมัติทุกครั้งที่เปิด SketchUp** (จนกว่าจะเจอ status file บน Desktop) = ความเสี่ยงทำงานของผู้ใช้หาย ถ้าไม่มีการบันทึกตอน auto-generate วิ่ง
- **ข้อเสนอ (เล็ก แต่ควรทำก่อนอย่างอื่น):**
  1. ลบ line 5 และทุก debug `File.open(...rescue nil)` ในไฟล์นี้ (เก็บไว้เฉพาะเมื่อ debug จริง)
  2. ถ้าต้องเก็บ log ให้ใช้ `Core::DiagnosticLog` ที่มีอยู่แล้ว
  3. ย้ายที่เก็บ output ทั้งระบบไป path ผ่าน helper กลาง (ดู 4.1) แทน hardcode
  4. เก็บ `$cf_gen_timer` เป็น state ใน generator แทน global
- **เหตุผลที่รอดมาถึงวันนี้:** ไม่มีเทสไหน require bootstrap.rb เลย (ดู 3.2)

### 3.2 Boot lifecycle ไม่มี coverage ณ ระดับ unit 🔴
- **ข้อเท็จจริง:** `grep -rln "bootstrap" test/` และ `Runtime.boot` → 0 ไฟล์
- แปลว่า: require order แตก (cycle/typo), observer double-install, module double-install ฯลฯ จะไม่มีวันโดนจับตอน push — เคยพิสูจน์แล้วว่าเกิดได้จริงเพราะ CI เคยพังจาก require path
- **ข้อเสนอ:** เพิ่ม `test/runtime/bootstrap_test.rb` ที่ `require` bootstrap.rb (ผ่าน fake SketchUp boundary) แล้ว assert: จำนวน module ตาม manifest, commands/events ที่ลงทะเบียนครบ, boot! ซ้ำไม่ double-install (idempotent) — เป็น "bootstrap contract test"
- ประโยชน์ร่วม: ทำให้ refactor registration ยักษ์ (4.3) และ test_helper drift (5.5) ปลอดภัยขึ้นทันที

### 3.3 Hardcoded fallback path ประเภทเดียวกันใน html_dialog.rb 🔴
- `core/html_dialog.rb:1527, 1556`: `user_profile = ENV['USERPROFILE'] || 'C:/Users/Dulla'` — รูปแบบเดียวกับ 3.1 แต่อยู่ใน action ส่งออก BOQ/manifest ที่ UI เรียกจริง
- **ข้อเสนอ:** สร้าง helper กลาง (4.1) แล้วเปลี่ยนทุกจุดให้เรียกตัวเดียวกัน

## 4. ปรับปรุงเชิงโครงสร้าง (refactor ที่คุ้มที่สุด)

### 4.1 สร้าง `Core::Paths` helper (น้อยสุด, คุ้มสุด)
- จุดที่ hardcode/fallback ผิด: real_project_generator.rb (~7 จุด), html_dialog.rb (2 จุด)
- interface น้อยที่สุด: `user_desktop_dir` / `temp_dir` / `debug_log_path`
- เทสคุม: fallback ไม่มีชื่อ user, สร้าง dir ได้, ทำงานเมื่อ ENV ว่าง

### 4.2 DRY ตัว "extension → domain regeneration" ทั้งกลุ่ม 🟠
- **ข้อเท็จจริง:** 9 ไฟล์ `modules/*/extension_command_registration.rb` (รวม 2,293 บรรทัด) เป็น skeleton เดียวกัน:
  `install` (idempotent) → `generate_or_update` → loop ตาม boundary → find_existing_by_slot → rebuild-or-create + mark_dirty + emit events → remove stale slots
- ตัวช่วยซ้ำกัน: `fetch` (9/9 ไฟล์), `find_generated*` (9/9), `resolve_base_elevation` (3/9), `generated_slot` (3/9), `level_refs` (3/9), `raise_on_errors!` (2/9)
- ทุกไฟล์มี domain differences จริง (wall slot = edge, structure = corner columns + foundation, drainage = network) ดังนั้น **ไม่ใช่ copy-paste ที่ลบทิ้งได้** — แต่เป็น pattern ที่ควรมี shared base 1 ตัว
- **ข้อเสนอ:** สร้าง `core/extension_command_pattern.rb` รับ config (slot naming, find_generated, build_definition, rebuild!, create!) ให้ 9 ไฟล์เดิมเหลือเฉพาะส่วน domain-specific (~80–120 บรรทัด/ไฟล์ จากเดิม 160–360)
- ทยอย 1 โมดูล/ครั้ง (แนะนำเริ่ม roof หรือ electrical ซึ่งเล็กสุด) — เทสกลุ่ม `test/*/extension_command_registration_test.rb` ครอบอยู่แล้ว
- ประโยชน์: ลดบรรทัดรวม ~40–50%, bug fix ที่ต้องแก้ทีละไฟล์ (เช่น `mark_dirty_with_dependents` มีแค่ architecture) จะแพร่ให้ทุกโมดูลอัตโนมัติ

### 4.3 แตก registration ยักษ์ตาม object type 🟠
- **ตัวเลข:** architecture/registration.rb **1,773 บรรทัด / 50 methods** (wall + floor + room + ceiling + schedule + toolbar ในไฟล์เดียว), structure 1,132/48, surface 843/37, door_window 825/24
- โครงสร้างใหม่: `modules/architecture/registration/` เป็น directory: `wall_registration.rb`, `floor_registration.rb`, `room_registration.rb`, `ceiling_registration.rb` แล้วให้ `registration.rb` เดิมรวมพวกมัน + MANIFEST
- เงื่อนไข: ทำหลัง 3.2 (bootstrap contract test) เพื่อตรวจ idempotency + manifest counts หลังแตกไฟล์
- ประโยชน์: ลด merge conflict, แยกความรับผิดชอบชัด, คุมขนาดไฟล์ < 500 บรรทัด/ไฟล์

### 4.4 main.rb: แยก UI plumbing ออกจาก runtime 🔵 (คุณภาพ)
- main.rb (527 บรรทัด) = boot + core commands + menu/inputbox/UI.messagebox ปนกัน
- ข้อเสนอ: ย้าย menu/inputbox plumbing ไป `core/ui_entry.rb` และ core commands ไป `core/core_commands.rb` ให้ main.rb เหลือ boot + เรียก install 2 ตัว
- เทสครอบ commands อยู่แล้ว, UI plumbing ตรวจด้วย bootstrap contract test (3.2)
- ประโยชน์: main.rb กลายเป็น composition root จริง ๆ

## 5. ช่องว่างเชิงคุณภาพ (โดยไม่แก้โครงสร้าง)

### 5.1 Silent `rescue nil` / bare rescue ทั่วระบบ
- **ตัวเลข:** 161+ จุด (เฉพาะ core + modules) มากสุดใน tool files, native_acceptance_*, ghost_preview, shortcut_manager
- แยกสองแบบ:
  - **ยอมรับได้/ตั้งใจ:** SketchUp API boundary (`rescue nil` หลัง `add_face` ที่ SketchUp อาจคืน nil ตาม geometry), observer disconnect ตอนปิด, `rescue StandardError` ที่ log ผ่าน diagnostics แล้ว
  - **ต้องแก้:** `rescue nil` ใน business logic ที่กลืน error เงียบ เช่น `smart_objects.fetch(entity) rescue nil` ใน tools — ทำให้ debug เวลา object หายยากมาก
- **ข้อเสนอ:** ไม่แก้ทีเดียวทั้ง 161 จุด — แก้เฉพาะ business logic ที่กลืนเงียบทีละไฟล์เมื่อแตะงานนั้น ๆ; ถ้าเปิด RuboCop ให้ baseline ปิด `Lint/RescueModifier` ไว้ก่อนแล้วค่อยกดทีละไฟล์
- เสริม: `real_project_generator.rb` ใช้ `rescue => e` ที่เขียน debug log แทน diagnostics — รวมกับ 3.1

### 5.2 ไม่มี RuboCop + ไม่มี style guide ร่วม
- ข้อเสนอ: เพิ่ม `.rubocop.yml` แบบ lenient (target ruby 3.2, ปิด Metrics/* เริ่มต้น, เปิด Lint/* ยกเว้น Lint/RescueModifier) + `rubocop --auto-gen-config` สร้าง baseline `.rubocop_todo.yml` เก็บไว้กดทีละไฟล์
- รวมใน CI หลังจาก baseline เสถียรแล้วเท่านั้น ไม่งั้น CI จะแดงทันที
- ทางเลือกเบากว่า: ข้าม RuboCop ไปก่อน ใช้ `ruby -c` + tests + bootstrap contract test พอ

### 5.3 CI ยังไม่ตรวจ JS/Python
- ปัจจุบัน: JS/Python ไม่มี automated check ใด ๆ
- ข้อเสนอ (เล็กมาก): ใน core-tests.yml เพิ่ม step `node --check ui/panel.js` และ `python -m compileall apps/mcp-server` ผ่าน setup-node/setup-python actions
- ประโยชน์: กัน syntax regression ในส่วนที่ไม่มีเทส

### 5.4 mcp-server: pending command ไม่มี timeout
- จากอ่าน server.py (107 บรรทัด): `pending_commands` โตไม่จำกัดถ้า SketchUp ไม่ตอบ (future ค้าง → memory leak ช้า ๆ) และไม่มี cleanup เมื่อ `sketchup_ws` หลุด
- ข้อเสนอ: ใส่ timeout บน future (`asyncio.wait_for`) + ล้าง pending เมื่อ connection ปิด
- เพิ่ม pytest พื้นฐาน 3–5 case: get_status, execute_command ตอน disconnected, timeout path (งาน ~ครึ่งวัน)
- เสริม: global mutable state (`sketchup_ws`, `pending_commands`) โอเคสำหรับขนาดนี้ แต่ควร encapsulate เป็น class เมื่อขยาย

### 5.5 Test helper ล้าหลังไฟล์จริง (drift แล้ว แต่ไม่พัง)
- test_helper.rb (410 บรรทัด) โหลด core/architecture/opening รายไฟล์ด้วย `File.join` ขณะที่ main.rb โหลด ~160 requires ตามลำดับจริง
- ผล: โค้ดบางส่วนถูกโหลดต่าง order จาก production; ไฟล์ใหม่ที่ main.rb โหลดแต่ helper ไม่โหลด = ไม่มีเทสไปถึง
- ข้อเสนอ: ระยะยาวให้ test_helper โหลดผ่าน bootstrap จริง (fake SketchUp boundary) — สอดคล้องกับ 3.2 โดยตรง: bootstrap contract test แก้ทั้ง coverage ของ boot path และ drift ของ test_helper พร้อมกัน

## 6. เวกเตอร์อื่นที่สแกนแล้ว (พบน้อย ไม่เร่งด่วน)

- `tools/` พฤติกรรมสม่ำเสมอ (onLButtonDown → smart_objects.fetch rescue nil → UI feedback) — DRY ได้อีกเหมือน 4.2 แต่ ROI ต่ำกว่า
- `i18n.rb` + UI strings ไทย/อังกฤษแทรกใน .rb — ทำงานได้; ถ้าจะ scale ต้องย้าย string table
- `ui/panel.js` 1,467 บรรทัด — รอบนี้แค่ syntax check ผ่าน (ไม่มีเทส) — เป็น vector ถัดไปถ้าจะปรับ UI จริง
- `scripts/build_rbz.sh` deterministic build OK; คงเดิม

## 7. ลำดับการลงมือที่แนะนำ (รอผู้ใช้อนุมัติ)

| ลำดับ | งาน | ขนาด | ประโยชน์ |
|---|---|---|---|
| 1 | 3.1 + 3.3 + 4.1 → `Core::Paths` + ลบ debug writes | S (~1–2 ชม.) | กำจัด crash risk ตอน boot กับ user อื่น |
| 2 | 3.2 bootstrap contract test | M (~ครึ่งวัน) | ครอบ boot path ทั้งระบบ + ปลดล็อก refactor ใหญ่ |
| 3 | 5.3 CI check JS/Python + 5.2 RuboCop baseline (lenient) | S | กัน regression ในส่วนไม่มีเทส |
| 4 | 4.2 DRY extension command pattern (1 โมดูลนำร่อง) | M–L | ลด tech debt ก้อนใหญ่สุดที่วัดได้ |
| 5 | 4.3 แตก registration ยักษ์ (architecture ก่อน) | L | ความยั่งยืนระยะยาว |
| 6 | 5.4 mcp-server timeout + pytest | S–M | ความน่าเชื่อถือของ AI bridge |
| 7 | 4.4 main.rb แยก UI plumbing | M | คุณภาพ ทำตามหลังได้ |
| 8 | 5.1 ไล่แก้ silent rescue ใน business logic | ต่อเนื่อง | คุณภาพต่อเนื่อง |

ขนาด: S < 2 ชม. / M = ครึ่งวัน / L = 1–2 วัน

## 8. สิ่งที่ตรวจแล้ว (evidence)

- Docker run (ruby:3.2): 702 runs / 4,170 assertions / 0 failures / 0 errors (seed 54137), syntax check `ruby -c` ผ่านทุกไฟล์ core + modules
- Node v24.15.0: `node --check ui/panel.js` ผ่าน; Python 3.14.5: `compileall apps/mcp-server` ผ่าน
- ตัวเลขทั้งหมดมาจาก grep/wc จริงใน repo ณ commit ee45489 (main = origin/main)

## 9. สิ่งที่แก้ไปแล้ว (2026-09-24)

| ข้อ | สิ่งที่ทำ | ไฟล์ |
|---|---|---|
| 3.1 | ลบ debug file writes ทั้ง 7 จุด (รวม write ทันทีตอน load); เปลี่ยน save/status path เป็น `Core::Paths`; **ปิด auto-generate timer เป็น opt-in** ผ่าน `ENV['CONSTRUCTFLOW_AUTO_PROJECT']=1` (เดิม clear! + generate ทับโมเดลทุกครั้งที่เปิด SketchUp); เมนูสร้างโมเดลยังใช้ได้เหมือนเดิม | `real_project_generator.rb` |
| 3.3 + 4.1 | สร้าง `Core::Paths` (`user_output_dir` / `desktop_dir` / `temp_dir` / `debug_log_path` — USERPROFILE → HOME → Sketchup.temp_dir → Dir.tmpdir, ไม่มีชื่อ user ใดในโค้ด) + เทส 10 ตัว; เปลี่ยน 2 จุด export BOQ/manifest ให้ใช้ helper | `core/paths.rb` (ใหม่), `html_dialog.rb`, `main.rb`, `test_helper.rb`, `test/core/paths_test.rb` |
| 3.2 | Bootstrap contract test 6 ตัว: โหลด bootstrap.rb จริงผ่าน stub `test/sketchup.rb` (minimal, additive-only), assert boot! + modules 13 ตัว + core commands 6 ตัว + idempotent + require ซ้ำ + attach_model(nil) | `test/runtime/bootstrap_test.rb`, `test/sketchup.rb` (ใหม่), `test_helper.rb` (FakeModel + `add_observer`) |
| 5.3 | CI เพิ่ม step `node --check ui/panel.js` + `python3 -m compileall apps/mcp-server` | `.github/workflows/core-tests.yml` |

**ผล verify หลังแก้ (Docker, CI-equivalent): 708 runs / 4,210 assertions / 0 failures / 0 errors** (+6 เทสใหม่), syntax check ผ่าน, panel.js ผ่าน, mcp-server ผ่าน

ข้อที่ยังเปิด: 4.2 (DRY extension command pattern — **เริ่มแล้ว**, ดู §10), 4.3 (แตก registration ยักษ์), 4.4 (main.rb), 5.1 (silent rescue), 5.2 (RuboCop), 5.4 (mcp-server timeout), 5.5 (test_helper drift)

## 10. ข้อ 4.2 เสร็จสมบูรณ์ — ทั้ง 9 โมดูล (2026-09-24 รอบที่สอง/สาม)

- สร้าง `core/extension_command_support.rb` — `Core::ExtensionCommandSupport`: `fetch`, `extension_id_from`, `find_generated` + `all_generated` + `generated_relation?` + `generated_slot` (relationship matching ที่เคยซ้ำทุกไฟล์), `dirty_events`, `resolve_base_elevation`, `level_refs`, `raise_on_errors!`
- **ย้ายครบทั้ง 9 โมดูล** (roof, electrical, architecture, structure, door_window, opening, surface, interior, drainage) ไปใช้ตัวกลาง — คง method สาธารณะเดิมทุกตัวเพราะเทสเรียกตรง
- ยืนยันการ dedup สุดท้าย: inline relationship matching เหลือ **0 จุด** ในทั้ง 9 ไฟล์ (grep ยืนยัน), `fetch` delegate ทั้ง 9 ไฟล์, support ถูก require จากครบ 9 ไฟล์
- ปรับ `FakeObject` ในเทส structure ให้มี `owner_module` ตาม contract จริงของ `SmartObject` (fake เดิมไม่สมจริง)
- รวม 2,349 บรรทัด (9 ไฟล์ + support) เทียบเดิม 2,293 — คงตัวเลขใกล้เคียงเพราะคง wrapper สาธารณะไว้ แต่ logic ส่วนที่ซ้ำ (matching/fetch/id/elevation/slot) ตอนนี้มีจุดเดียว แก้ bug ที่เดียวมีผลทั้ง 9 โดเมน
- ผล verify: 717 runs / 4,228 assertions / 0 failures + syntax check ผ่านทุกไฟล์

## 11. ข้อ 4.3 เสร็จ — แตก architecture/registration.rb แล้ว (2026-09-24 รอบที่สี่)

- แตก `modules/architecture/registration.rb` (1,773 บรรทัด) เป็น 5 ไฟล์ sibling ใน `modules/architecture/registration/` ที่ **reopen โมดูล `Registration` เดิม** — public surface (`install`, `wall_schedule_editor`, `schedule_editor`, `reconcile_*` ฯลฯ) และผู้เรียกทุกตัวไม่เปลี่ยน:
  - `shared_registration.rb` (1,245) — MANIFEST, install entry, UI wiring, reconciliation/dirty helpers
  - `wall_registration.rb` (274) — wall commands, schedule, validation
  - `room_registration.rb` (143), `floor_registration.rb` (88), `ceiling_registration.rb` (88)
- ยืนยันกลไก: def ครบ 50 → 50 ตัว, เทสเรียก `Registration.xxx` ตรงทำงานเหมือนเดิม, bootstrap contract test ผ่าน
- แก้ `test/core/native_tool_contract_test.rb` ให้อ่าน source รวมทุกไฟล์ใน `registration/` (source-contract test ที่ grep ข้อความจากไฟล์เดิม)
- ผล verify: 717 runs / 4,228 assertions / 0 failures + syntax ผ่านทุกไฟล์ (รวม CI syntax check ที่ครอบไฟล์ใหม่อัตโนมัติ)

## 12. ข้อ 4.4 + 5.4 เสร็จ (2026-09-24 รอบที่ห้า)

### 4.4 main.rb เป็น composition root
- แยกจาก `main.rb` (เดิม 527 บรรทัด): core commands → `core/core_commands.rb` (`Core::CoreCommands.register`), menu/inputbox/inspector → `core/ui_entry.rb` (`Core::UiEntry.install` + functions)
- `main.rb` เหลือ require graph + boot! + delegator `show_inspector` (คง API ที่ shortcut_manager/เทสเรียก); bootstrap contract test ช่วยจับ `require_relative 'modules/door_window/hole_puncher_service'` ที่หลุดได้ทันที
- ปรับ `native_tool_contract_test.rb` ให้อ่าน runtime source รวม 3 ไฟล์ (main + ui_entry + core_commands)

### 5.4 mcp-server command lifecycle
- **แก้ไขรายงานเดิม:** server.py มี `asyncio.wait_for` timeout 10s + `finally` cleanup อยู่แล้ว — สิ่งที่ขาดจริงคือ **cleanup ตอน WebSocket disconnect** ซึ่งเพิ่มแล้ว (fail pending futures ด้วย `ConnectionError` แล้ว clear) และยก timeout เป็น constant `COMMAND_TIMEOUT_SECONDS` เพื่อให้เทสปรับค่าได้
- เขียน `apps/mcp-server/test_server.py` (unittest, **ไม่ต้องติดตั้งแพ็กเกจ** — stub mcp/websockets เมื่อไม่มี, รัน `python test_server.py` ตรง ๆ): 5 tests ครอบ get_status disconnected/connected, round-trip + cleanup, timeout + cleanup, disconnect fail-pending
- CI เพิ่ม step `python3 apps/mcp-server/test_server.py`

- ผล verify รวมรอบสุดท้าย: Ruby 717/4,228/0 + syntax ผ่าน + panel.js ผ่าน + Python tests 5/5 ผ่าน

## 13. ข้อ 5.2 + hygiene เสร็จ (2026-09-24 รอบที่หก)

### 5.2 RuboCop baseline
- `.rubocop.yml` แบบ lenient: เปิดเฉพาะ **Lint** cops (ปิด Style/Layout/Metrics ทั้งตระกูล), ยกเว้น `Style/RescueModifier` + `Lint/SuppressedException` (161 จุดที่ตั้งใจ — tech debt §5.1)
- `.rubocop_todo.yml` baseline จาก `--auto-gen-config` (2,540 บรรทัด กด exclude ทั้ง repo) — ผลรัน: **531 files, no offenses** ต่อ rubocop 1.91.0 (pin version ใน CI เพราะ baseline ผูกกับ cop behavior ของ version นั้น)
- CI เพิ่ม step `rubocop` (ติดตั้ง rubocop:1.91.0) — จากนี้โค้ดใหม่จะโดน Lint จับอัตโนมัติ, ไฟล์เดิมถูก baseline ยกเว้นและค่อยกดทีละไฟล์
- หมายเหตุ: RuboCop ใหม่ย้าย RescueModifier ไปอยู่ `Style/` แล้ว (จากเดิม `Lint/`)

### Hygiene
- ลบ `test.zip` (ขยะ 412KB) แล้ว
- `scripts/test.sh` (ruby local หรือ fallback Docker) + `scripts/test.ps1` (Windows/Docker) — รันชุดเดียวกับ CI ได้ทันที; ทดสอบแล้ว 717/0 ผ่าน
- workflows ทั้งสองไฟล์: `actions/checkout@v4 → v5` + concurrency group (cancel-in-progress)

### สถานะสุดท้ายของแผน
เสร็จครบ: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.2, 5.3, 5.4 ✅ | 5.5 ปิดโดย bootstrap contract test | 5.1 (silent rescue) คงเป็น tech debt ต่อเนื่องที่มีเครื่องมือรองรับ (RuboCop) แล้ว | งานเหลือคือ commit/push + เก็บกวาด remote branch + GitHub Release v1.0.0

## 14. อัปเกรดรายละเอียดโมเดล (Model Detail Upgrade — 2026-09-24 รอบที่เจ็ด)

ทิศทางใหม่จากผู้ใช้: ปรับปรุงฟังก์ชันสร้างโมเดลให้มีรายละเอียดมากขึ้น (เดิม geometry แทบทุกโดเมนเป็น face เดียว + pushpull = กล่องโล่นไม่มีวัสดุ) — ลำดับตามที่ผู้ใช้เลือก: ผนัง → ประตู/หน้าต่าง → เสา/คาน/ฐานราก → หลังคา แบบ build-up จริง + วัสดุ

### สิ่งที่เพิ่มใหม่
- **`core/model_materials.rb`** (ใหม่) — จานสี 14 วัสดุ CF* (ปูนฉาบ, AAC, อิฐ, คอนกรีต, เหล็ก, ไม้, กระจก, กระเบื้อง, แผ่นหลังคา ฯลฯ) สร้าง/ reuse บนโมเดลจริง, ปลอดภัยนอก SketchUp (คืน nil ในเทส)
- **ผนัง — build-up จริง:** `wall_build_up.rb` (ใหม่) mapping ประเภทผนัง (aac/brick/concrete/precast/timber_frame/drywall) → ชั้นก่อสร้างจริง (เช่น ฉาบ 15 + แก่น + ฉาบ 15) โดย**ชั้นแก่นดูดความหนาที่เหลือ** รวมเท่า thickness_mm เดิมพอดี → join/miter/เซลล์เจาะรูปทำงานเหมือนเดิมทุกอย่าง; เทส `wall_build_up_test.rb` 6 ตัว (ผลรวมความหนา, collapse ผนังบาง, เลือกตาม type)
- **ประตู/หน้าต่าง — 3D จริง:** วงกบ 4 ชิ้น (ขอบข้าง/ทับ/ขอบล่าง) เป็น solid ลึกเต็มช่อง, แผ่นกระจก 6 มม. ลึกจริง, บานสวิงเป็น slab หนา 40 มม.; ความลึกอ่านจาก**ความหนาผนังเจ้าบ้านจริง** ผ่าน `infill_depth_mm` (accessor ใหม่แบบ additive ใน OpeningInfillHostCapability); คง 2D symbols เดิม
- **เสา — section จริง:** ทรงกลม 24 เหลี่ยม (section_type round/circular), เหล็ก I/H/กล่องอ่าน out ขนาดจาก `StructuralProfileCatalog` ที่มีอยู่ (tw/tf/thickness ตามมาตรฐาน), คงสี่เหลี่ยมสำหรับคอนกรีต; **คาน/ฐานราก** ใส่วัสดุคอนกรีต/เหล็ก/ไม้ตาม definition.material
- **หลังคา:** แผ่นมีความหนาจริงตาม `thickness_mm` + สีตาม `covering_system` (แผ่นเมทัล/กระเบื้อง)

### หลักการออกแบบ
- ทุกการอัปเกรด**ไม่เปลี่ยน footprint** (ผนังรวมความหนาเท่าเดิม, เสาอยู่ใน bounding box เดิม) เพื่อไม่ทำ join/quantity/plan representation เดิมเสีย
- ทุก material call ปลอดภัยในเทส (stub ไม่มี materials API ก็ข้ามไป)
- ผล verify: **723 runs / 4,252 assertions / 0 failures** + RuboCop 534 ไฟล์ no offenses + syntax ผ่าน (+6 เทส build-up ใหม่)

## 15. อัปเกรดรายละเอียดโมเดล รอบสอง (2026-09-24 รอบที่แปด)

- **ชายคายื่น + บัวโปร่ง (หลังคา):** แผ่นหลังคาถูกยืดออกนอก 300 มม. ตามทิศตั้งฉากของขอบ (มุมใช้ bisector ของ normals สองขอบ) โดย vertex แต่ละจุดถูกเคลื่อน**เพียงจุดเดียว** (แชร์ข้าม facet) → mesh ยังเป็นเนื้อเดียวไม่มีรอยแตกที่สัน; z ลดตาม slope เพื่อให้ผืนหลังคาอยู่ระนาบเดียวกัน; บัวไม้ (fascia) สูง 120 มม. ติดตามชายคาทุกขอบ; definition/quantities/to_h ไม่ถูกแตะ (presentation-only)
- **พื้น build-up:** `floor_build_up.rb` (ใหม่) — พื้นหนา T กลายเป็น 2 ชั้น: พื้นคอนกรีตโครงสร้าง + ผิวเสร็จ (tile/terrazzo/wood/carpet ตาม material_id) โดยผิวเสร็จจำกัดไม่เกิน 1/4 ของความหนา; ชั้นถูก stack ด้วย cumulative z-offset ใน sub-group 'Construction Layers' — ระดับชั้น/offset เดิมไม่เปลี่ยน; เจาะรูป (holes) ยังทำงานทุกชั้น
- **บานเลื่อนเฟสซ้อน (หน้าต่าง/ประตูเลื่อน):** บาน slide_left/slide_right ถูกเลื่อนไปคนละเฟส (± depth/6 ตาม normal ของผนัง) อ่านเป็นรางซ้อนจริง คู่กับ slab หนา 40 มม. ที่มีอยู่แล้ว
- ผล verify: **723 runs / 4,252 assertions / 0 failures** + RuboCop 535 ไฟล์ no offenses + syntax ผ่าน

## 16. เทสยืนยัน geometry ใหม่ + จับบั๊กจริงได้ (2026-09-24 รอบที่เก้า)

- เพิ่ม `test/architecture/model_detail_geometry_test.rb` — recording fakes (RecordingFace/RecordingEntities/RecordingGroup) ที่**จับทุก face/ชั้น/วัสดุ/pushpull ที่ geometry สร้าง** แล้ว assert เชิงโครงสร้าง 6 ตัว:
  ผนัง 3 ชั้นพร้อมวัสดุถูกลำดับ, เซลล์เจาะรูปครบ 15 ชิ้น (3x2 cells - void, x 3 ชั้น), พื้น slab+ผิวเสร็จ 138+12 มม. stack ถูกตำแหน่ง, ชายคายื่น 300 มม. ทิศถูก + บัวไม้, สันจั่ว gable ไม่ขยับ, ประตู 7 ชิ้น 3D (วงกบ 4 + กระจก + บาน 2)
- **เทสใหม่จับบั๊ก production จริง 2 จุดทันที:** (1) `floor_geometry.rb` เขียนค่า mm ลง SketchUp ตรง ๆ โดยไม่แปลงหน่วย (โมเดลจริงจะใหญ่ผิด 25.4 เท่า) — แก้แล้ว (2) ทิศ normal ชายคาหลังคากลับข้าง (ยื่นเข้าใน) — แก้แล้ว
- เรียนรู้: อย่าเพิ่ม `Sketchup::Color` ใน stub เพราะ adapter เดิมพึ่งพาการล้มเหลวของ const นั้น — คง stub เดิม
- ผล verify: **729 runs / 4,280 assertions / 0 failures** + RuboCop 536 ไฟล์ no offenses + syntax ผ่าน
