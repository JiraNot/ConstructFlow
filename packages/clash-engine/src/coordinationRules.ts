// ConstructFlow Coordination Rule Dataset (data, not code)
//
// Clash rules are versioned data: every rule carries its jurisdiction, source, edition, effective
// date and basis so an engineer can audit *why* a finding exists. Values that are engineering
// defaults (not code text) are marked `basis: 'engineering_default'` and can be overridden per
// project without touching the engine. Prices and material factors deliberately stay out of the
// clash engine: this dataset holds geometry/clearance requirements only.

import type {
  CoordinationRuleBasis,
  CoordinationRuleOverride,
  CoordinationSeverity,
  CoordinationSettings,
} from '@constructflow/project-model'
import type { CoordinationRole } from './coordinationModel.js'

/** Severity vocabulary is shared with project storage so overrides round-trip untouched. */
export type ClashSeverity = CoordinationSeverity

/** Where a requirement comes from; `project_override` marks values changed for one project. */
export type RuleBasis = CoordinationRuleBasis

export type CoordinationCategory =
  | 'structure'
  | 'mep'
  | 'architecture'
  | 'interior'
  | 'electrical'
  | 'demolition'
  | 'coordination'

export interface ClashSubject {
  role: CoordinationRole[]
  /** Optional narrowing by exact object family. */
  families?: string[]
  /** Optional narrowing by instance discriminator (for example `light`, `soil`). */
  kinds?: string[]
  /** Which solid set of the proxy to test. */
  solids?: 'primary' | 'door_swing'
  label_th: string
}

export type RulePredicate =
  /** Both solids overlap; `min_overlap_mm` filters hairline contacts. */
  | { type: 'intersects'; min_overlap_mm?: number }
  /** Free space between the two subjects must be at least `required_mm`. */
  | { type: 'clearance_below'; required_mm: number }
  /** Two openings hosted on the same wall must keep `required_mm` of framing between them. */
  | { type: 'opening_spacing_below'; required_mm: number }
  /** A host element is removed during demolition while a dependent object stays active. */
  | { type: 'dependent_on_removed_host' }
  /** A new-construction object occupies space freed by (or overlapping) a demolished element. */
  | { type: 'new_into_demolished' }

export type FixStrategy =
  | 'shift_primary'
  | 'shift_primary_lateral'
  | 'shift_primary_vertical'
  | 'shift_secondary'
  | 'reroute_primary'
  | 'relocate_secondary'
  | 'flip_swing_handing'
  | 'add_sleeve_or_void'
  | 'reassign_phase'
  | 'review_only'

export interface ClashRule {
  id: string
  revision: number
  severity: ClashSeverity
  category: CoordinationCategory
  title_th: string
  title_en: string
  /** Why the rule exists, in the engineer's words. */
  rationale_th: string
  /** The measurable requirement that a fix must satisfy. */
  requirement_th: string
  source: {
    standard: string
    clause?: string
    edition?: string
  }
  /** `code` = text of a standard; `engineering_default` = practice value, overridable per project. */
  basis: RuleBasis
  jurisdiction: string[]
  effective_date: string
  subject_a: ClashSubject
  subject_b: ClashSubject
  predicate: RulePredicate
  fix: { strategy: FixStrategy; margin_mm: number }
  requires_engineer_review: boolean
  /** Lower order = evaluated (and reported) first. */
  order: number
}

export interface ClashRuleSet {
  id: string
  version: number
  revision: number
  jurisdiction: string[]
  effective_date: string
  issued_at: string
  sources: string[]
  rules: ClashRule[]
}

/** Project deviation from the dataset. Declared once in `project-model` so stored projects,
 * the clash engine and the MCP server all read the same contract. */
export type ClashRuleOverride = CoordinationRuleOverride

/** Optional project-level settings block; absent projects simply use the dataset defaults. */
export type ProjectCoordinationSettings = CoordinationSettings

export interface ResolvedRuleSet {
  id: string
  version: number
  revision: number
  jurisdiction: string[]
  effective_date: string
  issued_at: string
  rules: ClashRule[]
  /** Rule ids whose values were changed for this project. */
  applied_overrides: string[]
}

const TH = ['TH', 'BMA']
const EFFECTIVE = '2026-10-01'

/**
 * Default coordination rules. Geometric requirements only — no rates, no waste factors.
 * Clearance values marked `engineering_default` are coordinated practice values that a project can
 * override with `ProjectCoordinationSettings.overrides`.
 */
export const THAI_COORDINATION_RULES_V1: ClashRuleSet = {
  id: 'cf-coordination-th',
  version: 1,
  revision: 1,
  jurisdiction: TH,
  effective_date: EFFECTIVE,
  issued_at: '2026-10-01T00:00:00.000Z',
  sources: [
    'กฎกระทรวงฉบับที่ 55 พ.ศ. 2543 (ข้อ 40, 41, 44, 50)',
    'วสท. 1017 — งานระบบสุขาภิบาลในอาคาร',
    'วสท. 2001 — ระบบไฟฟ้าในอาคาร',
    'วสท. 1008 — การออกแบบโครงสร้างคอนกรีตเสริมเหล็ก',
    'แนวปฏิบัติหน้างาน ConstructFlow (ค่าที่ทำเครื่องหมาย engineering_default)',
  ],
  rules: [
    {
      id: 'CF-CL-MEP-STR-001',
      revision: 1,
      severity: 'hard',
      category: 'mep',
      title_th: 'ท่อระบบชนโครงสร้าง คสล./เหล็ก',
      title_en: 'MEP route intersects structure',
      rationale_th: 'ท่อน้ำดี น้ำเสีย ท่ออากาศ หรือรางไฟ ไม่ควรทะลุคาน เสาหรือฐานรากโดยไม่มีแบบขยาย เพราะการเจาะโครงสร้างลดกำลังรับแรงเฉือนและต้องมีวิศวกรอนุมัติ',
      requirement_th: 'แนวท่อ (รวมฉนวน) ต้องไม่ทับซ้อนวัสดุโครงสร้าง หากจำเป็นต้องเจาะต้องมีปลอกท่อ (Sleeve) และแบบขยายวิศวกรอนุมัติ',
      source: { standard: 'วสท. 1017 — งานระบบสุขาภิบาลในอาคาร', edition: '2555' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: {
        role: ['mep_pipe'],
        label_th: 'ท่อ/รางระบบ',
      },
      subject_b: {
        role: ['structure'],
        families: ['structure.beam', 'structure.column', 'structure.foundation'],
        label_th: 'โครงสร้าง',
      },
      predicate: { type: 'intersects', min_overlap_mm: 1 },
      fix: { strategy: 'reroute_primary', margin_mm: 25 },
      requires_engineer_review: true,
      order: 10,
    },
    {
      id: 'CF-CL-MEP-SLB-002',
      revision: 1,
      severity: 'hard',
      category: 'mep',
      title_th: 'ท่อระบบทะลุพื้นโครงสร้าง/พื้นตกแต่ง',
      title_en: 'MEP route penetrates slab or floor build-up',
      rationale_th: 'ท่อที่ฝังผ่านพื้นคอนกรีตต้องมีปลอกหรือช่องเปิดที่เตรียมไว้ล่วงหน้า การทะลุโดยไม่ได้เตรียมจะทำให้คอนกรีตแตกร้าวและรั่วซึม',
      requirement_th: 'เตรียมปลอกท่อหรือช่องเปิดก่อนเทคอนกรีต และมีแฟลชชิ่ง/กันซึมที่จุดทะลุ',
      source: { standard: 'วสท. 1017 — งานระบบสุขาภิบาลในอาคาร', edition: '2555' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['mep_pipe'], label_th: 'ท่อ/รางระบบ' },
      subject_b: { role: ['slab'], families: ['structure.slab', 'architecture.floor'], label_th: 'พื้น' },
      predicate: { type: 'intersects', min_overlap_mm: 1 },
      fix: { strategy: 'add_sleeve_or_void', margin_mm: 50 },
      requires_engineer_review: true,
      order: 20,
    },
    {
      id: 'CF-CL-MEP-CLG-003',
      revision: 1,
      severity: 'clearance',
      category: 'mep',
      title_th: 'ท่อระบบชนหรือชิดฝ้าเพดานเกินไป',
      title_en: 'MEP route collides with or crowds the ceiling plane',
      rationale_th: 'ท่อที่แตะหรือชิดฝ้าจะทำให้ติดตั้งฝ้าไม่ได้และไม่มีที่ให้ฉนวนหรือไฟซ่อน',
      requirement_th: 'ระยะห่างผิวท่อถึงระนาบฝ้าไม่น้อยกว่า 25 มม. เพื่อเผื่อฉนวนและโครงฝ้า',
      source: { standard: 'แนวปฏิบัติติดตั้งงานฝ้าและงานระบบ', edition: 'ConstructFlow' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['mep_pipe'], label_th: 'ท่อ/รางระบบ' },
      subject_b: { role: ['ceiling'], families: ['architecture.ceiling'], label_th: 'ฝ้าเพดาน' },
      predicate: { type: 'clearance_below', required_mm: 25 },
      fix: { strategy: 'shift_primary_vertical', margin_mm: 15 },
      requires_engineer_review: false,
      order: 30,
    },
    {
      id: 'CF-CL-DOOR-SWN-004',
      revision: 1,
      severity: 'hard',
      category: 'architecture',
      title_th: 'วงสวิงบานประตูชนสิ่งกีดขวาง',
      title_en: 'Door swing envelope is obstructed',
      rationale_th: 'บานประตูต้องเปิดได้เต็ม 90° ตามที่ออกแบบ การชนตู้ เฟอร์นิเจอร์ หรือผนังขวางทำให้ใช้งานจริงไม่ได้',
      requirement_th: 'ไม่มีวัตถุใดอยู่ในวงสวิง 90° ของบานประตู (รัศมีเท่าความกว้างบานจริง)',
      source: { standard: 'กฎกระทรวงฉบับที่ 55 พ.ศ. 2543', clause: 'ข้อ 40 (การใช้งานสัญจร)' },
      basis: 'code',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: {
        role: ['opening'],
        families: ['door_window.door'],
        solids: 'door_swing',
        label_th: 'วงสวิงบานประตู',
      },
      subject_b: {
        role: ['cabinet', 'fixture', 'other'],
        label_th: 'สิ่งกีดขวางวงสวิง',
      },
      predicate: { type: 'intersects', min_overlap_mm: 5 },
      fix: { strategy: 'flip_swing_handing', margin_mm: 50 },
      requires_engineer_review: false,
      order: 40,
    },
    {
      id: 'CF-CL-OPEN-STR-005',
      revision: 1,
      severity: 'clearance',
      category: 'structure',
      title_th: 'ช่องเปิดชิดเสา/คานเกินระยะเสาเอ็น-ทับหลัง',
      title_en: 'Opening is too close to a structural support',
      rationale_th: 'ริมช่องเปิดต้องเหลือระยะพอสำหรับเสาเอ็นและทับหลัง ถ้าชิดเสาเกินไปจะก่อเสาเอ็นไม่ได้และผนังแตกร้าว',
      requirement_th: 'ระยะจากริมช่องเปิดถึงผิวเสา/คานไม่น้อยกว่า 100 มม.',
      source: { standard: 'วสท. 1008 — งานผนังก่ออิฐและเสาเอ็นทับหลัง', edition: '2548' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['opening'], families: ['door_window.door', 'door_window.window'], label_th: 'ช่องเปิด' },
      subject_b: { role: ['structure'], families: ['structure.column', 'structure.beam'], label_th: 'เสา/คาน' },
      predicate: { type: 'clearance_below', required_mm: 100 },
      fix: { strategy: 'shift_primary', margin_mm: 25 },
      requires_engineer_review: false,
      order: 50,
    },
    {
      id: 'CF-CL-OPEN-OPEN-006',
      revision: 1,
      severity: 'hard',
      category: 'architecture',
      title_th: 'ช่องเปิดซ้อนกันบนผนังเดียวกัน',
      title_en: 'Overlapping openings on one wall',
      rationale_th: 'ช่องเปิดสองช่องที่ทับกันหรือชิดกันเกินไปจะเหลือผนังและเสาเอ็นไม่พอ รวมทั้งวงกบชนกัน',
      requirement_th: 'ระยะระหว่างริมช่องเปิดบนผนังเดียวกันไม่น้อยกว่า 50 มม.',
      source: { standard: 'แนวปฏิบัติการติดตั้งวงกบและเสาเอ็น', edition: 'ConstructFlow' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['opening'], families: ['door_window.door', 'door_window.window'], label_th: 'ช่องเปิด (แรก)' },
      subject_b: { role: ['opening'], families: ['door_window.door', 'door_window.window'], label_th: 'ช่องเปิด (ที่สอง)' },
      predicate: { type: 'opening_spacing_below', required_mm: 50 },
      fix: { strategy: 'shift_secondary', margin_mm: 25 },
      requires_engineer_review: false,
      order: 60,
    },
    {
      id: 'CF-CL-CAB-OPEN-007',
      revision: 1,
      severity: 'clearance',
      category: 'interior',
      title_th: 'ตู้บิลท์อินบังช่องเปิดประตู/หน้าต่าง',
      title_en: 'Built-in cabinet blocks or crowds an opening',
      rationale_th: 'ตู้ที่ปิดทับช่องเปิดทำให้เปิดหน้าต่างหรือใช้งานประตูไม่ได้ และกระทบการระบายอากาศตามกฎกระทรวง 55',
      requirement_th: 'ระยะห่างจากผิวตู้ถึงวงกบช่องเปิดไม่น้อยกว่า 50 มม.',
      source: { standard: 'กฎกระทรวงฉบับที่ 55 พ.ศ. 2543', clause: 'ข้อ 40 (การระบายอากาศ)' },
      basis: 'code',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['cabinet'], label_th: 'ตู้บิลท์อิน' },
      subject_b: { role: ['opening'], families: ['door_window.door', 'door_window.window'], label_th: 'ช่องเปิด' },
      predicate: { type: 'clearance_below', required_mm: 50 },
      fix: { strategy: 'shift_primary', margin_mm: 25 },
      requires_engineer_review: false,
      order: 70,
    },
    {
      id: 'CF-CL-CAB-ELE-008',
      revision: 1,
      severity: 'clearance',
      category: 'electrical',
      title_th: 'ตู้ทับหรือชิดเต้ารับ/สวิตช์เกินใช้งานจริง',
      title_en: 'Cabinet buries or crowds a device',
      rationale_th: 'เต้ารับหรือสวิตช์ที่ถูกตู้ทับจะใช้งานไม่ได้ ต้องย้ายตำแหน่งหรือย้ายจุดไฟ',
      requirement_th: 'ระยะห่างจากผิวตู้ถึงขอบอุปกรณ์ไม่น้อยกว่า 10 มม. และต้องเข้าถึงได้',
      source: { standard: 'วสท. 2001 — ระบบไฟฟ้าในอาคาร', edition: '2555' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['cabinet'], label_th: 'ตู้บิลท์อิน' },
      subject_b: { role: ['fixture'], families: ['electrical.fixture'], kinds: ['outlet', 'switch', 'panel'], label_th: 'อุปกรณ์ไฟฟ้า' },
      predicate: { type: 'intersects', min_overlap_mm: 0 },
      fix: { strategy: 'relocate_secondary', margin_mm: 50 },
      requires_engineer_review: false,
      order: 80,
    },
    {
      id: 'CF-CL-CAB-ELE-009',
      revision: 1,
      severity: 'soft',
      category: 'electrical',
      title_th: 'อุปกรณ์ไฟฟ้าชิดตู้มากเกินระยะเข้าถึง',
      title_en: 'Device sits too close to the cabinet face',
      rationale_th: 'แม้ไม่ทับกัน แต่ถ้าชิดเกินไปจะเสียบปลั๊กหรือกดสวิตช์ไม่สะดวก',
      requirement_th: 'ระยะห่างจากผิวตู้ถึงขอบอุปกรณ์ไม่น้อยกว่า 10 มม.',
      source: { standard: 'แนวปฏิบัติการติดตั้งอุปกรณ์ไฟฟ้า', edition: 'ConstructFlow' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['cabinet'], label_th: 'ตู้บิลท์อิน' },
      subject_b: { role: ['fixture'], families: ['electrical.fixture'], kinds: ['outlet', 'switch'], label_th: 'อุปกรณ์ไฟฟ้า' },
      predicate: { type: 'clearance_below', required_mm: 10 },
      fix: { strategy: 'relocate_secondary', margin_mm: 25 },
      requires_engineer_review: false,
      order: 90,
    },
    {
      id: 'CF-CL-LGT-STR-010',
      revision: 1,
      severity: 'clearance',
      category: 'electrical',
      title_th: 'ดวงโคมฝังฝ้าชนหรือชิดคาน',
      title_en: 'Recessed luminaire collides with or crowds a beam',
      rationale_th: 'ดวงโคมฝังฝ้าต้องมีที่ว่างในช่องฝ้า ถ้าตำแหน่งตรงกับคานจะติดตั้งไม่ได้และต้องเลื่อนตำแหน่ง',
      requirement_th: 'ระยะห่างจากขอบดวงโคมถึงผิวคานไม่น้อยกว่า 50 มม.',
      source: { standard: 'วสท. 2001 — ระบบไฟฟ้าในอาคาร', edition: '2555' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['fixture'], families: ['electrical.fixture'], kinds: ['light'], label_th: 'ดวงโคม' },
      subject_b: { role: ['structure'], families: ['structure.beam'], label_th: 'คาน' },
      predicate: { type: 'clearance_below', required_mm: 50 },
      fix: { strategy: 'shift_primary_lateral', margin_mm: 25 },
      requires_engineer_review: false,
      order: 100,
    },
    {
      id: 'CF-CL-LGT-CLG-011',
      revision: 1,
      severity: 'soft',
      category: 'electrical',
      title_th: 'ดวงโคมฝังฝ้าชนฝ้าเพดาน',
      title_en: 'Recessed luminaire penetrates the ceiling plane',
      rationale_th: 'ดวงโคมต้องฝังในช่องฝ้า ไม่ทะลุระนาบฝ้าให้เห็นจากด้านล่าง',
      requirement_th: 'ขอบดวงโคมต้องอยู่เหนือระนาบฝ้าไม่น้อยกว่า 25 มม.',
      source: { standard: 'แนวปฏิบัติงานฝ้าและงานไฟฟ้า', edition: 'ConstructFlow' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['fixture'], families: ['electrical.fixture'], kinds: ['light'], label_th: 'ดวงโคม' },
      subject_b: { role: ['ceiling'], families: ['architecture.ceiling'], label_th: 'ฝ้าเพดาน' },
      predicate: { type: 'clearance_below', required_mm: 25 },
      fix: { strategy: 'shift_primary_vertical', margin_mm: 15 },
      requires_engineer_review: false,
      order: 110,
    },
    {
      id: 'CF-CL-LED-STR-012',
      revision: 1,
      severity: 'clearance',
      category: 'interior',
      title_th: 'รางไฟซ่อนชิดคาน/โครงสร้าง',
      title_en: 'Concealed LED run crowds structure',
      rationale_th: 'รางไฟซ่อนต้องมีระยะให้ตัวรางและฝาครอบกระจายแสง ไม่ชนผิวคอนกรีต',
      requirement_th: 'ระยะห่างจากผิวรางถึงผิวโครงสร้างไม่น้อยกว่า 20 มม.',
      source: { standard: 'แนวปฏิบัติงานไฟซ่อน', edition: 'ConstructFlow' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['fixture'], families: ['electrical.led_run'], kinds: ['led_run'], label_th: 'รางไฟซ่อน' },
      subject_b: { role: ['structure', 'ceiling'], families: ['structure.beam', 'architecture.ceiling'], label_th: 'โครงสร้าง/ฝ้า' },
      predicate: { type: 'clearance_below', required_mm: 20 },
      fix: { strategy: 'shift_primary', margin_mm: 15 },
      requires_engineer_review: false,
      order: 120,
    },
    {
      id: 'CF-CL-DEM-HOST-013',
      revision: 1,
      severity: 'hard',
      category: 'demolition',
      title_th: 'ผนังรื้อถอนแต่ยังมีอุปกรณ์ที่ host อยู่',
      title_en: 'Demolished host still carries live dependents',
      rationale_th: 'เมื่อกำหนดให้ผนังหรือฝ้าเป็นงานรื้อถอน อุปกรณ์ ประตู หน้าต่าง ตู้ที่ยึดอยู่ต้องถูกย้าย เปลี่ยน host หรือกำหนดรื้อตามให้สอดคล้องกัน',
      requirement_th: 'ทุกรายการที่ host บนงานรื้อถอนต้องถูกกำหนด phase หรือ host ใหม่ก่อนเริ่มงานรื้อ',
      source: { standard: 'พ.ร.บ. ควบคุมอาคาร — ลำดับงานรื้อถอน', edition: '2522' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['wall', 'ceiling', 'slab'], label_th: 'งานรื้อถอน (host)' },
      subject_b: { role: ['opening', 'fixture', 'cabinet', 'other', 'roof'], label_th: 'งานที่ยึดอยู่บน host' },
      predicate: { type: 'dependent_on_removed_host' },
      fix: { strategy: 'reassign_phase', margin_mm: 0 },
      requires_engineer_review: false,
      order: 130,
    },
    {
      id: 'CF-CL-DEM-NEW-014',
      revision: 1,
      severity: 'hard',
      category: 'demolition',
      title_th: 'งานใหม่ทับซ้อนส่วนที่ต้องรื้อ',
      title_en: 'New construction occupies space of a demolished element',
      rationale_th: 'ชิ้นงานสร้างใหม่ไม่ควรอยู่ในปริมาตรเดียวกับชิ้นงานที่จะรื้อ ยกเว้นระบุว่าเป็นงานเชื่อมต่อ/สกัดตามแบบขยาย',
      requirement_th: 'ตรวจลำดับงานรื้อ-สร้าง หรือระบุเป็นงานเชื่อมต่อรอยต่อเดิม-ใหม่ (Remodeling joint)',
      source: { standard: 'แนวปฏิบัติการเชื่อมต่อโครงสร้างเดิม-ใหม่', edition: 'ConstructFlow' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['structure', 'wall', 'slab', 'ceiling', 'mep_pipe', 'fixture', 'cabinet', 'other', 'roof'], label_th: 'งานสร้างใหม่' },
      subject_b: { role: ['structure', 'wall', 'slab', 'ceiling'], label_th: 'ส่วนรื้อถอน' },
      predicate: { type: 'new_into_demolished' },
      fix: { strategy: 'review_only', margin_mm: 0 },
      requires_engineer_review: true,
      order: 140,
    },
    {
      id: 'CF-CL-GEN-999',
      revision: 1,
      severity: 'soft',
      category: 'coordination',
      title_th: 'การทับซ้อนที่ยังไม่เข้าเกณฑ์เฉพาะ',
      title_en: 'Unclassified interference',
      rationale_th: 'ทับซ้อนจริงตามรูปทรงแต่ยังไม่มีข้อกำหนดเฉพาะในชุดกติกา ต้องให้ผู้ตรวจแบบยืนยันว่าเป็นเจตนาหรือไม่',
      requirement_th: 'ตรวจสอบว่าเป็นงานเจตนา (เช่น ฝัง เจาะ เชื่อม) หรือต้องแก้ไข',
      source: { standard: 'ConstructFlow coordination sweep', edition: 'v1' },
      basis: 'engineering_default',
      jurisdiction: TH,
      effective_date: EFFECTIVE,
      subject_a: { role: ['structure', 'wall', 'slab', 'ceiling', 'opening', 'mep_pipe', 'fixture', 'cabinet', 'roof', 'other'], label_th: 'วัตถุ (แรก)' },
      subject_b: { role: ['structure', 'wall', 'slab', 'ceiling', 'opening', 'mep_pipe', 'fixture', 'cabinet', 'roof', 'other'], label_th: 'วัตถุ (ที่สอง)' },
      predicate: { type: 'intersects', min_overlap_mm: 10 },
      fix: { strategy: 'review_only', margin_mm: 0 },
      requires_engineer_review: false,
      order: 999,
    },
  ],
}

export const DEFAULT_CONSTRUCTION_SLACK_MM = 5

/** Apply project overrides on top of the versioned dataset and report exactly what changed. */
export function resolveRuleSet(
  base: ClashRuleSet = THAI_COORDINATION_RULES_V1,
  settings?: ProjectCoordinationSettings,
): ResolvedRuleSet {
  const applied: string[] = []
  const overrides = new Map<string, ClashRuleOverride>()
  for (const override of settings?.overrides ?? []) {
    if (typeof override.rule_id !== 'string') continue
    overrides.set(override.rule_id, override)
  }
  const rules: ClashRule[] = []
  for (const rule of base.rules) {
    const override = overrides.get(rule.id)
    if (!override) {
      rules.push(rule)
      continue
    }
    applied.push(rule.id)
    if (override.enabled === false) continue
    const next: ClashRule = { ...rule }
    if (override.severity) next.severity = override.severity
    if (override.basis) next.basis = override.basis
    if (override.required_clearance_mm !== undefined && Number.isFinite(override.required_clearance_mm)) {
      const value = Math.max(0, override.required_clearance_mm)
      if (next.predicate.type === 'clearance_below' || next.predicate.type === 'opening_spacing_below') {
        next.predicate = { ...next.predicate, required_mm: value }
      } else if (next.predicate.type === 'intersects') {
        // An override on an intersection rule becomes an explicit clearance requirement.
        next.predicate = { type: 'clearance_below', required_mm: value }
      }
      next.requirement_th = `${next.requirement_th} (ปรับตามโครงการ: ${value} มม.)`
    }
    if (override.note) next.requirement_th = `${next.requirement_th} — ${override.note}`
    rules.push(next)
  }
  return {
    id: base.id,
    version: base.version,
    revision: base.revision,
    jurisdiction: base.jurisdiction,
    effective_date: base.effective_date,
    issued_at: base.issued_at,
    rules,
    applied_overrides: applied,
  }
}

export function findRule(ruleSet: ResolvedRuleSet, ruleId: string): ClashRule | undefined {
  return ruleSet.rules.find(rule => rule.id === ruleId)
}
