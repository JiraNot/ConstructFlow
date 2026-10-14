/** Self-contained example bundle. Save/import this file from the Extensions tab. */
export default {
  manifest: { id: 'example.project-note', version: '1.0.0', schema_version: 1 },
  activate({ moduleId }) {
    const command = `${moduleId}.set_project_note`
    return {
      commands: {
        [command](context) {
          context.updated.project.description = String(context.input.description ?? '')
          return {
            result: { status: 'success', command_id: context.command_id, command_name: context.commandName, affected_object_ids: [] },
            updatedProject: context.updated,
            emittedEnvelope: context.envelope,
          }
        },
      },
      commandDescriptors: [{
        name: command, version: 1, owner_module: moduleId, ai_allowed: false, confirmation: 'none',
        input_schema: {
          type: 'object',
          properties: { description: { type: 'string', title: 'Project note', maxLength: 500 } },
          required: ['description'], additionalProperties: false,
        },
        preconditions_summary: 'An editable project is open',
      }],
      ui: [{
        id: `${moduleId}.actions`, title: 'Example module actions',
        actions: [{
          id: `${moduleId}.set_note_action`, label: 'Set project note', command,
          description: 'Set the project description through the shared command session.',
        }],
      }],
    }
  },
}
