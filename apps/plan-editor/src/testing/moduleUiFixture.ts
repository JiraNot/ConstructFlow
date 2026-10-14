import type { ConstructFlowModule } from '@constructflow/module-sdk'
import { CommandBus } from '../commands/CommandBus.js'

const fixture: ConstructFlowModule = {
  manifest: { id: 'sample.ui-fixture', version: '1.0.0', schema_version: 1 },
  activate: ({ moduleId }) => ({
    commands: {
      'sample.ui-fixture.set_note': context => {
        const priority = context.input.priority === undefined ? '' : ` (priority ${String(context.input.priority)})`
        context.updated.project.description = `${String(context.input.description ?? '')}${priority}`
        return {
          result: { status: 'success', command_id: context.command_id, command_name: context.commandName, affected_object_ids: [] },
          updatedProject: context.updated,
          emittedEnvelope: context.envelope,
        }
      },
    },
    commandDescriptors: [{
      name: 'sample.ui-fixture.set_note', version: 1, owner_module: moduleId,
      ai_allowed: false, confirmation: 'required',
      input_schema: {
        type: 'object',
        properties: {
          description: { type: 'string', title: 'Project note' },
          priority: { title: 'Priority', enum: [1, 2], default: 1 },
        },
        required: ['description', 'priority'],
      },
    }],
    ui: [{
      id: 'sample.ui-fixture.project_actions', title: 'Sample extension actions',
      description: 'Test action submitted through the host project session.',
      actions: [{ id: 'sample.ui-fixture.set_note_action', label: 'Set project note', command: 'sample.ui-fixture.set_note' }],
    }],
  }),
}

export function registerModuleUIFixture() {
  return CommandBus.registerModule(fixture)
}
