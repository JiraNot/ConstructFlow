# การยืด–หดช่องเปิดจากวงกบด้านเดียว

ลากจุดจับขอบประตูหรือหน้าต่างแล้ววงกบฝั่งตรงข้ามคงที่ ระบบคำนวณความกว้างและจุดกลางใหม่จากวงกบที่ตรึงไว้ จากนั้นส่งผ่าน CommandBus ในคำสั่งเดียว จึง Undo/Redo ทั้งความกว้างและตำแหน่งพร้อมกันได้ จุดจับกลางยังใช้ย้ายช่องเปิดตามผนัง

การ Snap ขนาดมาตรฐานและการกด Ctrl เพื่อใช้ระยะอิสระยังทำงาน ขอบที่ลากมีระยะเผื่อปลายผนัง 100 มม. และไม่สามารถลากข้ามวงกบฝั่งตรงข้ามได้

ไฟล์ที่แก้สำหรับงานนี้:

- `D:/app/ConstructFlow/packages/snapping-engine/src/index.ts` — คำนวณการยืดวงกบและ Snap โดยตรึงอีกฝั่ง
- `D:/app/ConstructFlow/packages/snapping-engine/test/snapping.test.mjs` — ทดสอบยืด/หดทั้งสองขอบ การ Snap และขอบเขตผนัง
- `D:/app/ConstructFlow/packages/command-schema/src/architectureCommands.ts` — เพิ่มตำแหน่งกลางทางเลือกในคำสั่งแก้ขนาดประตู/หน้าต่าง
- `D:/app/ConstructFlow/packages/architecture-engine/src/index.ts` — ตรวจ host และอัปเดตความกว้าง ตำแหน่งตามผนัง และพิกัดจริงพร้อมกัน
- `D:/app/ConstructFlow/apps/plan-editor/src/components/PlanCanvas.tsx` — ส่งขอบที่ลากและขนาดเดิมให้ snapping engine
- `D:/app/ConstructFlow/apps/plan-editor/src/App.tsx` — ส่งตำแหน่งกับความกว้างผ่านคำสั่งเดียว
- `D:/app/ConstructFlow/packages/command-runtime/test/opening-edge-resize.test.mjs` — ทดสอบคำสั่งจริง ผนังเอียง Undo/Redo บันทึก/เปิดใหม่ และ rollback
- `D:/app/ConstructFlow/docs/OPENING-EDGE-STRETCH.md` — บันทึกการส่งมอบงานนี้

สัญญาโมเดล: ใช้ `DoorModuleData`/`WindowModuleData` ที่มีอยู่ ไม่มีการเปลี่ยนชนิดใน `types.ts` เพิ่มเพียงฟิลด์ทางเลือกใน command-schema รักษา UUID, host, created_phase, ระดับ และด้านเปิดบาน ขนาดที่แก้เป็น instance override ไม่แก้ catalog ทั้งชนิด การคำนวณอยู่ใน domain package

การตรวจสอบวันที่ 12 ตุลาคม 2026:

| ตำแหน่งที่รัน | คำสั่ง | ผล |
| --- | --- | --- |
| `packages/command-schema` | `npm run build` | ผ่าน |
| `packages/snapping-engine` | `npm run build` และ `npm test` | ผ่าน 18 tests |
| `packages/architecture-engine` | `npm run build` และ `npm test` | ผ่าน 21 tests |
| `packages/command-runtime` | `npm run build` และ `npm test` | ผ่าน 97 tests |
| `apps/plan-editor` | `npm run build` และ `npm test` | ผ่าน 24 tests; production build ผ่าน มีคำเตือนขนาด bundle เดิม |

ตรวจหน้าจอจริง: ประตูเริ่มกว้าง 0.800 ม. ระยะวงกบซ้าย 2.071 ม. / ขวา 0.129 ม. ลากวงกบซ้ายให้กว้าง 1.000 ม. ได้ระยะซ้าย 1.871 ม. / ขวา 0.129 ม. จากนั้นลากวงกบขวาหดเป็น 0.800 ม. ได้ระยะซ้าย 1.871 ม. / ขวา 0.329 ม. ขอบฝั่งตรงข้ามคงที่ทั้งสองครั้ง Undo/Redo คืนทั้งขนาดและตำแหน่งได้ โครงการทดสอบถูกคืนกลับหลังตรวจ

ขั้นถัดไป: รีเฟรช `http://localhost:5183/` แล้วเลือกประตู ลากจุดจับสีส้มที่ขอบฝั่งที่ต้องการยืดหรือหด dev server ยังคงเปิดไว้
