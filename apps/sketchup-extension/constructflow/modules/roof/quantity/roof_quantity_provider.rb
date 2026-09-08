# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      module Quantity
        class RoofQuantityProvider
          PROVIDER_ID = 'constructflow.roof.quantity'
          FORMULA_VERSION = 1

          def roof_quantities(smart_object:, definition:)
            [
              item(
                smart_object: smart_object,
                classification: "roof.#{definition.covering_system}.covering",
                description: "#{definition.covering_system} roof covering",
                measure: 'area',
                value: definition.roof_area_mm2 / 1_000_000.0,
                unit: 'm2',
                breakdown: {
                  plan_area_m2: definition.plan_area_mm2 / 1_000_000.0,
                  slope_percent: definition.slope_percent,
                  roof_form: definition.roof_form
                }
              ),
              item(
                smart_object: smart_object,
                classification: 'roof.perimeter',
                description: 'Roof perimeter',
                measure: 'length',
                value: definition.perimeter_mm / 1000.0,
                unit: 'm',
                breakdown: { covering_system: definition.covering_system }
              )
            ].freeze
          end

          def gutter_quantities(smart_object:, definition:, roof_object:, edge_capability:)
            length_mm = edge_capability.edge_length_mm(roof_object, definition.edge_index)
            [item(
              smart_object: smart_object,
              classification: 'roof.gutter.length',
              description: 'Roof gutter',
              measure: 'length',
              value: length_mm / 1000.0,
              unit: 'm',
              breakdown: { profile_id: definition.profile_id, roof_object_id: definition.roof_object_id }
            )].freeze
          end

          private

          def item(smart_object:, classification:, description:, measure:, value:, unit:, breakdown:)
            {
              source_object_id: smart_object.id,
              source_module: 'constructflow.roof',
              provider: PROVIDER_ID,
              classification: classification,
              description: description,
              measure: measure,
              value: value,
              unit: unit,
              phase_scope: smart_object.removed_phase == Core::Phase::DEMOLITION ? 'demolition' : smart_object.created_phase,
              formula_version: FORMULA_VERSION,
              breakdown: breakdown.freeze,
              confidence: smart_object.source_state
            }.freeze
          end
        end
      end
    end
  end
end
