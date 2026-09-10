# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      module Quantity
        class ElectricalQuantityProvider
          PROVIDER_ID = 'constructflow.electrical.quantity'
          FORMULA_VERSION = 1

          def device_quantities(smart_object:, definition:)
            [item(
              smart_object: smart_object,
              classification: "electrical.#{definition.kind}.unit",
              description: "Electrical #{definition.kind}",
              measure: 'count',
              value: 1.0,
              unit: 'pcs',
              breakdown: {
                device_type: definition.device_type,
                mounting: definition.mounting,
                wattage: definition.wattage,
                circuit_id: definition.circuit_id,
                dedicated: definition.dedicated,
                weatherproof: definition.weatherproof
              }
            )].freeze
          end

          private

          def item(smart_object:, classification:, description:, measure:, value:, unit:, breakdown:)
            {
              source_object_id: smart_object.id,
              source_module: 'constructflow.electrical',
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
