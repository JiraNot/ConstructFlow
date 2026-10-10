// Project-level coordination settings — the storage half of the versioned rule dataset.
//
// The rule *content* (Thai standards, required clearances, effective dates) lives in
// `@constructflow/clash-engine` as a versioned dataset. What a project owns is only the
// deviation: which dataset version it is pinned to, which rules are disabled or re-tuned,
// and how much construction slack a suggested shift should carry. Keeping those two halves
// apart is what lets the dataset be revised without rewriting stored projects.

export type CoordinationSeverity = 'hard' | 'clearance' | 'soft'

export type CoordinationRuleBasis = 'code' | 'engineering_default' | 'project_override'

export interface CoordinationRuleOverride {
  /** Stable dataset rule identity, e.g. `CF-CL-MEP-STR-001`. */
  rule_id: string
  /** `false` disables the rule for this project only. */
  enabled?: boolean
  /** Project-specific allowance in millimetres, replacing the dataset value. */
  required_clearance_mm?: number
  severity?: CoordinationSeverity
  /** Recorded when the deviation itself is an engineering decision rather than a default. */
  basis?: CoordinationRuleBasis
  /** Free-text justification shown next to the finding. */
  note?: string
}

export interface CoordinationSettings {
  /** Dataset identity the project was last resolved against. */
  rule_set_id?: string
  rule_set_version?: number
  /** Project overrides keyed by rule identity; the last entry for a rule wins. */
  overrides?: CoordinationRuleOverride[]
  /** Extra millimetres added to every suggested shift so field work has slack. */
  construction_slack_mm?: number
  /** Skip the catch-all `CF-CL-GEN-999` sweep (useful on very large models). */
  include_generic_sweep?: boolean
}

const SEVERITIES: readonly CoordinationSeverity[] = ['hard', 'clearance', 'soft']
const BASES: readonly CoordinationRuleBasis[] = ['code', 'engineering_default', 'project_override']
const RULE_ID = /^CF-CL-[A-Z0-9]+(-[A-Z0-9]+)*-\d{3}$/
const MAX_SLACK_MM = 100

/**
 * Reject malformed coordination settings at the project boundary so a typo cannot silently
 * disable safety rules or fabricate a clearance the drawings then claim to satisfy.
 */
export function validateCoordinationSettings(value: unknown): void {
  if (value === undefined || value === null) return
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid coordination_settings: expected an object')
  }
  const settings = value as CoordinationSettings
  if (settings.rule_set_id !== undefined && (typeof settings.rule_set_id !== 'string' || !settings.rule_set_id.trim())) {
    throw new Error('Invalid coordination_settings.rule_set_id: expected a non-empty string')
  }
  if (settings.rule_set_version !== undefined
    && (!Number.isInteger(settings.rule_set_version) || settings.rule_set_version < 1)) {
    throw new Error('Invalid coordination_settings.rule_set_version: expected a positive integer')
  }
  if (settings.construction_slack_mm !== undefined) {
    const slack = settings.construction_slack_mm
    if (!Number.isFinite(slack) || slack < 0 || slack > MAX_SLACK_MM) {
      throw new Error(`Invalid coordination_settings.construction_slack_mm: expected 0-${MAX_SLACK_MM} mm`)
    }
  }
  if (settings.include_generic_sweep !== undefined && typeof settings.include_generic_sweep !== 'boolean') {
    throw new Error('Invalid coordination_settings.include_generic_sweep: expected a boolean')
  }
  if (settings.overrides === undefined) return
  if (!Array.isArray(settings.overrides)) {
    throw new Error('Invalid coordination_settings.overrides: expected an array')
  }
  const seen = new Set<string>()
  for (const [index, override] of settings.overrides.entries()) {
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      throw new Error(`Invalid coordination_settings.overrides[${index}]: expected an object`)
    }
    if (typeof override.rule_id !== 'string' || !RULE_ID.test(override.rule_id)) {
      throw new Error(`Invalid coordination_settings.overrides[${index}].rule_id: expected a CF-CL-*-000 identity`)
    }
    if (seen.has(override.rule_id)) {
      throw new Error(`Invalid coordination_settings.overrides: duplicate rule_id ${override.rule_id}`)
    }
    seen.add(override.rule_id)
    if (override.enabled !== undefined && typeof override.enabled !== 'boolean') {
      throw new Error(`Invalid coordination_settings.overrides[${index}].enabled: expected a boolean`)
    }
    if (override.severity !== undefined && !SEVERITIES.includes(override.severity)) {
      throw new Error(`Invalid coordination_settings.overrides[${index}].severity: expected hard, clearance or soft`)
    }
    if (override.basis !== undefined && !BASES.includes(override.basis)) {
      throw new Error(`Invalid coordination_settings.overrides[${index}].basis: expected code, engineering_default or project_override`)
    }
    if (override.required_clearance_mm !== undefined) {
      const required = override.required_clearance_mm
      if (!Number.isFinite(required) || required < 0) {
        throw new Error(`Invalid coordination_settings.overrides[${index}].required_clearance_mm: expected a non-negative millimetre value`)
      }
    }
    if (override.note !== undefined && (typeof override.note !== 'string' || override.note.length > 200)) {
      throw new Error(`Invalid coordination_settings.overrides[${index}].note: expected a string of at most 200 characters`)
    }
    if (override.enabled === false && override.required_clearance_mm !== undefined) {
      throw new Error(`Invalid coordination_settings.overrides[${index}]: a disabled rule cannot also set a clearance`)
    }
  }
}

/** Normalised copy: overrides de-duplicated by rule identity, last one wins. */
export function normalizeCoordinationSettings(settings: CoordinationSettings | undefined): CoordinationSettings | undefined {
  if (!settings) return undefined
  const byRule = new Map<string, CoordinationRuleOverride>()
  for (const override of settings.overrides ?? []) byRule.set(override.rule_id, { ...override })
  return {
    ...settings,
    ...(byRule.size ? { overrides: [...byRule.values()].sort((left, right) => left.rule_id.localeCompare(right.rule_id)) } : {}),
  }
}
