# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      module Quantity
        class ExtensionQuantityProvider
          PROVIDER_ID = 'constructflow.extension.quantity'
          FORMULA_VERSION = 1

          def quantities(smart_object:, definition:)
            [
              item(
                smart_object: smart_object,
                classification: 'extension.zone.area',
                description: 'Extension concept area',
                measure: 'area',
                value: definition.area_mm2 / 1_000_000.0,
                unit: 'm2',
                breakdown: { program: definition.program, mode: definition.mode }
              ),
              item(
                smart_object: smart_object,
                classification: 'extension.zone.perimeter',
                description: 'Extension concept perimeter',
                measure: 'length',
                value: definition.perimeter_mm / 1000.0,
                unit: 'm',
                breakdown: { program: definition.program }
              )
            ].freeze
          end

          private

          def item(smart_object:, classification:, description:, measure:, value:, unit:, breakdown:)
            {
              source_object_id: smart_object.id,
              source_module: 'constructflow.extension',
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
