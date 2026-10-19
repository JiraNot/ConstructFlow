import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { scaleReferenceSpreadPercent } from "../ai/calibrationConsistency.js";

type ScaleCalibration = { filename: string; source_page_number: number; points: [[number, number], [number, number]]; distance_mm: number };
type DrawingAlignment = { filename: string; source_page_number: number; anchor_normalized: [number, number]; target_origin_mm: [number, number]; rotation_deg: number; level_id: string };

interface Props {
  file: File;
  calibrations?: ScaleCalibration[];
  alignment?: DrawingAlignment;
  levels: Array<{ id: string; name: string }>;
  onClose: () => void;
  onConfirm: (calibrations: ScaleCalibration[], alignment: DrawingAlignment | undefined) => void;
}

export function ImageDrawingCalibrationModal({ file, calibrations = [], alignment, levels, onClose, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"scale" | "align">("scale");
  const [points, setPoints] = useState<Array<[number, number]>>([]);
  const [distance, setDistance] = useState("");
  const [targetX, setTargetX] = useState("0");
  const [targetY, setTargetY] = useState("0");
  const [rotation, setRotation] = useState("0");
  const [levelId, setLevelId] = useState(alignment?.level_id || levels[0]?.id || "");
  const [imageError, setImageError] = useState("");
  const [savedCalibrations, setSavedCalibrations] = useState(calibrations);
  const [imageSize, setImageSize] = useState<[number, number]>([0, 0]);
  const scaleSpread = scaleReferenceSpreadPercent(savedCalibrations, imageSize[0], imageSize[1]);

  useEffect(() => {
    let active = true;
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      if (!active) return;
      setImageSize([image.naturalWidth, image.naturalHeight]);
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const scale = Math.min(1100 / image.naturalWidth, 650 / image.naturalHeight, 1);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.drawImage(image, 0, 0, width, height);
    };
    image.onerror = () => { if (active) setImageError("เปิดภาพเพื่อปรับสเกลไม่ได้"); };
    image.src = url;
    return () => { active = false; URL.revokeObjectURL(url); };
  }, [file]);

  const capturePoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const point: [number, number] = [Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))];
    setPoints(current => mode === "scale" ? current.length === 2 ? [point] : [...current, point] : [point]);
  };

  const save = () => {
    if (mode === "scale") {
      if (points.length !== 2 || Number(distance) <= 0) return;
      onConfirm([...savedCalibrations, { filename: file.name, source_page_number: 1, points: points as [[number, number], [number, number]], distance_mm: Number(distance) }], alignment);
      return;
    }
    if (points.length !== 1 || !levelId || !targetX.trim() || !targetY.trim() || !rotation.trim()) return;
    onConfirm(savedCalibrations, { filename: file.name, source_page_number: 1, anchor_normalized: points[0], target_origin_mm: [Number(targetX), Number(targetY)], rotation_deg: Number(rotation), level_id: levelId });
  };

  return <div className="cf-pdf-calibration-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="cf-pdf-calibration cf-image-calibration" role="dialog" aria-modal="true" aria-label="ปรับสเกลและตำแหน่งภาพแปลน">
      <header><div><strong>ปรับภาพแปลน</strong><small>{file.name} · กำหนดสเกลจากระยะที่คุณทราบ แล้วให้ AI คำนวณส่วนอื่นต่อ</small></div><button type="button" className="cf-icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><X size={18} /></button></header>
      <div className="cf-image-calibration-tabs" role="tablist" aria-label="วิธีปรับภาพ"><button type="button" role="tab" aria-selected={mode === "scale"} onClick={() => { setMode("scale"); setPoints([]); }}>ตั้งสเกล</button><button type="button" role="tab" aria-selected={mode === "align"} onClick={() => { setMode("align"); setPoints(alignment ? [alignment.anchor_normalized] : []); setTargetX(String(alignment?.target_origin_mm[0] ?? 0)); setTargetY(String(alignment?.target_origin_mm[1] ?? 0)); setRotation(String(alignment?.rotation_deg ?? 0)); setLevelId(alignment?.level_id || levels[0]?.id || ""); }}>จัดตำแหน่ง</button></div>
      <p>{mode === "scale" ? "แตะจุดปลายทั้งสองด้านของระยะที่คุณรู้ค่า เช่น ระยะระหว่างแนวเสา แล้วกรอกระยะจริง" : "แตะจุดที่จะใช้อ้างอิง แล้วกรอกพิกัด X/Y และชั้นปลายทาง"}</p>
      <div className="cf-pdf-calibration-page cf-image-calibration-canvas"><canvas ref={canvasRef} onPointerDown={capturePoint} />{points.map((point, index) => <i key={`${mode}-${index}`} style={{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }}>{mode === "scale" ? index + 1 : "จุด"}</i>)}</div>
      {imageError && <p className="cf-ai-error" role="alert">{imageError}</p>}
      {mode === "scale" ? <><label>ระยะจริง (มม.)<input aria-label="ระยะจริง (มม.)" type="number" min="1" value={distance} onChange={event => setDistance(event.target.value)} placeholder="เช่น 4000" /></label>{scaleSpread !== null && scaleSpread > 3 && <p className="cf-ai-questions" role="status">ระยะอ้างอิงให้สเกลต่างกัน {scaleSpread.toFixed(1)}% · ตรวจจุดที่เลือกและภาพบิดก่อนใช้ร่วมกัน</p>}{savedCalibrations.length > 0 && <div className="cf-image-scale-references"><strong>ระยะอ้างอิงที่บันทึกแล้ว</strong>{savedCalibrations.map((item, index) => <div key={`${item.distance_mm}-${index}`}><span>#{index + 1} · {item.distance_mm.toLocaleString()} มม.</span><button type="button" className="cf-button" onClick={() => { const next = savedCalibrations.filter((_, itemIndex) => itemIndex !== index); setSavedCalibrations(next); onConfirm(next, alignment); }}>ลบ</button></div>)}</div>}</> : <div className="cf-pdf-alignment-fields"><label>พิกัด X (มม.)<input aria-label="พิกัด X (มม.)" type="number" value={targetX} onChange={event => setTargetX(event.target.value)} /></label><label>พิกัด Y (มม.)<input aria-label="พิกัด Y (มม.)" type="number" value={targetY} onChange={event => setTargetY(event.target.value)} /></label><label>หมุน (องศา)<input aria-label="หมุน (องศา)" type="number" value={rotation} onChange={event => setRotation(event.target.value)} /></label><label>ชั้น<select aria-label="ชั้น" value={levelId} onChange={event => setLevelId(event.target.value)}>{levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label></div>}
      <footer><button type="button" className="cf-button" onClick={onClose}>ยกเลิก</button><button type="button" className="cf-button cf-button-primary" disabled={mode === "scale" ? points.length !== 2 || (points[0]?.[0] === points[1]?.[0] && points[0]?.[1] === points[1]?.[1]) || Number(distance) <= 0 : points.length !== 1 || !levelId || !targetX.trim() || !targetY.trim() || !rotation.trim() || !Number.isFinite(Number(targetX)) || !Number.isFinite(Number(targetY)) || !Number.isFinite(Number(rotation))} onClick={save}>{mode === "scale" ? savedCalibrations.length ? "เพิ่มระยะอ้างอิง" : "ใช้สเกลนี้" : "ใช้ตำแหน่งนี้"}</button></footer>
    </section>
  </div>;
}
