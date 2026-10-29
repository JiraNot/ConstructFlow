import React, { useState } from "react";
import type { ProjectDocument } from "@constructflow/project-model";
import { type DisplayLengthUnit } from "@constructflow/project-model";
import { WorkbenchNumberInput } from "./WorkbenchNumberInput.js";
import type {
  CommandRequest,
  CommandBatchResult,
} from "@constructflow/command-schema";
import { Dialog } from "./ui/Dialog.js";
import { formatLengthMm } from "@constructflow/project-model";
import type { SnapMode } from "@constructflow/snapping-engine";
import type { PlanCanvasPreferences } from "../app/planCanvasPreferences.mjs";
import { updatePlanCanvasPreference } from "../app/planCanvasPreferences.mjs";
export function SettingsModal({
  project,
  displayUnit,
  preferences,
  onPreferencesChange,
  onClose,
  onExecute,
  inspectorOpen,
  onInspectorChange,
}: {
  project: ProjectDocument;
  displayUnit: DisplayLengthUnit;
  preferences: PlanCanvasPreferences;
  onPreferencesChange: (updater: (current: PlanCanvasPreferences) => PlanCanvasPreferences) => void;
  onClose: () => void;
  onExecute: (commands: CommandRequest[]) => CommandBatchResult;
  inspectorOpen: boolean;
  onInspectorChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState("project"),
    [levels, setLevels] = useState(() => structuredClone(project.levels)),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const dirty = JSON.stringify(levels) !== JSON.stringify(project.levels);
  const setPreference = <K extends keyof PlanCanvasPreferences>(key: K, value: PlanCanvasPreferences[K] | ((current: PlanCanvasPreferences[K]) => PlanCanvasPreferences[K])) =>
    onPreferencesChange(current => updatePlanCanvasPreference(current, key, value));
  const toggleSnapMode = (mode: SnapMode) => setPreference("snapModes", current => current.includes(mode) ? current.filter(value => value !== mode) : [...current, mode]);
  const close = () => {
    if (dirty) setPending(true);
    else onClose();
  };
  const save = () => {
    const commands: CommandRequest[] = levels.flatMap<CommandRequest>((level) => {
      const existing = project.levels.find((item) => item.id === level.id)
      if (!existing) return [{ name: "CreateLevel", input: { ...level } }]
      if (JSON.stringify(level) === JSON.stringify(existing)) return []
      return [{
        name: "UpdateLevel",
        input: { id: level.id, name: level.name, elevation_mm: level.elevation_mm, height_mm: level.height_mm },
      }]
    });
    if (!commands.length) {
      onClose();
      return;
    }
    const result = onExecute(commands);
    if (result.status === "success") onClose();
    else setError((result.errors ?? []).join("\n"));
  };
  return (
    <Dialog
      title="ตั้งค่า"
      subtitle="ระดับอาคารใช้กับโครงการนี้ · การแสดงแผงใช้กับพื้นที่ทำงาน"
      onClose={close}
      className="cf-settings-dialog"
    >
      {pending && (
        <div className="cf-draft-warning" role="alert">
          ระดับอาคารยังไม่ได้บันทึก
          <button
            className="cf-button cf-button-quiet"
            onClick={() => setPending(false)}
          >
            กลับไปแก้ต่อ
          </button>
          <button className="cf-button" onClick={onClose}>
            ทิ้งการแก้ไข
          </button>
        </div>
      )}
      <nav className="cf-catalog-filters">
        <button
          className={tab === "project" ? "is-active" : ""}
          onClick={() => setTab("project")}
        >
          โครงการนี้
        </button>
        <button
          className={tab === "drawing" ? "is-active" : ""}
          onClick={() => setTab("drawing")}
        >
          การวาด
        </button>
        <button
          className={tab === "workspace" ? "is-active" : ""}
          onClick={() => setTab("workspace")}
        >
          พื้นที่ทำงาน
        </button>
      </nav>
      <div className="cf-settings-body">
        {tab === "project" ? (
          <>
            <h3>ชั้นและระดับอาคาร</h3>
            <p className="cf-help">
              ปรับระดับเป็น {displayUnit} ชิ้นงานที่อ้างระดับเหล่านี้จะอัปเดตเมื่อบันทึก ·
              ย้อนกลับได้ด้วย Undo
            </p>
            {levels.map((level, i) => {
              const dependents = Object.values(project.objects).filter((o) =>
                o.level_refs?.some((ref) => ref.level_id === level.id) ||
                ["level_id", "base_level_id", "top_level_id"].some(
                  (key) => Reflect.get(o.module_data, key) === level.id,
                ),
              ).length;
              return (
                <div className="cf-level-row" key={level.id}>
                  <label className="cf-field">
                    <span>ชื่อระดับ · ใช้กับ {dependents} ชิ้น</span>
                    <input
                      aria-label={`ชื่อระดับ ${level.id}`}
                      value={level.name}
                      onChange={(e) =>
                        setLevels(
                          levels.map((l, j) =>
                            j === i ? { ...l, name: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="cf-field">
                    <span>ระดับจากศูนย์ ({displayUnit})</span>
                    <WorkbenchNumberInput ariaLabel={`ระดับ ${level.id}`} unit={displayUnit} precision={preferences.elevationPrecision} value={level.elevation_mm} onChange={value => setLevels(levels.map((l, j) => j === i ? { ...l, elevation_mm: value } : l))} />
                  </label>
                  {level.height_mm !== undefined && (
                    <label className="cf-field">
                      <span>ระยะถึงชั้นถัดไป ({displayUnit})</span>
                      <WorkbenchNumberInput ariaLabel={`ความสูงชั้น ${level.id}`} unit={displayUnit} precision={preferences.lengthPrecision} value={level.height_mm} onChange={value => setLevels(levels.map((l, j) => j === i ? { ...l, height_mm: value } : l))} />
                    </label>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="cf-button cf-button-quiet"
              onClick={() => {
                const ordered = [...levels].sort((a, b) => a.elevation_mm - b.elevation_mm)
                const last = ordered.at(-1)
                const nextIndex = Math.max(0, ...levels.map(level => level.storey_index)) + 1
                let id = `L${nextIndex}`
                while (levels.some(level => level.id === id)) id = `LEVEL-${crypto.randomUUID().slice(0, 8)}`
                const height = last?.height_mm ?? 3000
                setLevels([...levels, {
                  id,
                  name: `ชั้น ${nextIndex}`,
                  elevation_mm: (last?.elevation_mm ?? 0) + height,
                  storey_index: nextIndex,
                  height_mm: height,
                }].sort((a, b) => a.elevation_mm - b.elevation_mm))
              }}
            >+ เพิ่มชั้นบน</button>
          </>
        ) : tab === "drawing" ? (
          <>
            <h3>การช่วยวาดและการแสดงระยะ</h3>
            <p className="cf-help">ตั้งค่าการตอบสนองของแปลนบนเมาส์ ปากกา และหน้าจอสัมผัส · บันทึกไว้ในอุปกรณ์นี้</p>
            <section className="cf-settings-preference-group" aria-label="การช่วยวาด">
              <label className="cf-settings-switch-row">
                <span><strong>Object Snap</strong><small>จับปลายเส้น กึ่งกลาง ขอบ และจุดตัดของวัตถุ</small></span>
                <input aria-label="เปิด Object Snap" type="checkbox" checked={preferences.objectSnapEnabled} onChange={event => setPreference("objectSnapEnabled", event.target.checked)} />
              </label>
              <div className="cf-settings-snap-modes" role="group" aria-label="ตั้งค่าประเภท Object Snap">
                {([['grid', 'กริด'], ['endpoint', 'ปลาย/มุม'], ['midpoint', 'กึ่งกลาง'], ['center', 'ศูนย์กลาง'], ['face', 'ขอบ'], ['centerline', 'แนว'], ['intersection', 'จุดตัด']] as [SnapMode, string][]).map(([mode, label]) =>
                  <button type="button" key={mode} disabled={!preferences.objectSnapEnabled} aria-pressed={preferences.snapModes.includes(mode)} onClick={() => toggleSnapMode(mode)}>{label}</button>)}
              </div>
              <label className="cf-settings-switch-row">
                <span><strong>Realtime Dimension</strong><small>แสดงขนาดชิ้นงานและระยะอ้างอิงขณะวางหรือเคลื่อนย้าย</small></span>
                <input aria-label="แสดงระยะ Real-time" type="checkbox" checked={preferences.realtimeDimensions} onChange={event => setPreference("realtimeDimensions", event.target.checked)} />
              </label>
              <label className="cf-settings-value-row">
                <span><strong>ขั้นมุมเอียงของผนังและคาน</strong><small>ใช้ในโหมดเอียง · เลือกมุมอิสระหรือสแนปเป็นช่วง · จำค่าไว้ในอุปกรณ์นี้</small></span>
                <select aria-label="ขั้นมุมเอียงของผนังและคาน" value={preferences.wallAngleSnapDeg} onChange={event => setPreference("wallAngleSnapDeg", Number(event.target.value) as PlanCanvasPreferences["wallAngleSnapDeg"])}>
                  <option value={0}>อิสระ</option><option value={15}>15°</option><option value={30}>30°</option><option value={45}>45°</option><option value={90}>90°</option>
                </select>
              </label>
              <label className="cf-settings-value-row">
                <span><strong>ระยะและขนาด</strong><small>หน่วยโครงการ: {displayUnit} · ตัวอย่าง {formatLengthMm(12345, displayUnit, preferences.lengthPrecision)} {displayUnit}</small></span>
                <select aria-label="จำนวนตำแหน่งทศนิยมของระยะ" value={preferences.lengthPrecision} onChange={event => setPreference("lengthPrecision", Number(event.target.value))}>
                  {[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value} ตำแหน่ง</option>)}
                </select>
              </label>
              <label className="cf-settings-value-row">
                <span><strong>ระดับอาคาร</strong><small>ตัวอย่าง +{formatLengthMm(12345, displayUnit, preferences.elevationPrecision)} {displayUnit}</small></span>
                <select aria-label="จำนวนตำแหน่งทศนิยมของระดับ" value={preferences.elevationPrecision} onChange={event => setPreference("elevationPrecision", Number(event.target.value))}>
                  {[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value} ตำแหน่ง</option>)}
                </select>
              </label>
              <label className="cf-settings-value-row">
                <span><strong>มุม</strong><small>องศาแบบทศนิยม · ตัวอย่าง {(123.456).toFixed(preferences.anglePrecision)}°</small></span>
                <select aria-label="จำนวนตำแหน่งทศนิยมของมุม" value={preferences.anglePrecision} onChange={event => setPreference("anglePrecision", Number(event.target.value))}>
                  {[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value} ตำแหน่ง</option>)}
                </select>
              </label>
            </section>
            <h3>การแสดงผลแปลน</h3>
            <section className="cf-settings-preference-group" aria-label="การแสดงผลแปลน">
              <label className="cf-settings-switch-row">
                <span><strong>ภาพอ้างอิง</strong><small>แสดง PDF หรือภาพที่ใช้เป็นพื้นหลังสำหรับเขียนทับ</small></span>
                <input aria-label="แสดงภาพอ้างอิง" type="checkbox" checked={preferences.backgroundVisible} onChange={event => setPreference("backgroundVisible", event.target.checked)} />
              </label>
              <label className="cf-settings-switch-row">
                <span><strong>ไม้บรรทัด</strong><small>แสดงพิกัดตามหน่วยโครงการและระดับซูมปัจจุบัน</small></span>
                <input aria-label="แสดงไม้บรรทัด" type="checkbox" checked={preferences.rulersEnabled} onChange={event => setPreference("rulersEnabled", event.target.checked)} />
              </label>
              <label className="cf-settings-switch-row">
                <span><strong>กริดฉากหลัง</strong><small>แสดงเส้นช่วยกะระยะ โดยไม่สร้างวัตถุในโมเดล</small></span>
                <input aria-label="แสดงกริดฉากหลัง" type="checkbox" checked={preferences.gridEnabled} onChange={event => setPreference("gridEnabled", event.target.checked)} />
              </label>
              <label className="cf-settings-value-row">
                <span><strong>ระยะห่างกริด</strong><small>ระยะจริงระหว่างเส้นย่อย · ปรับตามหน่วย {displayUnit}</small></span>
                <WorkbenchNumberInput ariaLabel="ระยะห่างกริด" unit={displayUnit} disabled={!preferences.gridEnabled} value={preferences.gridSpacingMm} onChange={value => setPreference("gridSpacingMm", Math.max(50, Math.min(100000, value)))} />
              </label>
              <label className="cf-settings-value-row">
                <span><strong>เส้นหลักทุก</strong><small>เน้นเส้นกริดหลักทุกจำนวนเส้นย่อยที่กำหนด</small></span>
                <select aria-label="จำนวนเส้นย่อยต่อกริดหลัก" disabled={!preferences.gridEnabled} value={preferences.majorGridEvery} onChange={event => setPreference("majorGridEvery", Number(event.target.value))}>
                  {[2, 4, 5, 10].map(value => <option key={value} value={value}>ทุก {value} เส้น</option>)}
                </select>
              </label>
            </section>
          </>
        ) : (
          <>
            <h3>แผงข้อมูล</h3>
            <label className="cf-field">
              <span>
                <input
                  type="checkbox"
                  checked={inspectorOpen}
                  onChange={(e) => onInspectorChange(e.target.checked)}
                />{" "}
                แสดงแผงคุณสมบัติและปริมาณด้านขวา
              </span>
            </label>
            <p className="cf-help">
              ปรับทันทีในพื้นที่ทำงานนี้ ระดับอาคารและชนิดของชิ้นงานยังคงเดิม
            </p>
            <h3>คีย์ลัดที่ใช้บ่อย</h3>
            <p>W ผนัง · B คาน · D ประตู · N หน้าต่าง · S เลือก</p>
            <p>Space เปลี่ยนแนวอ้างอิงผนัง/คาน หรือกลับทิศประตู</p>
            <p>Ctrl+Z ย้อนกลับ · Ctrl+Y ทำซ้ำ · Esc ยกเลิกการวาด</p>
          </>
        )}
      </div>
      <footer className="cf-dialog-footer">
        <div>
          {error && (
            <p className="cf-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <button className="cf-button cf-button-quiet" onClick={close}>
          ปิด
        </button>
        {tab === "project" && <button className="cf-button cf-button-primary" onClick={save}>บันทึกระดับอาคาร</button>}
      </footer>
    </Dialog>
  );
}
