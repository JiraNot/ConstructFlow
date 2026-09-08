# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      module Quantity
        class StructureQuantityProvider
          PROVIDER_ID = 'constructflow.structure.quantity'
          FORMULA_VERSION = 1

          def column_quantities(smart_object:, definition:)
            width, depth = definition.section_mm
            side_area_mm2 = (2.0 * (width + depth)) * definition.height_mm
            [
              item(
                smart_object: smart_object,
                classification: 'structure.column.concrete',
                description: 'Structural column concrete',
                measure: 'volume',
                value: definition.volume_mm3 / 1_000_000_000.0,
                unit: 'm3',
                breakdown: {
                  section_mm: definition.section_mm,
                  height_mm: definition.height_mm,
                  engineering_status: definition.engineering_status
                }
              ),
              item(
                smart_object: smart_object,
                classification: 'structure.column.formwork',
                description: 'Structural column side formwork',
                measure: 'area',
                value: side_area_mm2 / 1_000_000.0,
                unit: 'm2',
                breakdown: { excludes_top_bottom: true }
              )
            ].freeze
          end

          def foundation_quantities(smart_object:, definition:)
            [
              item(
                smart_object: smart_object,
                classification: "structure.#{definition.foundation_type}.concrete",
                description: "#{definition.foundation_type.tr('_', ' ')} concrete",
                measure: 'volume',
                value: definition.volume_mm3 / 1_000_000_000.0,
                unit: 'm3',
                breakdown: {
                  size_mm: definition.size_mm,
                  engineering_status: definition.engineering_status
                }
              ),
              item(
                smart_object: smart_object,
                classification: "structure.#{definition.foundation_type}.formwork",
                description: "#{definition.foundation_type.tr('_', ' ')} side formwork",
                measure: 'area',
                value: definition.formwork_area_mm2 / 1_000_000.0,
                unit: 'm2',
                breakdown: { excludes_top_bottom: true }
              )
            ].freeze
          end

          def rebar_quantities(smart_object:, definition:)
            [
              item(
                smart_object: smart_object,
                classification: 'structure.rebar.length',
                description: "Rebar #{definition.bar_grade} D#{definition.diameter_mm.round}",
                measure: 'length',
                value: definition.total_length_mm / 1000.0,
                unit: 'm',
                breakdown: definition.bbs_row
              ),
              item(
                smart_object: smart_object,
                classification: 'structure.rebar.mass',
                description: "Rebar #{definition.bar_grade} D#{definition.diameter_mm.round} mass",
                measure: 'mass',
                value: definition.total_mass_kg,
                unit: 'kg',
                breakdown: definition.bbs_row
              )
            ].freeze
          end

          private

          def item(smart_object:, classification:, description:, measure:, value:, unit:, breakdown:)
            {
              source_object_id: smart_object.id,
              source_module: 'constructflow.structure',
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
