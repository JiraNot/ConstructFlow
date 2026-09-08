# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Quantity
        class WallQuantityProvider
          PROVIDER_ID = 'constructflow.architecture.wall_quantity'
          FORMULA_VERSION = 1

          def quantities(smart_object:, definition:)
            phase_scope = if smart_object.removed_phase == Core::Phase::DEMOLITION
                            'demolition'
                          else
                            smart_object.created_phase
                          end

            [
              item(
                smart_object: smart_object,
                classification: 'architecture.wall.gross_area',
                description: 'Wall gross area',
                measure: 'area',
                value: definition.gross_area_mm2 / 1_000_000.0,
                unit: 'm2',
                phase_scope: phase_scope,
                breakdown: { length_mm: definition.length_mm, height_mm: definition.height_mm }
              ),
              item(
                smart_object: smart_object,
                classification: 'architecture.wall.volume',
                description: 'Wall gross volume',
                measure: 'volume',
                value: definition.volume_mm3 / 1_000_000_000.0,
                unit: 'm3',
                phase_scope: phase_scope,
                breakdown: {
                  length_mm: definition.length_mm,
                  height_mm: definition.height_mm,
                  thickness_mm: definition.thickness_mm
                }
              )
            ].freeze
          end

          private

          def item(smart_object:, classification:, description:, measure:, value:, unit:, phase_scope:, breakdown:)
            {
              source_object_id: smart_object.id,
              source_module: 'constructflow.architecture',
              provider: PROVIDER_ID,
              classification: classification,
              description: description,
              measure: measure,
              value: value,
              unit: unit,
              phase_scope: phase_scope,
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
