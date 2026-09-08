# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      module Quantity
        class OpeningQuantityProvider
          PROVIDER_ID = 'constructflow.opening.quantity'
          FORMULA_VERSION = 1

          def quantities(smart_object:, definition:, host_object: nil)
            phase_scope = if host_object && host_object.created_phase == Core::Phase::EXISTING
                            'demolition'
                          else
                            smart_object.created_phase
                          end

            [{
              source_object_id: smart_object.id,
              source_module: 'constructflow.opening',
              provider: PROVIDER_ID,
              classification: 'opening.wall.removed_area',
              description: 'Wall opening area',
              measure: 'area',
              value: definition.area_mm2 / 1_000_000.0,
              unit: 'm2',
              phase_scope: phase_scope,
              formula_version: FORMULA_VERSION,
              breakdown: {
                width_mm: definition.width_mm,
                height_mm: definition.height_mm,
                host_object_id: definition.host_object_id
              }.freeze,
              confidence: smart_object.source_state
            }.freeze].freeze
          end
        end
      end
    end
  end
end
