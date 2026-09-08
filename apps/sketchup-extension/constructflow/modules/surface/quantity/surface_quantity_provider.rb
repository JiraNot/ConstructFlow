# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      module Quantity
        class SurfaceQuantityProvider
          PROVIDER_ID = 'constructflow.surface.quantity'
          FORMULA_VERSION = 1

          def surface_quantities(smart_object:, definition:)
            [
              item(
                smart_object: smart_object,
                classification: "surface.#{definition.surface_type}.net_area",
                description: "#{definition.surface_type} surface net area",
                measure: 'area',
                value: definition.net_area_mm2 / 1_000_000.0,
                unit: 'm2',
                breakdown: {
                  gross_area_m2: definition.outer_area_mm2 / 1_000_000.0,
                  holes_area_m2: definition.holes_area_mm2 / 1_000_000.0
                }
              ),
              item(
                smart_object: smart_object,
                classification: 'surface.perimeter',
                description: 'Surface outer perimeter',
                measure: 'length',
                value: definition.perimeter_mm / 1000.0,
                unit: 'm',
                breakdown: { hole_perimeter_m: definition.hole_perimeter_mm / 1000.0 }
              )
            ].freeze
          end

          def border_quantities(smart_object:, definition:, surface_definition:)
            perimeter = surface_definition.perimeter_mm
            perimeter += surface_definition.hole_perimeter_mm if definition.follow_holes
            [
              item(
                smart_object: smart_object,
                classification: 'surface.border.length',
                description: 'Paving border length',
                measure: 'length',
                value: perimeter / 1000.0,
                unit: 'm',
                breakdown: { width_mm: definition.width_mm, material_id: definition.material_id }
              ),
              item(
                smart_object: smart_object,
                classification: 'surface.border.area_approx',
                description: 'Paving border approximate area',
                measure: 'area',
                value: definition.approximate_area_mm2(surface_definition) / 1_000_000.0,
                unit: 'm2',
                breakdown: { calculation_status: 'preliminary_perimeter_x_width' }
              )
            ].freeze
          end

          def pattern_quantities(smart_object:, definition:, surface_definition:)
            count = definition.provisional_piece_count(surface_definition.net_area_mm2)
            [item(
              smart_object: smart_object,
              classification: "surface.pattern.#{definition.pattern}.provisional_modules",
              description: 'Provisional paving module count',
              measure: 'count',
              value: count,
              unit: 'pcs',
              breakdown: {
                layout_state: definition.layout_state,
                quantity_status: definition.layout_state == 'locked' ? 'layout_based_pending_cut_solver' : 'preliminary_area_based',
                module_mm: definition.module_mm,
                joint_mm: definition.joint_mm
              }
            )].freeze
          end

          def parking_quantities(smart_object:, definition:)
            [item(
              smart_object: smart_object,
              classification: 'surface.parking.bays',
              description: 'Parking bays',
              measure: 'count',
              value: definition.bay_count,
              unit: 'pcs',
              breakdown: {
                bay_width_mm: definition.bay_width_mm,
                bay_length_mm: definition.bay_length_mm,
                divider_width_mm: definition.divider_width_mm
              }
            )].freeze
          end

          private

          def item(smart_object:, classification:, description:, measure:, value:, unit:, breakdown:)
            {
              source_object_id: smart_object.id,
              source_module: 'constructflow.surface',
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
