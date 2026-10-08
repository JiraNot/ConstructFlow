import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatLengthMm, parseLengthMm, type DisplayLengthUnit } from "@constructflow/project-model";

/** Presentation conversion only. Invalid drafts propagate NaN so commands reject. */
export function WorkbenchNumberInput({ value, onChange, unit, disabled, style, ariaLabel }: {
  value: number | null;
  onChange: (value: number) => void;
  unit?: DisplayLengthUnit;
  disabled?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const format = (v: number | null) => v === null || !Number.isFinite(v) ? "" : formatLengthMm(v, unit ?? "mm");
  const [draft, setDraft] = useState(() => format(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(format(value)); }, [value, unit]);
  const parse = (text: string) => unit
    ? parseLengthMm(text, unit) ?? NaN
    : text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : NaN;
  return <input style={style} type={unit ? "text" : "number"} step="any"
    aria-label={ariaLabel}
    disabled={disabled} value={draft} aria-invalid={!disabled && !Number.isFinite(parse(draft))}
    title={unit ? `หน่วยเริ่มต้น ${unit} · รับ mm, cm หรือ m ต่อท้ายเพื่อระบุหน่วยเอง` : undefined}
    onFocus={() => { focused.current = true; }}
    onChange={e => { setDraft(e.target.value); const next = parse(e.target.value); if (Number.isFinite(next)) onChange(next); }}
    onBlur={() => { focused.current = false; const next = parse(draft); if (Number.isFinite(next)) setDraft(format(next)); }} />;
}
