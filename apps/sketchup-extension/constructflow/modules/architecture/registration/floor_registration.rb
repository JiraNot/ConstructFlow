# frozen_string_literal: true

# Floor commands, definitions and validation.
# Reopens Registration (split across registration/*.rb files).

module JiraNot
  module ConstructFlow
    module Architecture
      module Registration
        module_function

        def floor_validation_errors(input, runtime, validator)
          validator.validate(floor_definition_from_input(input, runtime)).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def modify_floor_validation_errors(input, runtime, repository, validator)
          object = resolve_floor(input, runtime)
          return ['floor not found'] unless object

          current = repository.read(object.entity)
          return ['floor definition missing'] unless current

          updated = current.with(
            boundary_mm: input[:boundary_mm] || input['boundary_mm'],
            holes_mm: input[:holes_mm] || input['holes_mm'] || current.holes_mm
          )
          validator.validate(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def floor_definition_from_input(input, runtime)
          level_id = input[:level_id] || input['level_id']
          offset = Float(input[:offset_mm] || input['offset_mm'] || 0)
          elevation = if level_id.nil? || level_id.to_s.empty?
                        offset
                      else
                        level = runtime.levels.fetch(level_id)
                        raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?

                        level.elevation_mm + offset
                      end
          boundary = Array(input[:boundary_mm] || input['boundary_mm']).map do |point|
            values = Array(point).dup
            values[2] = elevation
            values
          end
          holes = Array(input[:holes_mm] || input['holes_mm']).map do |loop|
            Array(loop).map do |point|
              values = Array(point).dup
              values[2] = elevation
              values
            end
          end
          FloorDefinition.new(
            boundary_mm: boundary,
            holes_mm: holes,
            level_id: level_id,
            offset_mm: offset,
            thickness_mm: input[:thickness_mm] || input['thickness_mm'] || 150,
            material_id: input[:material_id] || input['material_id']
          )
        end

        def floor_level_refs(definition)
          return [] if definition.level_id.nil? || definition.level_id.empty?

          [{ role: 'base', level_id: definition.level_id, offset_mm: definition.offset_mm }]
        end

        def resolve_floor(input, runtime)
          entity = input[:entity] || input['entity']
          object = if entity
                     runtime.smart_objects.fetch(entity)
                   else
                     runtime.smart_objects.fetch_by_id(input[:object_id] || input['object_id'])
                   end
          return nil unless object && object.type == 'architecture.floor' && object.owner_module == 'constructflow.architecture'

          object
        end

      end
    end
  end
end
