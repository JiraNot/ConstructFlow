import React from "react";
import type { DisplayLengthUnit, TypeDefinition } from "@constructflow/project-model";
import { BookOpen } from "lucide-react";
import {
  TypeThumbnail,
  typeDescription,
  typeSizeLabel,
} from "./catalogPresentation.js";
export function TypePicker({
  types,
  value,
  onChange,
  onOpenCatalog,
  label,
  displayUnit = "m",
}: {
  types: TypeDefinition[];
  value: string;
  onChange: (name: string) => void;
  onOpenCatalog: () => void;
  label: string;
  displayUnit?: DisplayLengthUnit;
}) {
  const type = types.find((t) => t.name === value);
  return (
    <div className="cf-type-picker">
      {type && (
        <div className="cf-picker-thumbnail">
          <TypeThumbnail type={type} />
        </div>
      )}
      <label className="cf-field">
        <span>ชนิด{label}ที่จะวาง</span>
        <select
          aria-label={`ชนิด${label}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {!type && <option value={value}>{value} · ไม่พบชนิดในโครงการ</option>}
          {types.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name} · {typeDescription(t)} · {typeSizeLabel(t, displayUnit)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="cf-button cf-button-quiet"
        onClick={onOpenCatalog}
      >
        <BookOpen size={16} />
        คลังชนิด
      </button>
    </div>
  );
}
