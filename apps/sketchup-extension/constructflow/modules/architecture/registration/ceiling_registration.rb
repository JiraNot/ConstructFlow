# frozen_string_literal: true

# Ceiling commands, definitions and validation.
# Reopens Registration (split across registration/*.rb files).

module JiraNot
  module ConstructFlow
    module Architecture
      module Registration
        module_function

        def ceiling_validation_errors(input, runtime, validator)
          validator.validate(ceiling_definition_from_input(input, runtime)).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def modify_ceiling_validation_errors(input, runtime, repository, validator)
          object = resolve_ceiling(input, runtime)
          return ['ceiling not found'] unless object

          current = repository.read(object.entity)
          return ['ceiling definition missing'] unless current

          validator.validate(
            current.with(
              boundary_mm: input[:boundary_mm] || input['boundary_mm'],
              holes_mm: input[:holes_mm] || input['holes_mm'] || current.holes_mm
            )
          ).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def ceiling_definition_from_input(input, runtime)
          level_id = input[:level_id] || input['level_id']
          base_elevation = if level_id.nil? || level_id.to_s.empty?
                             Float(input[:base_elevation_mm] || input['base_elevation_mm'] || 0)
                           else
                             level = runtime.levels.fetch(level_id)
                             raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?

                             level.elevation_mm
                           end
          height = Float(input[:height_mm] || input['height_mm'] || 2700)
          elevation = base_elevation + height + Float(input[:offset_mm] || input['offset_mm'] || 0)
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
          CeilingDefinition.new(
            boundary_mm: boundary, holes_mm: holes, level_id: level_id, height_mm: height,
            offset_mm: input[:offset_mm] || input['offset_mm'] || 0,
            thickness_mm: input[:thickness_mm] || input['thickness_mm'] || 12,
            material_id: input[:material_id] || input['material_id']
          )
        end

        def ceiling_level_refs(definition)
          return [] if definition.level_id.nil? || definition.level_id.empty?

          [{ role: 'base', level_id: definition.level_id, offset_mm: definition.offset_mm }]
        end

        def resolve_ceiling(input, runtime)
          entity = input[:entity] || input['entity']
          object = if entity
                     runtime.smart_objects.fetch(entity)
                   else
                     runtime.smart_objects.fetch_by_id(input[:object_id] || input['object_id'])
                   end
          return nil unless object && object.type == 'architecture.ceiling' && object.owner_module == 'constructflow.architecture'

          object
        end

      end
    end
  end
end
