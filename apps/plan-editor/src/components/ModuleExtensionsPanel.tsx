import React, { useMemo, useState } from 'react'
import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import type { ModuleCommandDescriptor, ModuleUIActionContribution, ModuleUIContribution } from '@constructflow/module-sdk'

type InputProperty = { type?: unknown; title?: unknown; description?: unknown; enum?: unknown; default?: unknown }

function getInitialValue(property: InputProperty): unknown {
  if (property.default !== undefined) return property.default
  if (Array.isArray(property.enum)) return property.enum[0]
  if (property.type === 'boolean') return false
  return ''
}

function ExtensionAction({ action, descriptor, onExecute }: {
  action: ModuleUIActionContribution
  descriptor: ModuleCommandDescriptor
  onExecute: (command: CommandRequest) => CommandBatchResult
}) {
  const properties = descriptor.input_schema.properties as Record<string, InputProperty>
  const required = new Set(descriptor.input_schema.required ?? [])
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(
    Object.entries(properties).map(([name, property]) => [name, getInitialValue(property)]),
  ))
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const [pendingInput, setPendingInput] = useState<Record<string, unknown> | null>(null)
  const [feedback, setFeedback] = useState('')
  const schemaError = useMemo(() => Object.entries(properties).find(([, property]) => {
    if (property.enum !== undefined) return !Array.isArray(property.enum) || property.enum.some(value => !['string', 'number', 'boolean'].includes(typeof value))
    return !['string', 'number', 'integer', 'boolean'].includes(String(property.type))
  })?.[0], [properties])

  const submit = () => {
    const input: Record<string, unknown> = {}
    for (const [name, property] of Object.entries(properties)) {
      const value = values[name]
      if (Array.isArray(property.enum)) {
        if (!property.enum.some(candidate => Object.is(candidate, value))) {
          if (required.has(name)) { setFeedback(`${String(property.title ?? name)} ต้องเลือกค่าที่รองรับ`); return }
          continue
        }
        input[name] = value
      } else if (property.type === 'number' || property.type === 'integer') {
        if (value === '' || value === undefined) {
          if (required.has(name)) { setFeedback(`${String(property.title ?? name)} ต้องระบุค่า`); return }
          continue
        }
        const number = Number(value)
        if (!Number.isFinite(number) || (property.type === 'integer' && !Number.isInteger(number))) {
          setFeedback(`${String(property.title ?? name)} ต้องเป็น${property.type === 'integer' ? 'จำนวนเต็ม' : 'ตัวเลข'}`); return
        }
        input[name] = number
      } else if (property.type === 'boolean') {
        input[name] = value === true
      } else {
        if (required.has(name) && (typeof value !== 'string' || !value.trim())) {
          setFeedback(`${String(property.title ?? name)} ต้องระบุค่า`); return
        }
        if (value !== '') input[name] = value
      }
    }
    if (descriptor.confirmation === 'required' && !pendingConfirmation) {
      setPendingInput(input)
      setPendingConfirmation(true)
      setFeedback('ตรวจสอบค่าที่กรอก แล้วกดยืนยันเพื่อส่งคำสั่ง')
      return
    }
    const result = onExecute({ name: action.command, input: pendingInput ?? input })
    setPendingConfirmation(false)
    setPendingInput(null)
    setFeedback(result.status === 'success' ? 'คำสั่งสำเร็จ · Undo ได้จากประวัติโครงการ' : result.errors?.[0] ?? 'คำสั่งไม่ผ่านการตรวจสอบ')
  }

  return <section style={{ border: '1px solid #dbe3ed', borderRadius: 5, padding: 9, marginTop: 8 }}>
    <strong style={{ fontSize: 12 }}>{action.label}</strong>
    {action.description && <p style={{ margin: '4px 0', color: '#64748b', fontSize: 11 }}>{action.description}</p>}
    {schemaError && <p role="alert" style={{ color: '#b91c1c', fontSize: 11 }}>ไม่รองรับ schema ของช่อง “{schemaError}” ในฟอร์ม extension</p>}
    {!schemaError && Object.entries(properties).map(([name, property]) => {
      const label = String(property.title ?? name)
      const enumValues = Array.isArray(property.enum) ? property.enum : null
      return <label key={name} style={{ display: 'grid', gap: 4, marginTop: 7, fontSize: 11 }}>
        <span>{label}{required.has(name) ? ' *' : ''}</span>
        {enumValues
          ? <select aria-label={label} disabled={pendingConfirmation} value={String(values[name] ?? '')} onChange={event => {
              const selected = enumValues.find(value => String(value) === event.target.value)
              setValues(current => ({ ...current, [name]: selected }))
            }}>{enumValues.map(value => <option key={String(value)} value={String(value)}>{String(value)}</option>)}</select>
          : property.type === 'boolean'
            ? <input aria-label={label} type="checkbox" disabled={pendingConfirmation} checked={values[name] === true} onChange={event => setValues(current => ({ ...current, [name]: event.target.checked }))} />
            : <input aria-label={label} disabled={pendingConfirmation} type={property.type === 'number' || property.type === 'integer' ? 'number' : 'text'} step={property.type === 'integer' ? 1 : 'any'} value={String(values[name] ?? '')}
                onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))} />}
        {typeof property.description === 'string' && property.description.length > 0 && <small style={{ color: '#64748b' }}>{property.description}</small>}
      </label>
    })}
    <button type="button" disabled={Boolean(schemaError)} onClick={submit} style={{ marginTop: 8 }}>
      {descriptor.confirmation === 'required' && pendingConfirmation ? 'ยืนยันและส่งคำสั่ง' : 'ตรวจสอบและส่งคำสั่ง'}
    </button>
    {feedback && <div role="status" style={{ marginTop: 5, fontSize: 10, color: feedback.includes('สำเร็จ') ? '#15803d' : '#64748b' }}>{feedback}</div>}
  </section>
}

export interface ModuleExtensionsPanelProps {
  contributions: readonly ModuleUIContribution[]
  commandDescriptors: readonly ModuleCommandDescriptor[]
  onExecute: (command: CommandRequest) => CommandBatchResult
}

/** Framework-neutral extension action descriptors rendered by the host through its normal command session. */
export const ModuleExtensionsPanel: React.FC<ModuleExtensionsPanelProps> = ({ contributions, commandDescriptors, onExecute }) => {
  const descriptors = useMemo(() => new Map(commandDescriptors.map(descriptor => [descriptor.name, descriptor])), [commandDescriptors])
  if (!contributions.length) return <section className="cf-inspector-content"><p>ยังไม่มี extension ที่เพิ่มคำสั่งในแผงนี้</p></section>
  return <section className="cf-inspector-content" aria-label="Extension actions">
    {contributions.map(contribution => <section key={contribution.id} aria-label={contribution.title} style={{ marginBottom: 14 }}>
      <h3 style={{ margin: '4px 0', fontSize: 13 }}>{contribution.title}</h3>
      {contribution.description && <p style={{ color: '#64748b', fontSize: 11 }}>{contribution.description}</p>}
      {contribution.actions.map(action => {
        const descriptor = descriptors.get(action.command)
        return descriptor
          ? <ExtensionAction key={action.id} action={action} descriptor={descriptor} onExecute={onExecute} />
          : <p key={action.id} role="alert">ไม่พบ command descriptor สำหรับ {action.command}</p>
      })}
    </section>)}
  </section>
}
