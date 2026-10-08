import React, { useState } from "react";
import type { ProjectDocument } from "@constructflow/project-model";
import type {
  CommandRequest,
  CommandBatchResult,
} from "@constructflow/command-schema";
import { Dialog } from "./ui/Dialog.js";
export function SettingsModal({
  project,
  onClose,
  onExecute,
  inspectorOpen,
  onInspectorChange,
}: {
  project: ProjectDocument;
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
  const close = () => {
    if (dirty) setPending(true);
    else onClose();
  };
  const save = () => {
    const commands: CommandRequest[] = levels
      .filter(
        (level) =>
          JSON.stringify(level) !==
          JSON.stringify(project.levels.find((l) => l.id === level.id)),
      )
      .map((level) => ({
        name: "UpdateLevel",
        input: {
          id: level.id,
          name: level.name,
          elevation_mm: level.elevation_mm,
          height_mm: level.height_mm,
        },
      }));
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
              ปรับค่าเป็นเมตร ชิ้นงานที่อ้างระดับเหล่านี้จะอัปเดตเมื่อบันทึก ·
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
                    <span>ระดับจากศูนย์ (ม.)</span>
                    <input
                      aria-label={`ระดับ ${level.id}`}
                      type="number"
                      step="0.001"
                      value={level.elevation_mm / 1000}
                      onChange={(e) =>
                        setLevels(
                          levels.map((l, j) =>
                            j === i
                              ? {
                                  ...l,
                                  elevation_mm: Number(e.target.value) * 1000,
                                }
                              : l,
                          ),
                        )
                      }
                    />
                  </label>
                  {level.height_mm !== undefined && (
                    <label className="cf-field">
                      <span>ความสูงชั้น (ม.)</span>
                      <input
                        aria-label={`ความสูงชั้น ${level.id}`}
                        type="number"
                        step="0.001"
                        value={level.height_mm / 1000}
                        onChange={(e) =>
                          setLevels(
                            levels.map((l, j) =>
                              j === i
                                ? {
                                    ...l,
                                    height_mm: Number(e.target.value) * 1000,
                                  }
                                : l,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                </div>
              );
            })}
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
        <button className="cf-button cf-button-primary" onClick={save}>
          บันทึกระดับอาคาร
        </button>
      </footer>
    </Dialog>
  );
}
