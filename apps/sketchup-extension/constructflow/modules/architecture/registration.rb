# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Registration
        MANIFEST = {
          id: 'constructflow.architecture',
          name: 'Architecture',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[opening.host_integration surface.finish structure.coordination],
          provides: %w[wall.host_surface architecture.wall_quantity],
          objects: ['architecture.wall'],
          commands: %w[CreateWall ModifyWallPath ChangeWallType],
          events: %w[GeometryChanged ParametersChanged QuantityDirty DrawingDirty],
          providers: ['constructflow.architecture.wall_quantity'],
          validators: ['architecture.wall.validity']
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.architecture')

          runtime.module_loader.load(MANIFEST)
          repository = WallRepository.new
          geometry = WallGeometry.new
          validator = Validators::WallValidator.new

          runtime.commands.register(
            'CreateWall',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { validation_errors(command[:input], runtime, validator) }
          ) do |command|
            input = command[:input]
            definition = definition_from_input(input, runtime)
            group = geometry.create_group(runtime.active_model, definition)
            smart_object = runtime.smart_objects.create(
              entity: group,
              type: 'architecture.wall',
              owner_module: 'constructflow.architecture',
              display_name: input[:display_name] || input['display_name'] || 'Wall',
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: level_refs(input),
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')

            {
              created_object_ids: [smart_object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [smart_object.id], payload: { type: 'architecture.wall' } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ModifyWallPath',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { modify_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_wall(input, runtime)
            current = repository.read(smart_object.entity)
            updated = current.with(path_mm: input[:path_mm] || input['path_mm'])
            geometry.rebuild!(smart_object.entity, updated)
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')

            {
              updated_object_ids: [smart_object.id],
              events: [
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ChangeWallType',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { change_type_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_wall(input, runtime)
            current = repository.read(smart_object.entity)
            updated = current.with(
              thickness_mm: input[:thickness_mm] || input['thickness_mm'] || current.thickness_mm,
              wall_type_id: input[:wall_type_id] || input['wall_type_id'] || current.wall_type_id
            )
            geometry.rebuild!(smart_object.entity, updated)
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')

            {
              updated_object_ids: [smart_object.id],
              events: [
                { name: 'ParametersChanged', object_ids: [smart_object.id], payload: { wall_type_id: updated.wall_type_id } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          install_ui(runtime)
        end

        def validation_errors(input, runtime, validator)
          definition = definition_from_input(input, runtime)
          validator.validate(definition).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def modify_validation_errors(input, runtime, repository, validator)
          smart_object = resolve_wall(input, runtime)
          return ['wall not found'] unless smart_object

          current = repository.read(smart_object.entity)
          return ['wall definition missing'] unless current

          updated = current.with(path_mm: input[:path_mm] || input['path_mm'])
          validator.validate(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def change_type_validation_errors(input, runtime, repository, validator)
          smart_object = resolve_wall(input, runtime)
          return ['wall not found'] unless smart_object

          current = repository.read(smart_object.entity)
          return ['wall definition missing'] unless current

          updated = current.with(
            thickness_mm: input[:thickness_mm] || input['thickness_mm'] || current.thickness_mm,
            wall_type_id: input[:wall_type_id] || input['wall_type_id'] || current.wall_type_id
          )
          validator.validate(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def definition_from_input(input, runtime)
          base_z = base_elevation_mm(input, runtime)
          path = Array(input[:path_mm] || input['path_mm']).map do |point|
            values = Array(point).dup
            values[2] = base_z unless base_z.nil?
            values
          end

          WallDefinition.new(
            path_mm: path,
            thickness_mm: input[:thickness_mm] || input['thickness_mm'] || WallDefinition::DEFAULT_THICKNESS_MM,
            height_mm: input[:height_mm] || input['height_mm'] || WallDefinition::DEFAULT_HEIGHT_MM,
            base_offset_mm: input[:base_offset_mm] || input['base_offset_mm'] || 0,
            wall_type_id: input[:wall_type_id] || input['wall_type_id'] || 'generic.wall.100',
            orientation: input[:orientation] || input['orientation'] || 'center'
          )
        end

        def base_elevation_mm(input, runtime)
          level_id = input[:level_id] || input['level_id']
          return nil if level_id.nil? || level_id.to_s.empty?

          level = runtime.levels.fetch(level_id)
          raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?

          level.elevation_mm + Float(input[:base_offset_mm] || input['base_offset_mm'] || 0)
        end

        def level_refs(input)
          level_id = input[:level_id] || input['level_id']
          return [] if level_id.nil? || level_id.to_s.empty?

          [{
            role: 'base',
            level_id: level_id.to_s,
            offset_mm: Float(input[:base_offset_mm] || input['base_offset_mm'] || 0)
          }]
        end

        def resolve_wall(input, runtime)
          entity = input[:entity] || input['entity']
          object = if entity
                     runtime.smart_objects.fetch(entity)
                   else
                     runtime.smart_objects.fetch_by_id(input[:object_id] || input['object_id'])
                   end
          return nil unless object && object.type == 'architecture.wall' && object.owner_module == 'constructflow.architecture'

          object
        end

        def install_ui(runtime)
          architecture_menu = runtime.menu.add_submenu('Architecture')
          architecture_menu.add_item('Draw Smart Wall') do
            values = UI.inputbox(
              ['Thickness (mm)', 'Height (mm)', 'Base level ID (optional)'],
              ['100', '2800', ''],
              'ConstructFlow Smart Wall'
            )
            next unless values

            thickness = Float(values[0])
            height = Float(values[1])
            level_id = values[2].to_s
            runtime.active_model.select_tool(
              Tools::WallTool.new(
                runtime: runtime,
                thickness_mm: thickness,
                height_mm: height,
                level_id: level_id
              )
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end
        end
      end
    end
  end
end
