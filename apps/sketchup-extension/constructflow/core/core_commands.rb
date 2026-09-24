# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Registration of the core (constructflow.core) commands, extracted from
      # Runtime so main.rb stays a thin composition root.
      module CoreCommands
        module_function

        def register(runtime)
          register_set_working_phase(runtime)
          register_update_project_metadata(runtime)
          register_create_level(runtime)
          register_modify_level(runtime)
          register_convert_selection_to_smart_object(runtime)
          register_demolish_object(runtime)
        end

        def register_set_working_phase(runtime)
          runtime.commands.register('SetWorkingPhase', owner_module: 'constructflow.core', validator: lambda { |command|
            phase = command[:input][:phase] || command[:input]['phase']
            Phase.valid?(phase) ? [] : ["invalid phase: #{phase}"]
          }) do |command|
            phase = command[:input][:phase] || command[:input]['phase']
            previous = runtime.project.working_phase
            runtime.project.working_phase = phase
            { events: [{ name: 'WorkingPhaseChanged', payload: { previous: previous, current: phase.to_s } }] }
          end
        end

        def register_update_project_metadata(runtime)
          runtime.commands.register('UpdateProjectMetadata', owner_module: 'constructflow.core', validator: lambda { |command|
            name = command[:input][:name] || command[:input]['name']
            name.to_s.strip.empty? ? ['project name required'] : []
          }) do |command|
            input = command[:input]
            project = runtime.project.update_metadata!(
              name: input[:name] || input['name'],
              code: input.key?(:code) ? input[:code] : input['code']
            )
            { events: [{ name: 'ProjectChanged', payload: { project: project } }] }
          end
        end

        def register_create_level(runtime)
          runtime.commands.register('CreateLevel', owner_module: 'constructflow.core', validator: lambda { |command|
            input = command[:input]; errors = []
            errors << 'level id required' if (input[:id] || input['id']).to_s.strip.empty?
            errors << 'level name required' if (input[:name] || input['name']).to_s.strip.empty?
            errors
          }) do |command|
            input = command[:input]
            level = runtime.levels.register(id: input[:id] || input['id'], name: input[:name] || input['name'],
                                            kind: input[:kind] || input['kind'] || 'custom',
                                            elevation_mm: input.key?(:elevation_mm) ? input[:elevation_mm] : input['elevation_mm'],
                                            source_state: input[:source_state] || input['source_state'] || 'confirmed')
            { events: [{ name: 'LevelCreated', payload: { level: level.to_h } }] }
          end
        end

        def register_modify_level(runtime)
          runtime.commands.register('ModifyLevel', owner_module: 'constructflow.core', validator: lambda { |command|
            id = command[:input][:id] || command[:input]['id']; id.to_s.strip.empty? ? ['level id required'] : []
          }) do |command|
            input = command[:input]; id = input[:id] || input['id']; before = runtime.levels.fetch(id).to_h
            level = runtime.levels.update(id, name: input[:name] || input['name'], kind: input[:kind] || input['kind'],
                                          elevation_mm: input.key?(:elevation_mm) ? input[:elevation_mm] : input['elevation_mm'],
                                          source_state: input[:source_state] || input['source_state'])
            { events: [{ name: 'LevelChanged', payload: { before: before, after: level.to_h } }] }
          end
        end

        def register_convert_selection_to_smart_object(runtime)
          runtime.commands.register('ConvertSelectionToSmartObject', owner_module: 'constructflow.core', validator: lambda { |command|
            input = command[:input]; errors = []
            errors << 'entity required' unless input[:entity] || input['entity']
            errors << 'type required' if (input[:type] || input['type']).to_s.strip.empty?
            owner = (input[:owner_module] || input['owner_module']).to_s
            errors << 'registered owner_module required' unless runtime.modules.registered?(owner)
            errors
          }) do |command|
            input = command[:input]
            object = runtime.smart_objects.create(entity: input[:entity] || input['entity'], type: input[:type] || input['type'],
                                                  owner_module: input[:owner_module] || input['owner_module'],
                                                  schema_version: input[:schema_version] || input['schema_version'] || 1,
                                                  display_name: input[:display_name] || input['display_name'],
                                                  created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
                                                  removed_phase: input[:removed_phase] || input['removed_phase'],
                                                  level_refs: input[:level_refs] || input['level_refs'] || [],
                                                  source_state: input[:source_state] || input['source_state'] || 'confirmed')
            { created_object_ids: [object.id], events: [{ name: 'ObjectCreated', object_ids: [object.id], payload: { type: object.type } },
                                                        { name: 'ObjectConverted', object_ids: [object.id], payload: { type: object.type } }] }
          end
        end

        def register_demolish_object(runtime)
          runtime.commands.register('DemolishObject', owner_module: 'constructflow.core', validator: lambda { |command|
            object = resolve_object(runtime, command[:input])
            if object.nil? then ['smart object required'] elsif object.created_phase != Phase::EXISTING then ['only existing construction can be demolished'] else [] end
          }) do |command|
            object = resolve_object(runtime, command[:input])
            updated = runtime.smart_objects.update_lifecycle(object.entity, removed_phase: Phase::DEMOLITION)
            runtime.smart_objects.mark_dirty(updated.entity, 'dirty_quantity', 'dirty_drawing')
            { updated_object_ids: [updated.id], events: [{ name: 'ObjectDemolished', object_ids: [updated.id] },
                                                        { name: 'ObjectPhaseChanged', object_ids: [updated.id], payload: { removed_phase: Phase::DEMOLITION } }] }
          end
        end

        def resolve_object(runtime, input)
          entity = input[:entity] || input['entity']; return runtime.smart_objects.fetch(entity) if entity
          object_id = input[:object_id] || input['object_id']; object_id ? runtime.smart_objects.fetch_by_id(object_id) : nil
        end
      end
    end
  end
end
