# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      module Validators
        class SurfaceValidator
          def validate_surface(definition)
            definition.errors.map { |message| issue('surface.boundary.validity', 'error', message) }.freeze
          end

          def validate_pattern(definition, surface_definition:)
            issues = definition.errors.map { |message| issue('surface.pattern.validity', 'error', message) }
            if definition.minimum_cut_mm > [definition.module_mm[0], definition.module_mm[1]].min
              issues << issue(
                'surface.pattern.minimum_cut',
                'warning',
                'minimum cut rule is larger than the smallest paving module dimension'
              )
            end
            if definition.pattern == 'radial' && !point_inside_box?(definition.origin_mm, surface_definition.bounding_box_mm)
              issues << issue('surface.pattern.radial_origin', 'warning', 'radial origin is outside surface bounding box')
            end
            issues.freeze
          end

          def validate_border(definition, surface_definition:)
            issues = definition.errors.map { |message| issue('surface.border.validity', 'error', message) }
            box = surface_definition.bounding_box_mm
            min_dimension = [box[:max][0] - box[:min][0], box[:max][1] - box[:min][1]].min
            if definition.offset_mode == 'inside' && definition.width_mm * 2.0 >= min_dimension
              issues << issue('surface.border.too_wide', 'warning', 'inside border may consume the entire surface field')
            end
            issues.freeze
          end

          def validate_parking(definition, surface_definition:)
            issues = definition.errors.map { |message| issue('surface.parking.validity', 'error', message) }
            if definition.footprint_area_mm2 > surface_definition.outer_area_mm2 * 1.2
              issues << issue('surface.parking.footprint', 'warning', 'parking layout footprint is substantially larger than surface area')
            end
            issues.freeze
          end

          private

          def point_inside_box?(point, box)
            point[0].between?(box[:min][0], box[:max][0]) &&
              point[1].between?(box[:min][1], box[:max][1])
          end

          def issue(rule_id, severity, message)
            { rule_id: rule_id, severity: severity, message: message }.freeze
          end
        end
      end
    end
  end
end
