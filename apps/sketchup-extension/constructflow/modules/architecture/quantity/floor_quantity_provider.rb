# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Quantity
        class FloorQuantityProvider
          PROVIDER_ID = 'constructflow.architecture.floor_quantity'
          FORMULA_VERSION = 1

          def quantities(smart_object:, definition:)
            phase_scope = smart_object.removed_phase == Core::Phase::DEMOLITION ? 'demolition' : smart_object.created_phase
            [
              item(smart_object, 'architecture.floor.net_area', 'Architectural floor net area', definition.net_area_mm2 / 1_000_000.0, 'm2', phase_scope,
                   area_mm2: definition.net_area_mm2, hole_count: definition.holes_mm.length),
              item(smart_object, 'architecture.floor.volume', 'Architectural floor gross volume', definition.net_area_mm2 * definition.thickness_mm / 1_000_000_000.0, 'm3', phase_scope,
                   area_mm2: definition.net_area_mm2, thickness_mm: definition.thickness_mm)
            ].freeze
          end

          private

          def item(smart_object, classification, description, value, unit, phase_scope, breakdown)
            {
              source_object_id: smart_object.id, source_module: 'constructflow.architecture', provider: PROVIDER_ID,
              classification: classification, description: description, measure: unit == 'm2' ? 'area' : 'volume',
              value: value, unit: unit, phase_scope: phase_scope, formula_version: FORMULA_VERSION,
              breakdown: breakdown.freeze, confidence: smart_object.source_state
            }.freeze
          end
        end
      end
    end
  end
end
