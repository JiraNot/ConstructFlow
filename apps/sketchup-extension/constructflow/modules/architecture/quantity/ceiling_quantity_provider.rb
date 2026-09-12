# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Quantity
        class CeilingQuantityProvider
          PROVIDER_ID = 'constructflow.architecture.ceiling_quantity'
          FORMULA_VERSION = 1

          def quantities(smart_object:, definition:)
            phase = smart_object.removed_phase == Core::Phase::DEMOLITION ? 'demolition' : smart_object.created_phase
            [
              item(smart_object, 'architecture.ceiling.net_area', 'Ceiling net area', definition.net_area_mm2 / 1_000_000.0, 'm2', phase,
                   area_mm2: definition.net_area_mm2),
              item(smart_object, 'architecture.ceiling.volume', 'Ceiling lining volume', definition.net_area_mm2 * definition.thickness_mm / 1_000_000_000.0, 'm3', phase,
                   area_mm2: definition.net_area_mm2, thickness_mm: definition.thickness_mm)
            ].freeze
          end

          private

          def item(object, classification, description, value, unit, phase, breakdown)
            {
              source_object_id: object.id, source_module: 'constructflow.architecture', provider: PROVIDER_ID,
              classification: classification, description: description, measure: unit == 'm2' ? 'area' : 'volume',
              value: value, unit: unit, phase_scope: phase, formula_version: FORMULA_VERSION,
              breakdown: breakdown.freeze, confidence: object.source_state
            }.freeze
          end
        end
      end
    end
  end
end
