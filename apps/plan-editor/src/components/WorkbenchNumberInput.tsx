import { useEffect, useRef, useState, type CSSProperties } from "react";
function parseLengthMm(text: string): number | null {
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|m)?\s*$/i.exec(text);
  if (!match) return null;
  const factor = match[2]?.toLowerCase() === "mm" ? 1 : match[2]?.toLowerCase() === "cm" ? 10 : 1000;
  const value = Number(match[1]) * factor;
  return Number.isFinite(value) ? value : null;
}

/** Presentation conversion only. Invalid drafts propagate NaN so commands reject. */
export function WorkbenchNumberInput({ value, onChange, unit, disabled, style }: {
  value: number | null;
  onChange: (value: number) => void;
  unit?: "mm" | "m";
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const format = (v: number | null) => v === null || !Number.isFinite(v) ? "" : String(v / (unit === "mm" ? 1000 : 1));
  const [draft, setDraft] = useState(() => format(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(format(value)); }, [value, unit]);
  const parse = (text: string) => unit
    ? (parseLengthMm(text) ?? NaN) / (unit === "m" ? 1000 : 1)
    : text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : NaN;
  return <input style={style} type={unit ? "text" : "number"} step="any"
    disabled={disabled} value={draft} aria-invalid={!disabled && !Number.isFinite(parse(draft))}
    title={unit ? "หน่วยเริ่มต้น m · รับ 200mm, 20cm, 0.20m" : undefined}
    onFocus={() => { focused.current = true; }}
    onChange={e => { setDraft(e.target.value); onChange(parse(e.target.value)); }}
    onBlur={() => { focused.current = false; const next = parse(draft); if (Number.isFinite(next)) setDraft(format(next)); }} />;
}
