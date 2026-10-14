import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultResidentialProjectDocument } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

function testModule(overrides = {}) {
  const { manifest: manifestOverrides, commands: commandOverrides, ...moduleOverrides } = overrides
  return {
    manifest: {
      id: 'vendor.notes',
      version: '1.0.0',
      schema_version: 1,
      provides: ['vendor.project-notes'],
      ...manifestOverrides,
    },
    activate(api) {
      assert.equal(api.moduleId, 'vendor.notes')
      assert.equal(api.apiVersion, '1')
      return {
        commands: {
          'vendor.notes.set_description': context => {
            context.updated.project.description = String(context.input.description ?? '')
            return {
              result: {
                status: 'success',
                command_id: context.command_id,
                command_name: context.commandName,
                affected_object_ids: [],
              },
              updatedProject: context.updated,
              emittedEnvelope: context.envelope,
            }
          },
          ...(commandOverrides ?? {}),
        },
        commandDescriptors: [{
          name: 'vendor.notes.set_description',
          version: 1,
          owner_module: 'vendor.notes',
          ai_allowed: true,
          confirmation: 'none',
          input_schema: { type: 'object', properties: { description: { type: 'string' } } },
          preconditions_summary: 'Project is open',
        }],
        validators: {
          'vendor.notes.description_check': project => project.project.description?.startsWith('extension:')
            ? []
            : [{ code: 'VENDOR_DESCRIPTION', message: 'Description must use the extension prefix', severity: 'error' }],
        },
        providers: {
          'vendor.notes.quantities': project => Object.values(project.objects).map(object => ({
            object_id: object.id,
            family: object.object_type,
            phase: object.created_phase,
            removed_phase: object.removed_phase,
            mark: 'EXT',
            meshes: [],
            paths: [],
            quantities: [],
            schedule: {},
            warnings: [],
          })),
        },
      }
    },
    ...moduleOverrides,
  }
}

test('registered extension commands share CommandBus validation, atomic batches, and editor undo/redo', () => {
  let deactivated = 0
  const module = testModule({ deactivate: () => { deactivated += 1 } })
  const unregister = CommandBus.registerModule(module)
  try {
    assert.ok(CommandBus.getRegisteredModules().some(entry => entry.id === 'vendor.notes'))
    assert.equal(CommandBus.getModuleProviders().some(provider => provider.id === 'vendor.notes.quantities'), true)
    assert.deepEqual(CommandBus.getAICommandDescriptors().map(descriptor => descriptor.name), ['vendor.notes.set_description'])
    const project = createDefaultResidentialProjectDocument('sdk-runtime-project')
    const session = new ProjectCommandSession(project)

    const applied = session.execute([{ name: 'vendor.notes.set_description', input: { description: 'extension:checked' } }], 'ai')
    assert.equal(applied.status, 'success')
    assert.equal(session.project.project.description, 'extension:checked')
    assert.equal(applied.emittedEnvelopes[0].actor.kind, 'ai')
    assert.equal(session.undo().project.description, undefined)
    assert.equal(session.redo().project.description, 'extension:checked')

    const beforeInvalid = session.project
    const invalid = session.execute([{ name: 'vendor.notes.set_description', input: { description: 'invalid' } }], 'ai')
    assert.equal(invalid.status, 'rejected')
    assert.match(invalid.errors[0], /VENDOR_DESCRIPTION/)
    assert.deepEqual(session.project, beforeInvalid)

    const batch = session.execute([
      { name: 'vendor.notes.set_description', input: { description: 'extension:temporary' } },
      { name: 'vendor.notes.missing_command', input: {} },
    ], 'extension')
    assert.equal(batch.status, 'rejected')
    assert.deepEqual(session.project, beforeInvalid, 'a later failure rolls back earlier module mutations')
  } finally {
    unregister()
    unregister()
  }
  assert.equal(deactivated, 1)
  assert.equal(CommandBus.getRegisteredModules().some(entry => entry.id === 'vendor.notes'), false)
})

test('module registration enforces capabilities and command namespaces', () => {
  assert.throws(() => CommandBus.registerModule(testModule({
    manifest: { id: 'vendor.blocked', requires: ['missing.capability'] },
  })), /requires unavailable capability/)
  assert.throws(() => CommandBus.registerModule(testModule({
    commands: { 'unscoped.command': () => undefined },
  })), /must be namespaced/)
  const unregister = CommandBus.registerModule(testModule())
  try {
    assert.throws(() => CommandBus.registerModule(testModule()), /already registered/)
  } finally {
    unregister()
  }

  const unregisterHost = CommandBus.registerModule({
    manifest: { id: 'vendor.host', version: '1.0.0', schema_version: 1, provides: ['vendor.base'] },
    activate: () => ({ commands: {} }),
  })
  const unregisterClient = CommandBus.registerModule({
    manifest: { id: 'vendor.client', version: '1.0.0', schema_version: 1, requires: ['vendor.base'] },
    activate: () => ({ commands: {} }),
  })
  try {
    assert.throws(unregisterHost, /requires vendor.base/)
  } finally {
    unregisterClient()
    unregisterHost()
  }
})

test('extension handlers receive an isolated project and must return attributable envelopes', () => {
  const unregister = CommandBus.registerModule(testModule({
    commands: {
      'vendor.notes.set_description': context => {
        context.project.project.description = 'must not mutate caller input'
        context.updated.project.description = 'extension:isolated'
        return {
          result: {
            status: 'success',
            command_id: context.command_id,
            command_name: context.commandName,
            affected_object_ids: [],
          },
          updatedProject: context.updated,
          emittedEnvelope: context.envelope,
        }
      },
    },
  }))
  try {
    const project = createDefaultResidentialProjectDocument('sdk-isolation-project')
    const result = CommandBus.execute(project, 'vendor.notes.set_description', {}, 'ai')
    assert.equal(result.result.status, 'success')
    assert.equal(project.project.description, undefined)
    assert.equal(result.updatedProject.project.description, 'extension:isolated')
  } finally {
    unregister()
  }
})

test('module schema migrations upgrade owned object data before project validation without changing identity', () => {
  const initial = createDefaultResidentialProjectDocument('sdk-migration-project')
  const created = CommandBus.execute(initial, 'CreateColumn', {
    id: crypto.randomUUID(), mark: 'C1', location_mm: [0, 0, 0], section_mm: [200, 200],
  })
  assert.equal(created.result.status, 'success')
  const project = created.updatedProject
  const object = structuredClone(Object.values(project.objects)[0])
  const objectId = object.id
  object.object_type = 'vendor.migrations.annotation'
  object.owner_module = 'vendor.migrations'
  object.schema_version = 1
  object.module_data = { legacy_note: 'permit note' }
  object.host_refs = []
  project.objects[object.id] = object
  const migrationContexts = []
  const unregister = CommandBus.registerModule({
    manifest: {
      id: 'vendor.migrations', version: '1.0.0', schema_version: 3,
      object_types: ['vendor.migrations.annotation'],
    },
    activate: () => ({
      commands: {},
      migrations: [
        {
          from_version: 1, to_version: 2,
          migrate: (data, context) => {
            migrationContexts.push(context)
            const { legacy_note, ...rest } = data
            return { ...rest, note: legacy_note }
          },
        },
        {
          from_version: 2, to_version: 3,
          migrate: (data, context) => {
            migrationContexts.push(context)
            return { ...data, annotation_kind: 'general' }
          },
        },
      ],
    }),
  })
  try {
    const migrated = CommandBus.migrateProject(project)
    const upgraded = migrated.objects[objectId]
    assert.equal(project.objects[objectId].schema_version, 1)
    assert.deepEqual(project.objects[objectId].module_data, { legacy_note: 'permit note' })
    assert.equal(upgraded.id, objectId)
    assert.equal(upgraded.owner_module, 'vendor.migrations')
    assert.deepEqual(upgraded.host_refs, object.host_refs)
    assert.equal(upgraded.schema_version, 3)
    assert.deepEqual(upgraded.module_data, { note: 'permit note', annotation_kind: 'general' })
    assert.deepEqual(migrationContexts.map(context => [context.from_schema_version, context.to_schema_version]), [[1, 2], [2, 3]])
    assert.ok(migrationContexts.every(context => context.object_id === objectId && context.project_id === project.project.id))
  } finally {
    unregister()
  }
})

test('module migration failures reject without mutating the original project', () => {
  const initial = createDefaultResidentialProjectDocument('sdk-migration-failure-project')
  const created = CommandBus.execute(initial, 'CreateColumn', {
    id: crypto.randomUUID(), mark: 'C1', location_mm: [0, 0, 0], section_mm: [200, 200],
  })
  assert.equal(created.result.status, 'success')
  const project = created.updatedProject
  const object = structuredClone(Object.values(project.objects)[0])
  object.object_type = 'vendor.incomplete.annotation'
  object.owner_module = 'vendor.incomplete'
  object.schema_version = 1
  object.module_data = { value: 'old' }
  object.host_refs = []
  project.objects[object.id] = object
  const snapshot = structuredClone(project)
  const unregister = CommandBus.registerModule({
    manifest: { id: 'vendor.incomplete', version: '1.0.0', schema_version: 2 },
    activate: () => ({ commands: {} }),
  })
  try {
    assert.throws(() => CommandBus.migrateProject(project), /missing migration 1 → 2/)
    assert.deepEqual(project, snapshot)
  } finally {
    unregister()
  }
})
