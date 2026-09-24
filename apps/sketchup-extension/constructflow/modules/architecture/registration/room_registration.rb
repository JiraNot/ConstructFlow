# frozen_string_literal: true

# Room commands, schedule editor, detection and validation.
# Reopens Registration (split across registration/*.rb files).

module JiraNot
  module ConstructFlow
    module Architecture
      module Registration
        module_function

        ROOM_SCHEDULE = Core::ScheduleDefinition.new(
          id: 'architecture.room.schedule',
          name: 'Room Schedule',
          object_type: 'architecture.room',
          columns: [
            { id: 'name', label: 'Name', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'number', label: 'Number', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'program', label: 'Program', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'usage', label: 'Usage', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'area_m2', label: 'Area (m²)', field_type: 'number', calculated: true },
            { id: 'perimeter_m', label: 'Perimeter (m)', field_type: 'number', calculated: true }
          ]
        ).freeze

        def schedule_editor(runtime)
          repository = RoomRepository.new
          Core::ScheduleEditor.new(
            schema: ROOM_SCHEDULE,
            row_provider: lambda { |object|
              definition = repository.read(object.entity)
              {
                name: definition.name,
                number: definition.number,
                program: definition.program,
                usage: definition.usage,
                area_m2: definition.area_mm2 / 1_000_000.0,
                perimeter_m: definition.perimeter_mm / 1000.0
              }
            },
            updater: lambda { |change| room_schedule_update_result(runtime, change) }
          )
        end

        def room_validation_errors(input, runtime, validator)
          validator.validate(room_definition_from_input(input, runtime)).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def modify_room_validation_errors(input, runtime, repository, validator)
          object = resolve_room(input, runtime)
          return ['room not found'] unless object

          current = repository.read(object.entity)
          return ['room definition missing'] unless current

          validator.validate(current.with(boundary_mm: input[:boundary_mm] || input['boundary_mm'])).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def room_schedule_validation_errors(input, runtime, repository, validator)
          object = resolve_room(input, runtime)
          return ['room not found'] unless object

          current = repository.read(object.entity)
          return ['room definition missing'] unless current

          field_id = (input[:field_id] || input['field_id']).to_s
          value = input.key?(:value) ? input[:value] : input['value']
          updated = case field_id
                    when 'name' then current.with(name: value)
                    when 'number' then current.with(number: value)
                    when 'program' then current.with(program: value)
                    when 'usage' then current.with(usage: value)
                    else raise ArgumentError, "room schedule field is not editable: #{field_id}"
                    end
          validator.validate(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def room_schedule_update_result(runtime, change)
          runtime.commands.execute(
            'EditRoomSchedule',
            { object_id: change[:object_id], field_id: change[:field_id], value: change[:value] },
            project_id: runtime.project.project_id
          )
        end

        def room_definition_from_input(input, runtime)
          level_id = input[:level_id] || input['level_id']
          elevation = if level_id.nil? || level_id.to_s.empty?
                        Float(input[:elevation_mm] || input['elevation_mm'] || 0)
                      else
                        level = runtime.levels.fetch(level_id)
                        raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?

                        level.elevation_mm
                      end
          boundary = Array(input[:boundary_mm] || input['boundary_mm']).map do |point|
            values = Array(point).dup
            values[2] = elevation
            values
          end
          RoomDefinition.new(
            boundary_mm: boundary,
            level_id: level_id,
            name: input[:name] || input['name'] || '',
            number: input[:number] || input['number'] || '',
            program: input[:program] || input['program'] || 'generic',
            usage: input[:usage] || input['usage'],
            finish_metadata: input[:finish_metadata] || input['finish_metadata'] || {}
          )
        end

        def room_display_name(definition)
          [definition.number, definition.name].reject(&:empty?).join(' — ').then { |value| value.empty? ? 'Room' : value }
        end

        def room_level_refs(definition)
          return [] if definition.level_id.nil? || definition.level_id.empty?

          [{ role: 'base', level_id: definition.level_id }]
        end

        def resolve_room(input, runtime)
          entity = input[:entity] || input['entity']
          object = if entity
                     runtime.smart_objects.fetch(entity)
                   else
                     runtime.smart_objects.fetch_by_id(input[:object_id] || input['object_id'])
                   end
          return nil unless object && object.type == 'architecture.room' && object.owner_module == 'constructflow.architecture'

          object
        end

      end
    end
  end
end
