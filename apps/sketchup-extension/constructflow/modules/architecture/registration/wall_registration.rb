# frozen_string_literal: true

# Wall commands, schedule editor and validation.
# Reopens Registration (split across registration/*.rb files).

module JiraNot
  module ConstructFlow
    module Architecture
      module Registration
        module_function

        WALL_SCHEDULE = Core::ScheduleDefinition.new(
          id: 'architecture.wall.schedule',
          name: 'Smart Wall Schedule',
          object_type: 'architecture.wall',
          columns: [
            { id: 'wall_type_id', label: 'Wall Type', field_type: 'text', editable: true, scope: 'type' },
            { id: 'thickness_mm', label: 'Thickness (mm)', field_type: 'number', editable: true, scope: 'instance' },
            { id: 'height_m', label: 'Height (m)', field_type: 'number', calculated: true },
            { id: 'length_m', label: 'Length (m)', field_type: 'number', calculated: true },
            { id: 'volume_m3', label: 'Volume (m³)', field_type: 'number', calculated: true },
            { id: 'base_level_id', label: 'Base Level', field_type: 'text', calculated: true }
          ]
        ).freeze

        def wall_schedule_editor(runtime)
          repository = WallRepository.new
          Core::ScheduleEditor.new(
            schema: WALL_SCHEDULE,
            row_provider: lambda { |object|
              definition = repository.read(object.entity)
              {
                wall_type_id: definition.wall_type_id,
                thickness_mm: definition.thickness_mm,
                height_m: definition.height_mm / 1000.0,
                length_m: definition.length_mm / 1000.0,
                volume_m3: definition.volume_mm3 / 1_000_000_000.0,
                base_level_id: definition.base_level_id
              }
            },
            updater: lambda { |change| wall_schedule_update_result(runtime, change) }
          )
        end

        def validation_errors(input, runtime, validator)
          definition = definition_from_input(input, runtime)
          validator.validate(definition).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def wall_schedule_validation_errors(input, runtime, repository, validator)
          object = resolve_wall(input, runtime)
          return ['wall not found'] unless object

          current = repository.read(object.entity)
          return ['wall definition missing'] unless current

          field_id = (input[:field_id] || input['field_id']).to_s
          value = input.key?(:value) ? input[:value] : input['value']
          updated = case field_id
                    when 'wall_type_id' then current.with(wall_type_id: value)
                    when 'thickness_mm' then current.with(thickness_mm: value)
                    else raise ArgumentError, "wall schedule field is not editable: #{field_id}"
                    end
          validator.validate(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def wall_schedule_update_result(runtime, change)
          runtime.commands.execute(
            'EditWallSchedule',
            { object_id: change[:object_id], field_id: change[:field_id], value: change[:value] },
            project_id: runtime.project.project_id
          )
        end

        def wall_exists_validation_errors(input, runtime, repository)
          object = resolve_wall(input, runtime)
          return ['wall not found'] unless object
          return ['wall definition missing'] unless repository.read(object.entity)

          []
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
            wall_type_id: input[:wall_type_id] || input['wall_type_id'] || current.wall_type_id,
            base_offset_mm: input.key?(:base_offset_mm) ? input[:base_offset_mm] : (input.key?('base_offset_mm') ? input['base_offset_mm'] : current.base_offset_mm),
            height_mm: input[:height_mm] || input['height_mm'] || current.height_mm,
            base_level_id: input.key?(:base_level_id) ? input[:base_level_id] : (input.key?('base_level_id') ? input['base_level_id'] : current.base_level_id),
            top_constraint: input[:top_constraint] || input['top_constraint'] || current.top_constraint,
            top_constraint_level_id: input.key?(:top_constraint_level_id) ? input[:top_constraint_level_id] : (input.key?('top_constraint_level_id') ? input['top_constraint_level_id'] : current.top_constraint_level_id),
            top_offset_mm: input.key?(:top_offset_mm) ? input[:top_offset_mm] : (input.key?('top_offset_mm') ? input['top_offset_mm'] : current.top_offset_mm)
          )
          updated = apply_level_constraints(updated, runtime)
          validator.validate(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def change_constraints_validation_errors(input, runtime, repository)
          smart_object = resolve_wall(input, runtime)
          return ['wall not found'] unless smart_object

          current = repository.read(smart_object.entity)
          return ['wall definition missing'] unless current

          constraints = input.key?(:constraints) ? input[:constraints] : input['constraints']
          candidate = current.with(constraints: constraints || [])
          candidate.errors
        rescue StandardError => error
          [error.message]
        end

        def transform_validation_errors(input, runtime, repository, validator, kind)
          smart_object = resolve_wall(input, runtime)
          return ['wall not found'] unless smart_object

          current = repository.read(smart_object.entity)
          return ['wall definition missing'] unless current

          updated = if %i[move copy].include?(kind)
                      current.translated(input[:delta_mm] || input['delta_mm'])
                    elsif kind == :segment
                      current.translated_segment(
                        index: input[:segment_index] || input['segment_index'],
                        delta_mm: input[:delta_mm] || input['delta_mm']
                      )
                    else
                      current.stretched_endpoint(
                        index: input[:endpoint_index] || input['endpoint_index'],
                        point_mm: input[:point_mm] || input['point_mm']
                      )
                    end
          updated = apply_level_constraints(updated, runtime)
          validate_hosted_openings!(smart_object, updated, repository, nil)
          validator.validate(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def wall_geometry_changed_result(smart_object)
          {
            updated_object_ids: [smart_object.id],
            events: [
              { name: 'GeometryChanged', object_ids: [smart_object.id] },
              { name: 'QuantityDirty', object_ids: [smart_object.id] },
              { name: 'DrawingDirty', object_ids: [smart_object.id] }
            ]
          }
        end

        def definition_from_input(input, runtime)
          base_z = base_elevation_mm(input, runtime)
          base_level_id = input[:base_level_id] || input['base_level_id'] || input[:level_id] || input['level_id']
          top_constraint = input[:top_constraint] || input['top_constraint'] || 'unconnected'
          top_constraint_level_id = input[:top_constraint_level_id] || input['top_constraint_level_id']
          top_offset_mm = Float(input[:top_offset_mm] || input['top_offset_mm'] || 0)
          path = Array(input[:path_mm] || input['path_mm']).map do |point|
            values = Array(point).dup
            values[2] = base_z unless base_z.nil?
            values
          end
          height_mm = Float(input[:height_mm] || input['height_mm'] || WallDefinition::DEFAULT_HEIGHT_MM)
          if top_constraint == 'level'
            raise ArgumentError, 'top constraint level id required' if top_constraint_level_id.to_s.empty?

            top_level = runtime.levels.fetch(top_constraint_level_id)
            raise ArgumentError, "level #{top_constraint_level_id} has unknown elevation" if top_level.elevation_mm.nil?

            base_elevation = base_z.nil? ? Float(path.first&.[](2) || 0) : base_z
            height_mm = top_level.elevation_mm + top_offset_mm - base_elevation
          end

          WallDefinition.new(
            path_mm: path,
            thickness_mm: input[:thickness_mm] || input['thickness_mm'] || WallDefinition::DEFAULT_THICKNESS_MM,
            height_mm: height_mm,
            base_offset_mm: input[:base_offset_mm] || input['base_offset_mm'] || 0,
            wall_type_id: input[:wall_type_id] || input['wall_type_id'] || 'generic.wall.100',
            orientation: input[:orientation] || input['orientation'] || 'center',
            layers: input[:layers] || input['layers'] || [],
            core_layer_id: input[:core_layer_id] || input['core_layer_id'],
            base_level_id: base_level_id,
            top_constraint: top_constraint,
            top_constraint_level_id: top_constraint_level_id,
            top_offset_mm: top_offset_mm,
            location_line: input[:location_line] || input['location_line'] || 'center',
            room_bounding: input.key?(:room_bounding) ? input[:room_bounding] : (input.key?('room_bounding') ? input['room_bounding'] : true),
            phase_lifecycle: input[:phase_lifecycle] || input['phase_lifecycle'] || 'new',
            joins: input[:joins] || input['joins'] || [],
            constraints: input[:constraints] || input['constraints'] || []
          )
        end

        def apply_level_constraints(definition, runtime)
          definition = definition.apply_constraints
          base_elevation = definition.base_level_id.to_s.empty? ? nil : level_elevation(runtime, definition.base_level_id) + definition.base_offset_mm
          path = definition.path_mm.map do |point|
            base_elevation.nil? ? point : [point[0], point[1], base_elevation]
          end
          height = definition.height_mm
          if definition.top_constraint == 'level'
            top_elevation = level_elevation(runtime, definition.top_constraint_level_id)
            height = top_elevation + definition.top_offset_mm - (base_elevation || path.first&.[](2).to_f)
          end
          definition.with(path_mm: path, height_mm: height)
        end

        def level_elevation(runtime, level_id)
          level = runtime.levels.fetch(level_id)
          raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?

          level.elevation_mm.to_f
        end

        def base_elevation_mm(input, runtime)
          level_id = input[:level_id] || input['level_id'] || input[:base_level_id] || input['base_level_id']
          return nil if level_id.nil? || level_id.to_s.empty?

          level = runtime.levels.fetch(level_id)
          raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?

          level.elevation_mm + Float(input[:base_offset_mm] || input['base_offset_mm'] || 0)
        end

        def level_refs(input)
          level_id = input[:level_id] || input['level_id'] || input[:base_level_id] || input['base_level_id']
          return [] if level_id.nil? || level_id.to_s.empty?

          [{
            role: 'base',
            level_id: level_id.to_s,
            offset_mm: Float(input[:base_offset_mm] || input['base_offset_mm'] || 0)
          }]
        end

        def level_refs_for_definition(definition)
          return [] if definition.base_level_id.to_s.empty?

          [{
            role: 'base',
            level_id: definition.base_level_id,
            offset_mm: definition.base_offset_mm
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

      end
    end
  end
end
