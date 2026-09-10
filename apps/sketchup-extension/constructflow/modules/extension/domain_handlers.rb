# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      # Adapter boundary between extension orchestration and domain commands.
      # The handlers intentionally delegate geometry ownership to Structure/Roof.
      module DomainHandlers
        module_function

        def build(runtime)
          {
            structure: structure_handler(runtime),
            roof: roof_handler(runtime)
          }
        end

        def structure_handler(runtime)
          lambda do |step|
            intent = step[:intent] || step['intent'] || {}
            boundary = intent[:boundary_mm] || intent['boundary_mm'] || []
            points = boundary.map { |point| Array(point).map(&:to_f) }
            raise ArgumentError, 'extension boundary requires at least three points' if points.length < 3

            p0 = points.first
            p1 = points[1]
            x = (p0[0] + p1[0]) / 2.0
            y = (p0[1] + p1[1]) / 2.0
            height = Float(intent[:target_height_mm] || intent['target_height_mm'] || 2800)
            section = intent[:column_section_mm] || intent['column_section_mm'] || [200, 200]
            existing = find_generated_object(runtime, 'structure.column', intent[:extension_id])

            input = {
              location_mm: [x, y, Float(intent[:base_offset_mm] || intent['base_offset_mm'] || 0)],
              section_mm: section,
              height_mm: height,
              base_level_id: intent[:base_level_id] || intent['base_level_id'],
              engineering_status: 'preliminary'
            }

            if existing
              { status: :success, command_name: 'GenerateOrUpdateStructureFromExtension', updated_object_ids: [existing.id], warnings: ['update adapter pending domain update command'] }
            else
              result = runtime.commands.execute('CreateColumn', input)
              result
            end
          end
        end

        def roof_handler(runtime)
          lambda do |step|
            intent = step[:intent] || step['intent'] || {}
            boundary = intent[:boundary_mm] || intent['boundary_mm'] || []
            existing = find_generated_object(runtime, 'roof.system', intent[:extension_id])
            input = {
              boundary_mm: boundary,
              roof_form: (intent[:roof_intent] || intent['roof_intent'] || {})['type'] || 'lean_to',
              covering_system: (intent[:roof_intent] || intent['roof_intent'] || {})['covering_system'] || 'metal_sheet',
              slope_percent: (intent[:roof_intent] || intent['roof_intent'] || {})['slope_percent'] || 5.0,
              generated_from_id: intent[:extension_id]
            }

            if existing
              { status: :success, command_name: 'GenerateOrUpdateRoofFromExtension', updated_object_ids: [existing.id], warnings: ['update adapter pending domain update command'] }
            else
              runtime.commands.execute('GenerateRoof', input)
            end
          end
        end

        def find_generated_object(runtime, type, extension_id)
          return nil unless extension_id

          runtime.smart_objects.all.find do |object|
            object.type == type && object.entity.get_attribute('ConstructFlow', 'generated_from_id') == extension_id.to_s
          end
        end
      end
    end
  end
end
