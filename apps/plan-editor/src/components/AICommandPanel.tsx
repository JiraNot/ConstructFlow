import React, { Suspense, lazy, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ProjectDocument } from "@constructflow/project-model";
import type { CommandRequest } from "@constructflow/command-schema";
import type { DrawingTraceSegment } from "./DrawingEvidencePreview.js";
import { AlertTriangle, Bot, Check, FileText, LoaderCircle, LogIn, LogOut, Paperclip, Play, RefreshCw, X } from "lucide-react";
import { buildAIProjectContext, getAICommandDescriptors } from "../ai/aiCommandCatalog.js";
import { CommandBus } from "../commands/CommandBus.js";
const PdfPagePicker = lazy(() => import("./PdfPagePicker.js").then(module => ({ default: module.PdfPagePicker })));
const ImageDrawingCalibrationModal = lazy(() => import("./ImageDrawingCalibrationModal.js").then(module => ({ default: module.ImageDrawingCalibrationModal })));
const DrawingEvidencePreview = lazy(() => import("./DrawingEvidencePreview.js").then(module => ({ default: module.DrawingEvidencePreview })));

interface PreviewResult {
  valid: boolean;
  affected_object_ids: string[];
  errors: string[];
}
interface Plan {
  summary: string;
  questions: string[];
  commands: CommandRequest[];
  object_evidence: DrawingEvidence[];
  drawing_trace: DrawingTraceSegment[];
}
interface DrawingPage { filename: string; source_page_number: number; sheet_number: string; title: string; view_kind: string; level_label: string; confidence: "high" | "medium" | "low" }
interface DrawingEvidence { command_index: number; filename: string; source_page_number: number; region: [number, number, number, number]; evidence: string; confidence: "high" | "medium" | "low" }
interface ScaleCalibration { filename: string; source_page_number: number; points: [[number, number], [number, number]]; distance_mm: number }
interface DrawingAlignment { filename: string; source_page_number: number; anchor_normalized: [number, number]; target_origin_mm: [number, number]; rotation_deg: number; level_id: string }
interface CommandResult { status: string; affected_object_ids?: string[]; errors?: string[] }
interface AuthStatus { mode: "local" | "gateway"; connected: boolean; email: string; name: string; sharing: boolean }
interface ChatGPTModel { slug: string; display_name: string }
interface DrawingAttachment {
  filename: string;
  mime_type: "application/pdf" | "image/jpeg" | "image/png";
  data_url: string;
  file: File;
  source_page_numbers?: number[];
  scale_calibrations?: ScaleCalibration[];
  drawing_alignments?: DrawingAlignment[];
}

async function getDrawingRequestAttachment(attachment: DrawingAttachment) {
  let dataUrl = attachment.data_url;
  if (attachment.mime_type === "application/pdf" && attachment.source_page_numbers?.length) {
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(await attachment.file.arrayBuffer());
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, attachment.source_page_numbers.map(page => page - 1));
    pages.forEach(page => output.addPage(page));
    const bytes = await output.save();
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    dataUrl = `data:application/pdf;base64,${btoa(binary)}`;
  }
  return {
    filename: attachment.filename,
    mime_type: attachment.mime_type,
    data_url: dataUrl,
    ...(attachment.source_page_numbers?.length ? { source_page_numbers: attachment.source_page_numbers } : {}),
  };
}

function readDrawingFile(file: File): Promise<DrawingAttachment> {
  return new Promise((resolve, reject) => {
    const extension = file.name.toLowerCase().split(".").pop();
    const mimeType = file.type || (extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : "");
    if (!(mimeType === "application/pdf" || mimeType === "image/jpeg" || mimeType === "image/png")) { reject(new Error(`${file.name}: รองรับเฉพาะ PDF, JPG และ PNG`)); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`อ่าน ${file.name} ไม่สำเร็จ`));
    reader.onload = () => {
      const encoded = String(reader.result ?? "").split(",", 2)[1];
      if (!encoded) { reject(new Error(`${file.name}: อ่านข้อมูลไฟล์ไม่ได้`)); return; }
      resolve({ filename: file.name, mime_type: mimeType, data_url: `data:${mimeType};base64,${encoded}`, file });
    };
    reader.readAsDataURL(file);
  });
}
interface Props {
  project: ProjectDocument;
  selectedIds: readonly string[];
  onPreview: (commands: CommandRequest[]) => PreviewResult | Promise<PreviewResult>;
  onExecute: (commands: CommandRequest[], actor: "ai") => CommandResult | Promise<CommandResult>;
}

const AUTH_STATUS_ENDPOINT = "/api/ai/auth/status";
const DEFAULT_ENDPOINT = "/api/ai/plan";
function loadEndpoint() {
  try { return localStorage.getItem("cf-ai-plan-endpoint") || DEFAULT_ENDPOINT; }
  catch { return DEFAULT_ENDPOINT; }
}

export function AICommandPanel({ project, selectedIds, onPreview, onExecute }: Props) {
  const [auth, setAuth] = useState<AuthStatus>({ mode: "local", connected: false, email: "", name: "", sharing: false });
  const [models, setModels] = useState<ChatGPTModel[]>([]);
  const [model, setModel] = useState("");
  const [endpoint, setEndpoint] = useState(loadEndpoint);
  const [gatewayToken, setGatewayToken] = useState("");
  const [authBusy, setAuthBusy] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [drawingAttachments, setDrawingAttachments] = useState<DrawingAttachment[]>([]);
  const [editingPdfIndex, setEditingPdfIndex] = useState<number | null>(null);
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
  const [drawingPages, setDrawingPages] = useState<DrawingPage[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [includedCommandIndexes, setIncludedCommandIndexes] = useState<Set<number>>(new Set());
  const [editingCommandIndex, setEditingCommandIndex] = useState<number | null>(null);
  const [commandEditDraft, setCommandEditDraft] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [traceEdited, setTraceEdited] = useState(false);
  const [proposalStale, setProposalStale] = useState(false);
  const [baselineDrawingTrace, setBaselineDrawingTrace] = useState<DrawingTraceSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const drawingPreviewUrls = useMemo(() => drawingAttachments.map(item => URL.createObjectURL(item.file)), [drawingAttachments]);
  useEffect(() => () => { drawingPreviewUrls.forEach(URL.revokeObjectURL); }, [drawingPreviewUrls]);
  const moduleRevision = useSyncExternalStore(
    listener => CommandBus.subscribeToModules(listener),
    () => CommandBus.getModuleRegistryRevision(),
    () => 0,
  );
  const descriptors = useMemo(getAICommandDescriptors, [moduleRevision]);

  const refreshAuth = async () => {
    const response = await fetch(AUTH_STATUS_ENDPOINT, { cache: "no-store" });
    const status = await response.json() as AuthStatus & { error?: string };
    if (!response.ok) throw new Error(status.error || "ตรวจสอบบัญชี ChatGPT ไม่สำเร็จ");
    setAuth(status);
    if (status.connected && status.sharing) {
      const modelResponse = await fetch("/api/ai/models", { cache: "no-store" });
      const modelBody = await modelResponse.json() as { models?: ChatGPTModel[]; selected_model?: string; error?: string };
      if (!modelResponse.ok) throw new Error(modelBody.error || "โหลดรายการโมเดล ChatGPT ไม่สำเร็จ");
      const availableModels = modelBody.models ?? [];
      const selectedModel = modelBody.selected_model || (availableModels.some(item => item.slug === model) ? model : availableModels[0]?.slug || "");
      setModels(availableModels);
      setModel(selectedModel);
      if (selectedModel && selectedModel !== modelBody.selected_model) {
        const saveModelResponse = await fetch("/api/ai/auth/model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: selectedModel }),
        });
        const saveModelBody = await saveModelResponse.json() as { error?: string };
        if (!saveModelResponse.ok) throw new Error(saveModelBody.error || "บันทึกรุ่นโมเดลเริ่มต้นไม่สำเร็จ");
      }
    } else {
      setModels([]);
      setModel("");
    }
    return status;
  };

  useEffect(() => {
    let active = true;
    void refreshAuth().catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setAuthBusy(false); });
    return () => { active = false; };
  }, []);

  const connect = async () => {
    const popup = window.open("about:blank", "constructflow-chatgpt-signin", "popup,width=560,height=760");
    if (!popup) {
      setError("อนุญาต popup สำหรับ Sign in with ChatGPT แล้วลองอีกครั้ง");
      return;
    }
    setAuthBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ai/auth/start", { method: "POST" });
      const body = await response.json() as { authorization_url?: string; error?: string };
      if (!response.ok || !body.authorization_url) throw new Error(body.error || "เริ่ม Sign in with ChatGPT ไม่สำเร็จ");
      popup.location.href = body.authorization_url;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5 * 60_000) {
        await new Promise(resolve => window.setTimeout(resolve, 1_500));
        const nextAuth = await refreshAuth();
        if (nextAuth.connected) break;
      }
      const responseStatus = await fetch(AUTH_STATUS_ENDPOINT, { cache: "no-store" });
      const nextAuth = await responseStatus.json() as AuthStatus;
      setAuth(nextAuth);
      if (!nextAuth.connected) throw new Error("ยังไม่พบการเชื่อมต่อ ChatGPT ที่เสร็จสมบูรณ์");
      await refreshAuth();
    } catch (cause) {
      popup.close();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAuthBusy(false);
    }
  };

  const disconnect = async () => {
    setAuthBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ai/auth/logout", { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "ออกจากบัญชี ChatGPT ไม่สำเร็จ");
      setAuth({ mode: "local", connected: false, email: "", name: "", sharing: false });
      setModels([]);
      setModel("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAuthBusy(false);
    }
  };

  const chooseModel = async (value: string) => {
    setModel(value);
    try {
      const response = await fetch("/api/ai/auth/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: value }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "บันทึกรุ่นโมเดลไม่สำเร็จ");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const generate = async () => {
    if (!prompt.trim() && !drawingAttachments.length) {
      setError("พิมพ์คำขอหรือแนบแบบที่ต้องการให้ช่วยอ่านก่อน");
      return;
    }
    if (auth.mode === "local" && (!auth.connected || !model)) {
      setError("เชื่อมต่อบัญชี ChatGPT และเลือกรุ่นโมเดลก่อนส่งคำขอ");
      return;
    }
    if (auth.mode === "gateway" && (!endpoint.trim() || !gatewayToken.trim())) {
      setError("ระบุ URL และ token ของ AI gateway ก่อนส่งคำขอ");
      return;
    }
    if (!descriptors.length) {
      setError("ไม่มีคำสั่งที่ AI ได้รับอนุญาตให้ใช้ใน editor นี้");
      return;
    }
    const reviewedTrace = traceEdited ? plan?.drawing_trace ?? [] : [];
    setBusy(true);
    setError("");
    setNotice("");
    setPlan(null);
    setPreview(null);
    setDrawingPages([]);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), drawingAttachments.length ? 120_000 : 55_000);
    try {
      localStorage.setItem("cf-ai-plan-endpoint", endpoint.trim());
      const requestPrompt = prompt.trim() || "อ่าน PDF หรือภาพที่แนบ ระบุหน้า เลขที่แบบ และชั้นของแต่ละแปลน แล้วร่างเฉพาะวัตถุที่มีข้อมูลพอให้กำหนดขนาดจริงได้ ถ้าข้อมูลบางส่วนขาด ให้ถามเฉพาะส่วนนั้นและทำรายการอิสระที่มีข้อมูลครบต่อไป ห้ามเดาระยะหรือแปลงพิกเซลเป็นขนาดจริงโดยไม่มีสเกล";
      const response = await fetch(endpoint.trim(), {
        method: "POST",
        headers: auth.mode === "gateway"
          ? { "Content-Type": "application/json", Authorization: `Bearer ${gatewayToken.trim()}` }
          : { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: requestPrompt,
          project_context: buildAIProjectContext(project, selectedIds),
          command_descriptors: descriptors,
          ...(drawingAttachments.length ? { drawing_attachments: await Promise.all(drawingAttachments.map(getDrawingRequestAttachment)) } : {}),
          scale_calibrations: drawingAttachments.flatMap(attachment => attachment.scale_calibrations ?? []),
          ...(traceEdited ? { drawing_trace_edits: reviewedTrace } : {}),
          drawing_alignments: drawingAttachments.flatMap(attachment => attachment.drawing_alignments ?? []),
          ...(auth.mode === "local" ? { model } : {}),
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
      const evidence = Array.isArray(body.object_evidence) ? body.object_evidence.filter((item): item is DrawingEvidence => !!item && typeof item === "object" && Number.isInteger((item as DrawingEvidence).command_index) && typeof (item as DrawingEvidence).filename === "string" && Number.isInteger((item as DrawingEvidence).source_page_number) && Array.isArray((item as DrawingEvidence).region) && (item as DrawingEvidence).region.length === 4).slice(0, 500) : [];
      const drawingTrace = Array.isArray(body.drawing_trace) ? body.drawing_trace.filter((item): item is DrawingTraceSegment => {
        if (!item || typeof item !== "object") return false;
        const segment = item as DrawingTraceSegment;
        return typeof segment.filename === "string" && Number.isInteger(segment.source_page_number) && (segment.kind === "wall" || segment.kind === "opening") && Array.isArray(segment.points) && segment.points.length === 2 && segment.points.every(point => Array.isArray(point) && point.length === 2 && point.every(axis => typeof axis === "number" && Number.isFinite(axis) && axis >= 0 && axis <= 1)) && ["high", "medium", "low"].includes(segment.confidence);
      }).slice(0, 2000) : [];
      const nextPlan = { summary: body.summary, questions, commands, object_evidence: evidence, drawing_trace: drawingTrace };
      setPlan(nextPlan);
      setBaselineDrawingTrace(drawingTrace);
      setTraceEdited(false);
      setProposalStale(false);
      setIncludedCommandIndexes(new Set(commands.map((_, index) => index)));
      setEditingCommandIndex(null);
      if (commands.length) setPreview(await onPreview(commands));
      else setPreview(null);
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "AbortError"
        ? "รอ AI gateway นานเกินไป กรุณาลองอีกครั้ง"
        : cause instanceof Error ? cause.message : String(cause));
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  };

  const analyzeDrawings = async () => {
    if (!drawingAttachments.length) return;
    setAnalyzing(true); setError(""); setNotice(""); setDrawingPages([]);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const descriptors = getAICommandDescriptors();
      const response = await fetch(endpoint.trim(), {
        method: "POST",
        headers: auth.mode === "gateway" ? { "Content-Type": "application/json", Authorization: `Bearer ${gatewayToken.trim()}` } : { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ prompt: "จัดหมวดหน้าแบบที่แนบ ระบุหน้าแปลนและชั้นจากข้อความบนแบบ", project_context: buildAIProjectContext(project, selectedIds), command_descriptors: descriptors, analysis_only: true, drawing_attachments: await Promise.all(drawingAttachments.map(getDrawingRequestAttachment)), ...(auth.mode === "local" ? { model } : {}) }),
      });
      const body = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `AI gateway returned HTTP ${response.status}`);
      const pages = Array.isArray(body.drawing_pages) ? body.drawing_pages.filter((item): item is DrawingPage => !!item && typeof item === "object" && typeof (item as DrawingPage).filename === "string" && Number.isInteger((item as DrawingPage).source_page_number) && typeof (item as DrawingPage).view_kind === "string") : [];
      setDrawingPages(pages);
      const grouped = new Map<string, number[]>();
      for (const page of pages.filter(item => item.view_kind === "floor_plan" && item.confidence !== "low")) grouped.set(page.filename, [...(grouped.get(page.filename) ?? []), page.source_page_number]);
      const nextAttachments = drawingAttachments.map(attachment => {
        const suggested = grouped.get(attachment.filename);
        if (!suggested?.length) return attachment;
        const nextPages = [...new Set(suggested)].sort((a, b) => a - b);
        const nextCalibrations = (attachment.scale_calibrations ?? []).filter(item => nextPages.includes(item.source_page_number));
        const nextAlignments = (attachment.drawing_alignments ?? []).filter(item => nextPages.includes(item.source_page_number));
        return { ...attachment, source_page_numbers: nextPages, scale_calibrations: nextCalibrations, drawing_alignments: nextAlignments };
      });
      const pageScopeChanged = drawingAttachments.some((attachment, index) => (attachment.source_page_numbers ?? []).join(",") !== (nextAttachments[index].source_page_numbers ?? []).join(","));
      setDrawingAttachments(nextAttachments);
      if (pageScopeChanged) { setProposalStale(true); setPreview(null); }
      setNotice(pages.length ? `AI จัดหมวดได้ ${pages.length} หน้า · เลือกหน้าแปลนที่ความเชื่อมั่นปานกลางขึ้นไปแล้ว ตรวจรายการก่อนสร้างแผน` : "AI ยังไม่พบหน้าแบบที่จัดหมวดได้ กรุณาเลือกหน้าด้วยตนเอง");
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "AbortError" ? "วิเคราะห์หน้าแบบนานเกินไป กรุณาลองอีกครั้ง" : cause instanceof Error ? cause.message : String(cause));
    } finally { window.clearTimeout(timeout); setAnalyzing(false); }
  };

  const recheck = async () => {
    if (!plan?.commands.length || !includedCommandIndexes.size || traceEdited || proposalStale) return;
    setBusy(true);
    try {
      setPreview(await onPreview(commandsWithEvidence(getSelectedPlan(plan))));
      setNotice("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!plan?.commands.length || !includedCommandIndexes.size || traceEdited || proposalStale) return;
    setApplying(true);
    setError("");
    try {
      const selectedPlan = getSelectedPlan(plan);
      const commands = commandsWithEvidence(selectedPlan);
      const currentPreview = await onPreview(commands);
      setPreview(currentPreview);
      if (!currentPreview.valid) return;
      const result = await onExecute(commands, "ai");
      if (result.status === "success") {
        setNotice(`ใช้แผน AI แล้ว · ${selectedPlan.commands.length} คำสั่ง · กดย้อนกลับเพื่อ undo ทั้งชุด`);
        setPlan(null);
        setIncludedCommandIndexes(new Set());
        setPreview(null);
      } else {
        setError((result.errors ?? []).join("\n") || "CommandBus ปฏิเสธแผนนี้");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setApplying(false);
    }
  };

  const getSelectedPlan = (currentPlan: Plan): Plan => {
    const indexes = [...includedCommandIndexes].filter(index => index >= 0 && index < currentPlan.commands.length).sort((a, b) => a - b);
    const remap = new Map(indexes.map((index, nextIndex) => [index, nextIndex]));
    return {
      ...currentPlan,
      commands: indexes.map(index => currentPlan.commands[index]),
      object_evidence: currentPlan.object_evidence.flatMap(item => {
        const command_index = remap.get(item.command_index);
        return command_index === undefined ? [] : [{ ...item, command_index }];
      }),
    };
  };

  const toggleCommand = (index: number, include: boolean) => {
    setIncludedCommandIndexes(current => {
      const next = new Set(current);
      if (include) next.add(index); else next.delete(index);
      return next;
    });
    setPreview(null);
  };

  const moveTracePoint = (traceIndex: number, pointIndex: number, point: [number, number]) => {
    setPlan(current => {
      if (!current || !current.drawing_trace[traceIndex]) return current;
      const drawing_trace = current.drawing_trace.map((segment, index) => {
        if (index !== traceIndex) return segment;
        const points = segment.points.map((currentPoint, currentIndex) => currentIndex === pointIndex ? point : currentPoint) as [[number, number], [number, number]];
        return { ...segment, points };
      });
      return { ...current, drawing_trace };
    });
    setTraceEdited(true);
    setPreview(null);
  };

  const removeTraceSegment = (traceIndex: number) => {
    setPlan(current => current ? { ...current, drawing_trace: current.drawing_trace.filter((_, index) => index !== traceIndex) } : current);
    setTraceEdited(true);
    setPreview(null);
  };

  const restoreAITrace = () => {
    setPlan(current => current ? { ...current, drawing_trace: baselineDrawingTrace } : current);
    setTraceEdited(false);
    setPreview(null);
  };

  const beginCommandEdit = (index: number) => {
    if (!plan) return;
    setEditingCommandIndex(index);
    setCommandEditDraft(JSON.stringify(plan.commands[index].input, null, 2));
    setError("");
  };

  const saveCommandEdit = async () => {
    if (!plan || editingCommandIndex === null) return;
    try {
      const input: unknown = JSON.parse(commandEditDraft);
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("กรอกข้อมูลเป็น JSON object");
      const commands = plan.commands.map((command, index) => index === editingCommandIndex ? { ...command, input: input as Record<string, unknown> } : command);
      const updatedPlan = { ...plan, commands };
      setPlan(updatedPlan);
      setEditingCommandIndex(null);
      setError("");
      setBusy(true);
      setPreview(await onPreview(commandsWithEvidence(getSelectedPlan(updatedPlan))));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ข้อมูลคำสั่งไม่ถูกต้อง");
    } finally {
      setBusy(false);
    }
  };

  const commandsWithEvidence = (currentPlan: Plan): CommandRequest[] => {
    const commands = [...currentPlan.commands];
    const refsByObject = new Map<string, NonNullable<ProjectDocument["objects"][string]["source_refs"]>>();
    currentPlan.object_evidence.forEach(item => {
      const input = currentPlan.commands[item.command_index]?.input as Record<string, unknown> | undefined;
      if (!input || !item.filename || !Number.isInteger(item.source_page_number)) return;
      const objectId = typeof input.id === "string" ? input.id : typeof input.object_id === "string" ? input.object_id : "";
      if (!objectId) return;
      const key = `${item.filename}#${item.source_page_number}`;
      const refs = refsByObject.get(objectId) ?? [...(project.objects[objectId]?.source_refs ?? [])];
      if (!refs.some(ref => ref.kind === "drawing_page" && ref.source_id === key)) refs.push({ kind: "drawing_page", source_id: key, label: item.filename, page_number: item.source_page_number, evidence: item.evidence, confidence: item.confidence });
      refsByObject.set(objectId, refs);
    });
    const groups = new Map<string, string[]>();
    const refsBySignature = new Map<string, NonNullable<ProjectDocument["objects"][string]["source_refs"]>>();
    for (const [id, refs] of refsByObject) {
      const signature = JSON.stringify(refs)
      groups.set(signature, [...(groups.get(signature) ?? []), id]); refsBySignature.set(signature, refs)
    }
    for (const [signature, ids] of groups) commands.push({ name: "UpdateObjectSourceReferences", input: { object_ids: ids, source_refs: refsBySignature.get(signature) ?? [] } } as CommandRequest);
    return commands;
  };

  const updatePdfDrawingSettings = (index: number, pages: number[], calibrations: ScaleCalibration[], alignments?: DrawingAlignment[]) => {
    setDrawingAttachments(current => current.map((attachment, itemIndex) => itemIndex === index
      ? { ...attachment, source_page_numbers: pages.length ? pages : undefined, scale_calibrations: calibrations, drawing_alignments: alignments ?? [] }
      : attachment));
    setProposalStale(true);
    setPreview(null);
  };

  return (
    <section className="cf-ai-panel" aria-label="ผู้ช่วย AI">
      <header className="cf-ai-header">
        <span className="cf-ai-icon"><Bot size={17} /></span>
        <div><strong>ผู้ช่วย AI</strong><small>ร่างคำสั่ง · ตรวจสอบ · ยืนยัน</small></div>
      </header>
      <div className="cf-ai-account" aria-live="polite">
        {auth.mode === "gateway" ? <>
          <span className="cf-ai-account-state">AI gateway</span>
          <label className="cf-ai-field"><span>Gateway URL</span><input aria-label="AI gateway URL" value={endpoint} onChange={event => setEndpoint(event.target.value)} /></label>
          <label className="cf-ai-field"><span>Gateway token</span><input aria-label="Gateway token" type="password" autoComplete="off" value={gatewayToken} onChange={event => setGatewayToken(event.target.value)} /></label>
        </> : auth.connected ? <>
          <span className="cf-ai-account-state"><Check size={14} /> เชื่อมต่อ ChatGPT แล้ว</span>
          <span className="cf-ai-account-email">{auth.name || auth.email}</span>
          <button type="button" className="cf-ai-account-action" disabled={authBusy} onClick={() => void disconnect()}><LogOut size={13} /> ออกจากระบบ</button>
        </> : <>
          <span className="cf-ai-account-state">{authBusy ? "กำลังตรวจสอบการเชื่อมต่อ…" : "ยังไม่ได้เชื่อมต่อ ChatGPT"}</span>
          <button type="button" className="cf-button cf-button-primary cf-ai-login" disabled={authBusy} onClick={() => void connect()}>
            {authBusy ? <LoaderCircle size={14} className="cf-ai-spin" /> : <LogIn size={14} />}
            {authBusy ? "กำลังเชื่อมต่อ…" : "Continue with ChatGPT"}
          </button>
        </>}
      </div>
      {auth.mode === "local" && auth.connected && <label className="cf-ai-field">
        <span>รุ่นโมเดล</span>
        <select aria-label="รุ่นโมเดล ChatGPT" value={model} onChange={event => void chooseModel(event.target.value)}>
          {models.map(item => <option key={item.slug} value={item.slug}>{item.display_name}</option>)}
        </select>
      </label>}
      <label className="cf-ai-field cf-ai-prompt">
        <span>บอกสิ่งที่ต้องการ หรือแนบแบบ PDF/ภาพจากลูกค้า</span>
        <textarea aria-label="คำขอผู้ช่วย AI" rows={4} maxLength={8000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="เช่น อ่านหน้าแปลนชั้นล่างและชั้นบนจาก PDF แล้วร่างโมเดลให้ตรวจ" disabled={auth.mode === "local" && !auth.connected} />
      </label>
      <div className="cf-ai-drawing-attach">
        <label className="cf-button cf-ai-attach-button">
          <Paperclip size={15} /> แนบ PDF หรือภาพแปลน
          <input aria-label="แนบ PDF หรือภาพแปลน" type="file" multiple accept=".pdf,application/pdf,.jpg,.jpeg,image/jpeg,.png,image/png" onChange={event => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (!files.length) return;
            const combinedBytes = [...drawingAttachments.map(item => item.file.size), ...files.map(file => file.size)].reduce((sum, size) => sum + size, 0);
            if (combinedBytes <= 0 || combinedBytes > 20 * 1024 * 1024) { setError("ขนาดไฟล์แบบรวมต้องไม่เกิน 20 MB"); return; }
            if (drawingAttachments.length + files.length > 8) { setError("แนบแบบได้ไม่เกิน 8 ไฟล์ต่อครั้ง"); return; }
            void Promise.all(files.map(readDrawingFile)).then(attachments => {
              setError(""); setPlan(null); setPreview(null);
              setDrawingAttachments(current => [...current, ...attachments]);
            }).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
          }} />
        </label>
        {drawingAttachments.map((attachment, index) => <div className="cf-ai-attached-file" key={`${attachment.filename}-${index}`}>
          {attachment.mime_type.startsWith("image/") ? <img src={drawingPreviewUrls[index]} alt={`ตัวอย่างแบบ ${attachment.filename}`} /> : <FileText size={19} />}
          <span title={attachment.filename}>{attachment.filename}</span>
          {attachment.mime_type === "application/pdf" && <button type="button" className="cf-button cf-ai-pdf-pages" aria-label={`เลือกหน้าใน ${attachment.filename}`} onClick={() => setEditingPdfIndex(index)}>
            {attachment.source_page_numbers?.length ? `${attachment.source_page_numbers.length} หน้า` : "เลือกหน้า"}
          </button>}
          {attachment.mime_type !== "application/pdf" && <button type="button" className="cf-button cf-ai-pdf-pages" aria-label={`ปรับสเกลภาพ ${attachment.filename}`} onClick={() => setEditingImageIndex(index)}>{attachment.scale_calibrations?.filter(item => item.source_page_number === 1).length ? `สเกล ${attachment.scale_calibrations.filter(item => item.source_page_number === 1).length} ระยะ` : "ปรับสเกล"}</button>}
          <button type="button" className="cf-icon-button" aria-label={`เอา ${attachment.filename} ออก`} onClick={() => { setDrawingAttachments(current => current.filter((_, itemIndex) => itemIndex !== index)); setPlan(null); setPreview(null); setTraceEdited(false); setProposalStale(false); }}><X size={15} /></button>
        </div>)}
      </div>
      {drawingAttachments.some(attachment => attachment.mime_type === "application/pdf") && <p className="cf-ai-privacy">เลือกเฉพาะหน้าแปลนจาก PDF ได้ · ถ้าไม่เลือกจะส่งทั้งเล่ม และ AI จะถามเมื่อแยกชั้นไม่ชัด</p>}
      <p className="cf-ai-privacy">{auth.mode === "local" ? "ใช้ ChatGPT plan ที่คุณอนุญาต · ไฟล์จะส่งเมื่อกดสร้างแผน · token เก็บในเครื่อง" : "คำขอและไฟล์ที่แนบจะส่งไปยัง AI gateway ที่กำหนดเมื่อกดสร้างแผน"}</p>
      {drawingAttachments.length > 0 && <button type="button" className="cf-button cf-ai-generate" disabled={busy || analyzing || applying || (auth.mode === "local" && (!auth.connected || !model)) || (auth.mode === "gateway" && (!gatewayToken.trim() || !endpoint.trim()))} onClick={() => void analyzeDrawings()}>
        {analyzing ? <LoaderCircle size={15} className="cf-ai-spin" /> : <FileText size={15} />}
        {analyzing ? "กำลังแยกหน้าแบบ…" : "AI วิเคราะห์และเลือกหน้าแปลน"}
      </button>}
      {drawingPages.length > 0 && <div className="cf-ai-drawing-pages" aria-label="ผลจัดหมวดหน้าแบบ">
        <strong>หน้าแบบที่ AI อ่านได้</strong>
        {drawingPages.map((page, index) => <div key={`${page.filename}-${page.source_page_number}-${index}`}><span>{page.filename} · หน้า {page.source_page_number}</span><small>{[page.sheet_number, page.title, page.level_label].filter(Boolean).join(" · ") || page.view_kind} · {page.view_kind === "floor_plan" ? "แปลน" : page.view_kind} · มั่นใจ{page.confidence === "high" ? "สูง" : page.confidence === "medium" ? "ปานกลาง" : "ต่ำ"}</small></div>)}
      </div>}
      <button className="cf-button cf-button-primary cf-ai-generate" disabled={busy || analyzing || applying || (auth.mode === "local" && (!auth.connected || !model)) || (auth.mode === "gateway" && (!gatewayToken.trim() || !endpoint.trim())) || (!prompt.trim() && !drawingAttachments.length)} onClick={() => void generate()}>
        {busy ? <LoaderCircle size={15} className="cf-ai-spin" /> : <Bot size={15} />}
        {busy ? "กำลังร่างแผน…" : traceEdited ? "สร้างคำสั่งจากร่างที่แก้" : proposalStale ? "อัปเดตคำสั่งด้วยสเกลใหม่" : "สร้างแผนคำสั่ง"}
      </button>

      {error && <p className="cf-ai-error" role="alert"><AlertTriangle size={15} />{error}</p>}
      {notice && <p className="cf-ai-notice" role="status"><Check size={15} />{notice}</p>}
      {plan && <div className="cf-ai-plan" aria-label="แผนคำสั่ง AI">
        <div className="cf-ai-summary"><strong>ข้อเสนอ</strong><p>{plan.summary}</p></div>
        {plan.questions.length > 0 && <div className="cf-ai-questions"><strong>ข้อมูลที่ยังขาด · รายการอื่นทำต่อได้</strong><ul>{plan.questions.map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}</ul><small>คำถามเหล่านี้ไม่หยุดรายการที่มีข้อมูลครบ ตรวจ preview และยืนยันเฉพาะรายการที่ผ่าน validation ได้</small></div>}
        {plan.commands.length > 0 && <>
          <div className="cf-ai-command-heading"><strong>ตรวจ {includedCommandIndexes.size}/{plan.commands.length} รายการ</strong><button type="button" className="cf-icon-button" aria-label="ตรวจแผน AI ซ้ำ" disabled={busy || traceEdited || proposalStale || !includedCommandIndexes.size} onClick={recheck}><RefreshCw size={14} /></button></div>
          <ol className="cf-ai-command-list">{plan.commands.map((command, index) => <li key={`${index}-${command.name}`} className={includedCommandIndexes.has(index) ? "" : "is-skipped"}>
            <div className="cf-ai-command-item-heading"><label><input type="checkbox" checked={includedCommandIndexes.has(index)} onChange={event => toggleCommand(index, event.currentTarget.checked)} /> รวมรายการนี้</label><b>{command.name}</b><button type="button" className="cf-button cf-ai-command-edit" onClick={() => editingCommandIndex === index ? setEditingCommandIndex(null) : beginCommandEdit(index)}>{editingCommandIndex === index ? "ปิด" : "แก้"}</button></div>
            {editingCommandIndex === index ? <div className="cf-ai-command-editor"><label htmlFor={`cf-ai-command-${index}`}>แก้พารามิเตอร์รายการนี้</label><textarea id={`cf-ai-command-${index}`} value={commandEditDraft} onChange={event => setCommandEditDraft(event.target.value)} spellCheck={false} /><button type="button" className="cf-button cf-button-primary" disabled={busy} onClick={() => void saveCommandEdit()}>บันทึกและตรวจใหม่</button></div> : <pre>{JSON.stringify(command.input, null, 2)}</pre>}
          </li>)}</ol>
          {plan.object_evidence.some(item => includedCommandIndexes.has(item.command_index)) && <div className="cf-ai-evidence">
            <strong>หลักฐานจากแบบ</strong>
            {plan.object_evidence.filter(item => includedCommandIndexes.has(item.command_index)).map(item => <div key={`${item.command_index}-${item.filename}-${item.source_page_number}`}><span>คำสั่ง {item.command_index + 1} · {item.filename} · หน้า {item.source_page_number}</span><small>{item.evidence || "AI ระบุบริเวณอ้างอิงไว้ให้ตรวจ"} · มั่นใจ{item.confidence === "high" ? "สูง" : item.confidence === "medium" ? "ปานกลาง" : "ต่ำ"}</small></div>)}
            {[...new Map(plan.object_evidence.filter(item => includedCommandIndexes.has(item.command_index)).map(item => [`${item.filename}#${item.source_page_number}`, { filename: item.filename, page: item.source_page_number, regions: plan.object_evidence.filter(candidate => includedCommandIndexes.has(candidate.command_index) && candidate.filename === item.filename && candidate.source_page_number === item.source_page_number).map(candidate => ({ region: candidate.region, label: `คำสั่ง ${candidate.command_index + 1}` })) }])).values()].map(group => {
              const attachment = drawingAttachments.find(candidate => candidate.filename === group.filename)
              return attachment ? <Suspense key={`${group.filename}-${group.page}`} fallback={<small>กำลังเปิดภาพอ้างอิง…</small>}><DrawingEvidencePreview file={attachment.file} pageNumber={group.page} regions={group.regions} /></Suspense> : null
            })}
          </div>}
        </>}
          {plan.drawing_trace.length > 0 && <div className="cf-ai-trace-review">
            <strong>ร่างเส้นจากแบบ · {plan.drawing_trace.length} เส้น</strong>
            <small>เส้นนี้ยังอยู่ในพิกัดภาพ ไม่ใช่ขนาดจริง · ตั้งสเกลจากระยะที่ทราบก่อนสร้างโมเดล</small>
            <small>ลากจุดปลายเพื่อแก้แนวผนังหรือช่องเปิด; ใช้ปุ่มลูกศรเมื่อเลือกจุดอยู่ (Shift + ลูกศรขยับทีละมากขึ้น)</small>
            {traceEdited && <button type="button" className="cf-button" onClick={restoreAITrace}>คืนร่างจาก AI</button>}
            <ol className="cf-ai-trace-list">{plan.drawing_trace.map((segment, index) => <li key={`${segment.filename}-${segment.source_page_number}-${index}`}><span>{segment.kind === "wall" ? "ผนัง" : "ช่องเปิด"} · {segment.filename} หน้า {segment.source_page_number} · มั่นใจ{segment.confidence === "high" ? "สูง" : segment.confidence === "medium" ? "ปานกลาง" : "ต่ำ"}</span><button type="button" className="cf-button" aria-label={`ลบแนว${segment.kind === "wall" ? "ผนัง" : "ช่องเปิด"} ${index + 1}`} onClick={() => removeTraceSegment(index)}>ลบเส้น</button></li>)}</ol>
            {[...new Map(plan.drawing_trace.map((segment, index) => [`${segment.filename}#${segment.source_page_number}`, { filename: segment.filename, page: segment.source_page_number, segments: plan.drawing_trace.flatMap((candidate, traceIndex) => candidate.filename === segment.filename && candidate.source_page_number === segment.source_page_number ? [{ segment: candidate, traceIndex }] : []) }])).values()].map(group => {
              const attachment = drawingAttachments.find(candidate => candidate.filename === group.filename)
              return attachment ? <Suspense key={`${group.filename}-${group.page}`} fallback={<small>กำลังเปิดร่างเส้น…</small>}><DrawingEvidencePreview file={attachment.file} pageNumber={group.page} regions={[]} trace={group.segments} onTracePointChange={moveTracePoint} /></Suspense> : null
            })}
            {traceEdited && <p className="cf-ai-trace-edited">มีการแก้ร่างแล้ว · สร้างคำสั่งใหม่จากเส้นนี้เพื่อตรวจ preview ก่อนยืนยัน</p>}
          </div>}
          {traceEdited && plan.drawing_trace.length === 0 && <div className="cf-ai-trace-review"><p className="cf-ai-trace-edited">ลบแนวร่างทั้งหมดแล้ว</p><button type="button" className="cf-button" onClick={restoreAITrace}>คืนร่างจาก AI</button></div>}
          {proposalStale && <p className="cf-ai-trace-edited">สเกล ตำแหน่ง หรือหน้าที่เลือกเปลี่ยนแล้ว · สร้างข้อเสนอใหม่ก่อนยืนยัน</p>}
        {plan.commands.length > 0 && <>
          {preview && <p className={preview.valid ? "cf-ai-valid" : "cf-ai-error"} role="status">
            {preview.valid ? `ผ่าน validation · กระทบ ${preview.affected_object_ids.length} วัตถุ` : preview.errors.join(" · ") || "ไม่ผ่าน validation"}
          </p>}
          <button className="cf-button cf-button-primary cf-ai-apply" disabled={!preview?.valid || !includedCommandIndexes.size || traceEdited || proposalStale || busy || applying} onClick={() => void apply()}>
            <Play size={14} /> {applying ? "กำลังตรวจสอบและใช้คำสั่ง…" : plan.questions.length ? "ยืนยันรายการที่ผ่าน · ใช้ผ่าน CommandBus" : "ยืนยันและใช้ผ่าน CommandBus"}
          </button>
          <p className="cf-ai-undo-note">การยืนยันจะบันทึกเป็น transaction เดียวและย้อนกลับได้ด้วย Undo</p>
        </>}
      </div>}
      {editingPdfIndex !== null && drawingAttachments[editingPdfIndex] && <Suspense fallback={<p role="status" className="cf-ai-privacy">กำลังเปิดตัวเลือกหน้า PDF…</p>}><PdfPagePicker
        file={drawingAttachments[editingPdfIndex].file}
        selectedPages={drawingAttachments[editingPdfIndex].source_page_numbers}
        suggestedPages={drawingPages.filter(page => page.filename === drawingAttachments[editingPdfIndex!]?.filename && page.view_kind === "floor_plan" && page.confidence !== "low").map(page => page.source_page_number)}
        scaleCalibrations={drawingAttachments[editingPdfIndex].scale_calibrations}
        alignments={drawingAttachments[editingPdfIndex].drawing_alignments}
        levels={project.levels.map(({ id, name }) => ({ id, name }))}
        onClose={() => setEditingPdfIndex(null)}
        onUpdate={(pages, calibrations, alignments) => updatePdfDrawingSettings(editingPdfIndex, pages, calibrations, alignments)}
        onConfirm={(pages, calibrations, alignments) => {
          const currentAttachment = drawingAttachments[editingPdfIndex];
          const currentPages = currentAttachment.source_page_numbers?.join(",") ?? "*";
          const nextPages = pages.length ? pages.join(",") : "*";
          updatePdfDrawingSettings(editingPdfIndex, pages, calibrations, alignments)
          setEditingPdfIndex(null)
          if (currentPages !== nextPages) { setPlan(null); setTraceEdited(false); setProposalStale(false); }
        }}
      /></Suspense>}
      {editingImageIndex !== null && drawingAttachments[editingImageIndex] && <Suspense fallback={<p role="status" className="cf-ai-privacy">กำลังเปิดเครื่องมือปรับสเกลภาพ…</p>}><ImageDrawingCalibrationModal
        file={drawingAttachments[editingImageIndex].file}
        calibrations={drawingAttachments[editingImageIndex].scale_calibrations?.filter(item => item.source_page_number === 1)}
        alignment={drawingAttachments[editingImageIndex].drawing_alignments?.find(item => item.source_page_number === 1)}
        levels={project.levels.map(({ id, name }) => ({ id, name }))}
        onClose={() => setEditingImageIndex(null)}
        onConfirm={(calibrations, alignment) => {
          setDrawingAttachments(current => current.map((attachment, index) => index === editingImageIndex ? {
            ...attachment,
            scale_calibrations: [...(attachment.scale_calibrations ?? []).filter(item => item.source_page_number !== 1), ...calibrations],
            drawing_alignments: [...(attachment.drawing_alignments ?? []).filter(item => item.source_page_number !== 1), ...(alignment ? [alignment] : [])],
          } : attachment));
          setEditingImageIndex(null);
          setProposalStale(true);
          setPreview(null);
        }}
      /></Suspense>}
    </section>
  );
}
