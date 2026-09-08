# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      module Validators
        class RoofValidator
          MIN_SLOPE_PERCENT = {
            'generic' => 0.5,
            'metal_sheet' => 3.0,
            'tile' => 15.0,
            'polycarbonate' => 5.0,
            'glass' => 2.0
          }.freeze

          def validate_roof(definition)
            issues = definition.errors.map { |message| issue('roof.validity', 'error', message) }
            return issues.freeze unless definition.errors.empty?

            minimum = MIN_SLOPE_PERCENT.fetch(definition.covering_system, 0.5)
            if definition.slope_percent < minimum
              issues << issue(
                'roof.minimum_slope',
                'warning',
                format('%s roof slope %.2f%% is below configured %.2f%%', definition.covering_system, definition.slope_percent, minimum),
                configured_minimum_percent: minimum
              )
            end
            issues.freeze
          end

          def validate_gutter(definition, roof_definition:)
            issues = definition.errors.map { |message| issue('roof.gutter.validity', 'error', message) }
            if definition.edge_index >= roof_definition.boundary_mm.length
              issues << issue('roof.gutter.edge_missing', 'error', 'gutter roof edge index is out of range')
            end
            issues.freeze
          end

          private

          def issue(rule_id, severity, message, extra = {})
            { rule_id: rule_id, severity: severity, message: message }.merge(extra).freeze
          end
        end
      end
    end
  end
end
