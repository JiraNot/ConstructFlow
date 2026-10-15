import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultResidentialProjectDocument } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

function testModule(overrides = {}) {
  const { manifest: manifestOverrides, commands: commandOverrides, ui: uiOverrides, ...moduleOverrides } = overrides
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
      ui: uiOverrides ?? [{
        id: 'vendor.notes.project_tools',
        title: 'Project tools',
        description: 'Extension actions validated by the host',
        actions: [{ id: 'vendor.notes.set_description_action', label: 'Set project description', command: 'vendor.notes.set_description' }],
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
    assert.deepEqual(CommandBus.getModuleUIContributions(), [{
      id: 'vendor.notes.project_tools',
      title: 'Project tools',
      description: 'Extension actions validated by the host',
      actions: [{ id: 'vendor.notes.set_description_action', label: 'Set project description', command: 'vendor.notes.set_description' }],
    }])
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

test('async extension commands serialize in one session history and reject stale results', async () => {
  const initial = createDefaultResidentialProjectDocument('sdk-async-session-project')
  let signalStarted
  const executionStarted = new Promise(resolve => { signalStarted = resolve })
  const unregister = CommandBus.registerModule(testModule({
    commands: {
      'vendor.notes.set_description_async': async context => {
        if (context.input.wait_for_commit) signalStarted()
        await new Promise(resolve => setTimeout(resolve, Number(context.input.delay_ms ?? 0)))
        context.updated.project.description = String(context.input.description)
        return {
          result: { status: 'success', command_id: context.command_id, command_name: context.commandName, affected_object_ids: [] },
          updatedProject: context.updated,
          emittedEnvelope: context.envelope,
        }
      },
    },
  }))
  try {
    const session = new ProjectCommandSession(initial)
    const first = session.executeAsync([{ name: 'vendor.notes.set_description_async', input: { description: 'extension:first', delay_ms: 15 } }])
    const second = session.executeAsync([{ name: 'vendor.notes.set_description_async', input: { description: 'extension:second' } }])
    const [firstResult, secondResult] = await Promise.all([first, second])
    assert.equal(firstResult.status, 'success')
    assert.equal(secondResult.status, 'success')
    assert.equal(session.project.project.description, 'extension:second')
    assert.equal(session.undo().project.description, 'extension:first')
    assert.equal(session.undo().project.description, undefined)
    assert.equal(session.redo().project.description, 'extension:first')
    assert.equal(session.redo().project.description, 'extension:second')

    const pending = session.executeAsync([{ name: 'vendor.notes.set_description_async', input: { description: 'extension:stale', delay_ms: 20, wait_for_commit: true } }])
    await executionStarted
    const humanEdit = session.project
    humanEdit.project.description = 'human:kept'
    session.commit(humanEdit)
    const staleResult = await pending
    assert.equal(staleResult.status, 'rejected')
    assert.match(staleResult.errors?.[0] ?? '', /Project changed while the extension command was running/)
    assert.equal(session.project.project.description, 'human:kept')
  } finally {
    unregister()
  }
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

test('extensions can require the host-provided ConstructFlow Core capability', () => {
  const unregister = CommandBus.registerModule({
    manifest: {
      id: 'vendor.coreclient', version: '1.0.0', schema_version: 1,
      requires: ['constructflow.core'],
    },
    activate: () => ({ commands: {} }),
  })
  try {
    assert.ok(CommandBus.getRegisteredModules().some(entry => entry.id === 'vendor.coreclient'))
  } finally {
    unregister()
  }
})

test('module command descriptors validate host input before extension handlers run', () => {
  let handlerRuns = 0
  const unregister = CommandBus.registerModule({
    manifest: { id: 'vendor.validated', version: '1.0.0', schema_version: 1 },
    activate: () => ({
      commands: {
        'vendor.validated.run': context => {
          handlerRuns += 1
          context.updated.project.description = `${context.input.mode}:${context.input.count}`
          return {
            result: { status: 'success', command_id: context.command_id, command_name: context.commandName, affected_object_ids: [] },
            updatedProject: context.updated,
            emittedEnvelope: context.envelope,
          }
        },
      },
      commandDescriptors: [{
        name: 'vendor.validated.run', version: 1, owner_module: 'vendor.validated',
        ai_allowed: true, confirmation: 'none',
        input_schema: {
          type: 'object',
          required: ['count', 'mode'],
          additionalProperties: false,
          properties: {
            count: { type: 'integer', minimum: 1, maximum: 3 },
            mode: { type: 'string', enum: ['safe', 'fast'] },
            enabled: { type: 'boolean' },
            settings: {
              type: 'object', required: ['tag'], additionalProperties: false,
              properties: { tag: { type: 'string', minLength: 2 } },
            },
            points: { type: 'array', minItems: 2, items: { type: 'number', minimum: 0 } },
          },
        },
      }],
    }),
  })
  try {
    const project = createDefaultResidentialProjectDocument('sdk-input-validation')
    for (const input of [
      { count: 1.5, mode: 'safe' },
      { count: 4, mode: 'safe' },
      { count: 2, mode: 'unsafe' },
      { count: 2, mode: 'safe', extra: true },
      { count: 2, mode: 'safe', settings: { tag: 'x' } },
      { count: 2, mode: 'safe', points: [1] },
    ]) {
      const rejected = CommandBus.execute(project, 'vendor.validated.run', input, 'ai')
      assert.equal(rejected.result.status, 'rejected')
      assert.deepEqual(rejected.updatedProject, project)
    }
    assert.equal(handlerRuns, 0, 'invalid descriptor input never reaches extension code')

    const valid = CommandBus.execute(project, 'vendor.validated.run', {
      count: 2, mode: 'fast', enabled: true, settings: { tag: 'OK' }, points: [0, 1],
    }, 'ai')
    assert.equal(valid.result.status, 'success')
    assert.equal(valid.updatedProject.project.description, 'fast:2')
    assert.equal(handlerRuns, 1)
  } finally {
    unregister()
  }
})

test('AI cannot execute extension commands without an explicit AI-enabled descriptor', () => {
  let handlerRuns = 0
  const module = {
    manifest: { id: 'vendor.aipolicy', version: '1.0.0', schema_version: 1 },
    activate: () => ({
      commands: {
        'vendor.aipolicy.human-only': context => {
          handlerRuns += 1
          return {
            result: { status: 'success', command_id: context.command_id, command_name: context.commandName, affected_object_ids: [] },
            updatedProject: context.updated,
            emittedEnvelope: context.envelope,
          }
        },
        'vendor.aipolicy.undocumented': context => {
          handlerRuns += 1
          return {
            result: { status: 'success', command_id: context.command_id, command_name: context.commandName, affected_object_ids: [] },
            updatedProject: context.updated,
            emittedEnvelope: context.envelope,
          }
        },
      },
      commandDescriptors: [{
        name: 'vendor.aipolicy.human-only', version: 1, owner_module: 'vendor.aipolicy',
        ai_allowed: false, confirmation: 'none', input_schema: { type: 'object', properties: {} },
      }],
    }),
  }
  const unregister = CommandBus.registerModule(module)
  try {
    const project = createDefaultResidentialProjectDocument('sdk-ai-policy')
    for (const command of ['vendor.aipolicy.human-only', 'vendor.aipolicy.undocumented']) {
      const rejected = CommandBus.execute(project, command, {}, 'ai')
      assert.equal(rejected.result.status, 'rejected')
      assert.match(rejected.result.errors[0], /AI is not authorized/)
      assert.deepEqual(rejected.updatedProject, project)
    }
    assert.equal(handlerRuns, 0)
    const human = CommandBus.execute(project, 'vendor.aipolicy.human-only', {}, 'human')
    assert.equal(human.result.status, 'success')
    assert.equal(handlerRuns, 1)
  } finally {
    unregister()
  }
})

test('module UI contributions require owned command descriptors and namespaced ids', () => {
  assert.throws(() => CommandBus.registerModule(testModule({
    ui: [{ id: 'unscoped.panel', title: 'Bad panel', actions: [] }],
  })), /must be namespaced/)
  assert.throws(() => CommandBus.registerModule(testModule({
    ui: [{ id: 'vendor.notes.panel', title: 'Bad action', actions: [{ id: 'vendor.notes.run', label: 'Run', command: 'vendor.notes.missing' }] }],
  })), /must reference a command with a descriptor/)
  const unregister = CommandBus.registerModule(testModule())
  try {
    const contribution = CommandBus.getModuleUIContributions()[0]
    assert.equal(contribution.id, 'vendor.notes.project_tools')
    contribution.actions[0].label = 'tampered outside host'
    assert.equal(CommandBus.getModuleUIContributions()[0].actions[0].label, 'Set project description')
  } finally {
    unregister()
  }
})

test('extension registry publishes registration changes for live host UI updates', () => {
  const initialRevision = CommandBus.getModuleRegistryRevision()
  let notifications = 0
  const unsubscribe = CommandBus.subscribeToModules(() => { notifications += 1 })
  const unregister = CommandBus.registerModule(testModule())
  try {
    assert.equal(CommandBus.getModuleRegistryRevision(), initialRevision + 1)
    assert.equal(notifications, 1)
  } finally {
    unregister()
    unsubscribe()
  }
  assert.equal(CommandBus.getModuleRegistryRevision(), initialRevision + 2)
  assert.equal(notifications, 2)
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
