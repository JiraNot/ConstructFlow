import React, { useMemo, useState } from "react";
import type { ProjectDocument } from "@constructflow/project-model";
import type { CommandRequest } from "@constructflow/command-schema";
import { AlertTriangle, Bot, Check, LoaderCircle, Play, RefreshCw } from "lucide-react";
import { buildAIProjectContext, getAICommandDescriptors } from "../ai/aiCommandCatalog.js";

interface PreviewResult {
  valid: boolean;
  affected_object_ids: string[];
  errors: string[];
}
interface Plan {
  summary: string;
  questions: string[];
  commands: CommandRequest[];
}
interface Props {
  project: ProjectDocument;
  selectedIds: readonly string[];
  onPreview: (commands: CommandRequest[]) => PreviewResult;
  onExecute: (commands: CommandRequest[], actor: "ai") => { status: string; errors?: string[] };
}

const DEFAULT_ENDPOINT = "http://localhost:8000/api/ai/plan";
function loadEndpoint() {
  try {
    return localStorage.getItem("cf-ai-plan-endpoint") || DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

export function AICommandPanel({ project, selectedIds, onPreview, onExecute }: Props) {
  const [endpoint, setEndpoint] = useState(loadEndpoint);
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const descriptors = useMemo(getAICommandDescriptors, []);

  const generate = async () => {
    if (!prompt.trim()) {
      setError("พิมพ์สิ่งที่ต้องการให้ช่วยวางแผนก่อน");
      return;
    }
    if (!endpoint.trim() || !token.trim()) {
      setError("ระบุ URL ของ AI gateway และ token ก่อนส่งคำขอ");
      return;
    }
    if (!descriptors.length) {
      setError("ไม่มีคำสั่งที่ AI ได้รับอนุญาตให้ใช้ใน editor นี้");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setPlan(null);
    setPreview(null);
    try {
      localStorage.setItem("cf-ai-plan-endpoint", endpoint.trim());
      const response = await fetch(endpoint.trim(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.trim()}`,
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          project_context: buildAIProjectContext(project, selectedIds),
          command_descriptors: descriptors,
        }),
      });
      const body = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `AI gateway returned HTTP ${response.status}`);
      if (!Array.isArray(body.commands) || !Array.isArray(body.questions) || typeof body.summary !== "string")
        throw new Error("AI gateway returned an invalid command plan");
      const allowed = new Set(descriptors.filter(descriptor => descriptor.ai_allowed).map(descriptor => descriptor.name));
      const commands = body.commands.map((candidate): CommandRequest => {
        if (!candidate || typeof candidate !== "object") throw new Error("แผนมีคำสั่งที่อ่านไม่ได้");
        const item = candidate as Record<string, unknown>;
        if (typeof item.name !== "string" || !allowed.has(item.name) || !item.input || typeof item.input !== "object" || Array.isArray(item.input))
          throw new Error("แผนมีคำสั่งที่ไม่ได้ลงทะเบียนหรือ input ไม่ถูกต้อง");
        return { name: item.name, input: item.input as Record<string, unknown> };
      });
      const questions = body.questions.filter((question): question is string => typeof question === "string").slice(0, 20);
      const nextPlan = { summary: body.summary, questions, commands };
      setPlan(nextPlan);
      if (commands.length && !questions.length) setPreview(onPreview(commands));
      else setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const recheck = () => {
    if (!plan?.commands.length || plan.questions.length) return;
    setPreview(onPreview(plan.commands));
    setNotice("");
  };

  const apply = () => {
    if (!plan?.commands.length || plan.questions.length) return;
    const currentPreview = onPreview(plan.commands);
    setPreview(currentPreview);
    if (!currentPreview.valid) return;
    const result = onExecute(plan.commands, "ai");
    if (result.status === "success") {
      setNotice(`ใช้แผน AI แล้ว · ${plan.commands.length} คำสั่ง · กดย้อนกลับเพื่อ undo ทั้งชุด`);
      setPlan(null);
      setPreview(null);
    } else {
      setError((result.errors ?? []).join("\n") || "CommandBus ปฏิเสธแผนนี้");
    }
  };

  return (
    <section className="cf-ai-panel" aria-label="ผู้ช่วย AI">
      <header className="cf-ai-header">
        <span className="cf-ai-icon"><Bot size={17} /></span>
        <div><strong>ผู้ช่วย AI</strong><small>ร่างคำสั่ง · ตรวจสอบ · ยืนยัน</small></div>
      </header>
      <label className="cf-ai-field">
        <span>AI gateway URL</span>
        <input aria-label="AI gateway URL" value={endpoint} onChange={event => setEndpoint(event.target.value)} />
      </label>
      <label className="cf-ai-field">
        <span>Gateway token</span>
        <input aria-label="Gateway token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} />
      </label>
      <label className="cf-ai-field cf-ai-prompt">
        <span>ต้องการทำอะไรกับโมเดลนี้?</span>
        <textarea aria-label="คำขอผู้ช่วย AI" rows={5} maxLength={8000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="เช่น เพิ่มผนังยาว 4 เมตรบนชั้นปัจจุบัน จากพิกัด X=0, Y=0" />
      </label>
      <p className="cf-ai-privacy">คำขอจะส่งบริบทระดับ, type และวัตถุในโครงการไปยัง gateway ที่กำหนด token อยู่ในหน่วยความจำชั่วคราวของหน้านี้</p>
      <button className="cf-button cf-button-primary cf-ai-generate" disabled={busy || !prompt.trim()} onClick={() => void generate()}>
        {busy ? <LoaderCircle size={15} className="cf-ai-spin" /> : <Bot size={15} />}
        {busy ? "กำลังร่างแผน…" : "สร้างแผนคำสั่ง"}
      </button>

      {error && <p className="cf-ai-error" role="alert"><AlertTriangle size={15} />{error}</p>}
      {notice && <p className="cf-ai-notice" role="status"><Check size={15} />{notice}</p>}
      {plan && <div className="cf-ai-plan" aria-label="แผนคำสั่ง AI">
        <div className="cf-ai-summary"><strong>ข้อเสนอ</strong><p>{plan.summary}</p></div>
        {plan.questions.length > 0 && <div className="cf-ai-questions"><strong>ต้องการข้อมูลเพิ่มก่อนดำเนินการ</strong><ul>{plan.questions.map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}</ul></div>}
        {plan.commands.length > 0 && <>
          <div className="cf-ai-command-heading"><strong>{plan.commands.length} คำสั่ง</strong><button type="button" className="cf-icon-button" aria-label="ตรวจแผน AI ซ้ำ" onClick={recheck}><RefreshCw size={14} /></button></div>
          <ol className="cf-ai-command-list">{plan.commands.map((command, index) => <li key={`${index}-${command.name}`}><b>{command.name}</b><pre>{JSON.stringify(command.input, null, 2)}</pre></li>)}</ol>
          {preview && <p className={preview.valid ? "cf-ai-valid" : "cf-ai-error"} role="status">
            {preview.valid ? `ผ่าน validation · กระทบ ${preview.affected_object_ids.length} วัตถุ` : preview.errors.join(" · ") || "ไม่ผ่าน validation"}
          </p>}
          <button className="cf-button cf-button-primary cf-ai-apply" disabled={!preview?.valid || plan.questions.length > 0} onClick={apply}>
            <Play size={14} /> ยืนยันและใช้ผ่าน CommandBus
          </button>
          <p className="cf-ai-undo-note">การยืนยันจะบันทึกเป็น transaction เดียวและย้อนกลับได้ด้วย Undo</p>
        </>}
      </div>}
    </section>
  );
}
