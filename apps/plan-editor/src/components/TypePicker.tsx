import React, { useRef, useState } from "react";
import type { DisplayLengthUnit, TypeDefinition } from "@constructflow/project-model";
import { BookOpen, Check, ChevronDown, Search, X } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const type = types.find((t) => t.name === value);
  const search = query.trim().toLocaleLowerCase();
  const searchTypes = types.filter((candidate) =>
    !search ||
    `${candidate.name} ${typeDescription(candidate)} ${typeSizeLabel(candidate, displayUnit)}`
      .toLocaleLowerCase()
      .includes(search),
  );
  const visibleTypes = searchTypes.some(candidate => candidate.name === value)
    ? searchTypes
    : type ? [type, ...searchTypes] : searchTypes;
  const isOpening = label === "ประตู" || label === "หน้าต่าง";

  if (isOpening) {
    return (
      <OpeningTypePicker
        types={types}
        value={value}
        selectedType={type}
        visibleTypes={searchTypes}
        label={label}
        displayUnit={displayUnit}
        query={query}
        onQueryChange={setQuery}
        onChange={onChange}
        onOpenCatalog={onOpenCatalog}
      />
    );
  }

  return (
    <div className="cf-type-picker">
      {type && (
        <div className="cf-picker-thumbnail">
          <TypeThumbnail type={type} />
        </div>
      )}
      <label className="cf-field">
        <span className="cf-type-picker-current-summary" title={type ? `${type.name} · ${typeSizeLabel(type, displayUnit)}` : `ชนิด${label}ที่จะวาง`}>
          {type ? `${type.name} · ${typeSizeLabel(type, displayUnit)}` : `ชนิด${label}ที่จะวาง`}
        </span>
        <div className="cf-type-search-row">
          <input
            aria-label={`ค้นหาในคลังชนิด ${label}`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ / วัสดุ / ขนาด"
          />
          <select
            aria-label={`ชนิด${label}`}
            title={type ? `${type.name} · ${typeDescription(type)} · ${typeSizeLabel(type, displayUnit)}` : `เลือกชนิด${label}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            {!type && <option value={value}>{value} · ไม่พบชนิดในโครงการ</option>}
            {visibleTypes.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
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

function OpeningTypePicker({
  types,
  value,
  selectedType,
  visibleTypes,
  label,
  displayUnit,
  query,
  onQueryChange,
  onChange,
  onOpenCatalog,
}: {
  types: TypeDefinition[];
  value: string;
  selectedType: TypeDefinition | undefined;
  visibleTypes: TypeDefinition[];
  label: string;
  displayUnit: DisplayLengthUnit;
  query: string;
  onQueryChange: (value: string) => void;
  onChange: (name: string) => void;
  onOpenCatalog: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openPicker = () => {
    onQueryChange("");
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      // Keep the canvas interactive and visible behind the chooser, like the editor's
      // contextual library panel. Selection immediately returns to placement mode.
      dialog.show();
      setIsOpen(true);
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  };

  const closePicker = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
  };

  const chooseType = (candidate: TypeDefinition) => {
    onChange(candidate.name);
    closePicker();
  };

  return (
    <div className="cf-opening-type-picker">
      <div className="cf-opening-type-current-wrap">
        <span className="cf-opening-type-label">ชนิด{label}ที่จะวาง</span>
        <button
          type="button"
          className="cf-opening-type-current"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={openPicker}
        >
          {selectedType ? (
            <span className="cf-opening-current-thumbnail">
              <TypeThumbnail type={selectedType} />
            </span>
          ) : (
            <span className="cf-opening-current-placeholder" aria-hidden="true">＋</span>
          )}
          <span className="cf-opening-current-copy">
            <strong>{selectedType?.name || value || `เลือก${label}`}</strong>
            <small>{selectedType ? typeSizeLabel(selectedType, displayUnit) : "เลือกแบบจากคลังเพื่อเริ่มวาง"}</small>
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="cf-button cf-button-quiet cf-opening-catalog-button"
        onClick={onOpenCatalog}
      >
        <BookOpen size={16} />
        คลังชนิด
      </button>

      <dialog
        ref={dialogRef}
        className="cf-opening-picker-dialog"
        aria-labelledby="cf-opening-picker-title"
        onClose={() => setIsOpen(false)}
        onClick={event => {
          if (event.target === event.currentTarget) closePicker();
        }}
      >
        <header className="cf-opening-picker-header">
          <div>
            <h2 id="cf-opening-picker-title">เลือก{label}</h2>
            <p>เลือกแบบ แล้วแตะผนังเพื่อวางต่อได้ทันที</p>
          </div>
          <button type="button" aria-label="ปิดคลังแบบ" onClick={closePicker}>
            <X size={20} />
          </button>
        </header>
        <label className="cf-opening-picker-search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="ค้นหาชื่อ รูปแบบ หรือขนาด"
            aria-label={`ค้นหาแบบ${label}`}
          />
          {query && <button type="button" aria-label="ล้างคำค้น" onClick={() => { onQueryChange(""); searchInputRef.current?.focus(); }}><X size={16} /></button>}
        </label>
        <div className="cf-opening-picker-results">
          <div className="cf-opening-picker-count" aria-live="polite">
            {query ? `พบ ${visibleTypes.length} แบบ` : `แบบ${label}ทั้งหมด ${types.length} แบบ`}
          </div>
          <div className="cf-opening-picker-grid" role="list" aria-label={`แบบ${label}ในคลัง`}>
            {visibleTypes.map(candidate => {
              const selected = candidate.name === value;
              return (
                <button
                  type="button"
                  role="listitem"
                  key={candidate.id}
                  className={`cf-opening-picker-card${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => chooseType(candidate)}
                >
                  <span className="cf-opening-picker-card-art"><TypeThumbnail type={candidate} /></span>
                  <span className="cf-opening-picker-card-title">
                    <strong>{candidate.name}</strong>
                    {selected && <span className="cf-opening-picker-selected"><Check size={13} /> ใช้อยู่</span>}
                  </span>
                  <span className="cf-opening-picker-card-size">{typeSizeLabel(candidate, displayUnit)}</span>
                  <span className="cf-opening-picker-card-description">{typeDescription(candidate)}</span>
                </button>
              );
            })}
            {!visibleTypes.length && (
              <div className="cf-opening-picker-empty">
                <strong>ไม่พบแบบ{label}</strong>
                <span>ลองค้นหาด้วยชื่อ รูปแบบการเปิด หรือขนาด</span>
              </div>
            )}
          </div>
        </div>
        <footer className="cf-opening-picker-footer">
          <span>แตะรายการเพื่อเลือก · การวางยังอยู่ในโหมด{label}</span>
          <button type="button" onClick={closePicker}>ปิด</button>
        </footer>
      </dialog>
    </div>
  );
}
