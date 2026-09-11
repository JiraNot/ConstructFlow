# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module Quantity
        class DrainageQuantityProvider
          PROVIDER_ID = 'constructflow.drainage.quantity'
          FORMULA_VERSION = 1

          def manhole_quantities(smart_object:, definition:)
            [base_item(
              smart_object: smart_object,
              classification: 'drainage.manhole.unit',
              description: 'Drainage manhole',
              measure: 'count',
              value: 1.0,
              unit: 'pcs',
              breakdown: {
                manhole_type: definition.manhole_type,
                size_mm: definition.size_mm,
                depth_mm: definition.depth_mm
              }
            )].freeze
          end

          def pipe_quantities(smart_object:, definition:)
            [base_item(
              smart_object: smart_object,
              classification: "drainage.#{definition.system}.pipe",
              description: "Drainage #{definition.system} pipe Ø#{definition.diameter_mm.round}",
              measure: 'length',
              value: definition.length_mm / 1000.0,
              unit: 'm',
              breakdown: {
                diameter_mm: definition.diameter_mm,
                material: definition.material,
                route_strategy: definition.route_strategy,
                slope_percent: definition.slope_percent
              }
            )].freeze
          end

          def downpipe_quantities(smart_object:, definition:)
            [base_item(
              smart_object: smart_object,
              classification: 'drainage.rainwater.downpipe',
              description: "Rainwater downpipe Ø#{definition.diameter_mm.round}",
              measure: 'length',
              value: definition.length_mm / 1000.0,
              unit: 'm',
              breakdown: {
                diameter_mm: definition.diameter_mm,
                material: definition.material,
                route_strategy: definition.route_strategy,
                vertical_length_m: definition.vertical_length_mm / 1000.0,
                horizontal_length_m: definition.horizontal_length_mm / 1000.0
              }
            )].freeze
          end

          private

          def base_item(smart_object:, classification:, description:, measure:, value:, unit:, breakdown:)
            {
              source_object_id: smart_object.id,
              source_module: 'constructflow.drainage',
              provider: PROVIDER_ID,
              classification: classification,
              description: description,
              measure: measure,
              value: value,
              unit: unit,
              phase_scope: phase_scope(smart_object),
              formula_version: FORMULA_VERSION,
              breakdown: breakdown.freeze,
              confidence: smart_object.source_state
            }.freeze
          end

          def phase_scope(smart_object)
            smart_object.removed_phase == Core::Phase::DEMOLITION ? 'demolition' : smart_object.created_phase
          end
        end
      end
    end
  end
end
