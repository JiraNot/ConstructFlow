# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Quantity
        class RoomQuantityProvider
          PROVIDER_ID = 'constructflow.architecture.room_quantity'
          FORMULA_VERSION = 1

          def quantities(smart_object:, definition:)
            [
              item(smart_object, 'architecture.room.area', 'Room area', definition.area_mm2 / 1_000_000.0, 'm2', area_mm2: definition.area_mm2, program: definition.program),
              item(smart_object, 'architecture.room.perimeter', 'Room perimeter', definition.perimeter_mm / 1000.0, 'm', perimeter_mm: definition.perimeter_mm, program: definition.program)
            ].freeze
          end

          private

          def item(smart_object, classification, description, value, unit, breakdown)
            {
              source_object_id: smart_object.id, source_module: 'constructflow.architecture', provider: PROVIDER_ID,
              classification: classification, description: description, measure: unit == 'm2' ? 'area' : 'length',
              value: value, unit: unit,
              phase_scope: smart_object.removed_phase == Core::Phase::DEMOLITION ? 'demolition' : smart_object.created_phase,
              formula_version: FORMULA_VERSION, breakdown: breakdown.freeze, confidence: smart_object.source_state
            }.freeze
          end
        end
      end
    end
  end
end
