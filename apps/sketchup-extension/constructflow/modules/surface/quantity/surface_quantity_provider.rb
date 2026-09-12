# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      module Quantity
        class SurfaceQuantityProvider
          PROVIDER_ID = 'constructflow.surface.quantity'
          FORMULA_VERSION = 2

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

          def pattern_quantities(smart_object:, definition:, surface_definition:, layout_definition: nil)
            if layout_definition&.solved?
              return layout_quantities(
                smart_object: smart_object,
                layout_definition: layout_definition,
                pattern_definition: definition,
                surface_definition: surface_definition
              )
            end

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
                quantity_status: 'preliminary_area_based',
                module_mm: definition.module_mm,
                joint_mm: definition.joint_mm
              }
            )].freeze
          end

          def layout_quantities(smart_object:, layout_definition:, pattern_definition:, surface_definition:)
            status = layout_definition.solved? ? 'solved_piece_layout' : layout_definition.status
            common = {
              quantity_status: status,
              pattern: pattern_definition.pattern,
              module_mm: pattern_definition.module_mm,
              joint_mm: pattern_definition.joint_mm,
              solver_version: layout_definition.solver_version,
              minimum_cut_violations: layout_definition.minimum_cut_violations.length,
              coverage_ratio: layout_definition.coverage_ratio(surface_definition.net_area_mm2)
            }
            [
              item(
                smart_object: smart_object,
                classification: "surface.pattern.#{pattern_definition.pattern}.modules.total",
                description: 'Solved paving pieces total',
                measure: 'count',
                value: layout_definition.piece_count,
                unit: 'pcs',
                breakdown: common.merge(full_count: layout_definition.full_count, cut_count: layout_definition.cut_count)
              ),
              item(
                smart_object: smart_object,
                classification: "surface.pattern.#{pattern_definition.pattern}.modules.full",
                description: 'Solved full paving pieces',
                measure: 'count',
                value: layout_definition.full_count,
                unit: 'pcs',
                breakdown: common
              ),
              item(
                smart_object: smart_object,
                classification: "surface.pattern.#{pattern_definition.pattern}.modules.cut",
                description: 'Solved cut paving pieces',
                measure: 'count',
                value: layout_definition.cut_count,
                unit: 'pcs',
                breakdown: common
              ),
              item(
                smart_object: smart_object,
                classification: 'surface.pattern.cut_waste_area',
                description: 'Cut-piece nominal waste area before offcut reuse',
                measure: 'area',
                value: layout_definition.cut_waste_area_mm2 / 1_000_000.0,
                unit: 'm2',
                breakdown: common.merge(reuse_status: 'not_optimized')
              )
            ].freeze
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

          def assembly_quantities(smart_object:, assembly_definition:, surface_definition:)
            items = []
            net_area_m2 = surface_definition.net_area_mm2 / 1_000_000.0

            assembly_definition.layers.each_with_index do |layer, index|
              layer_name = layer['name']
              thickness_mm = layer['thickness_mm']
              material_id = layer['material_id']
              owned = layer['owned_by_surface']

              if owned
                volume_m3 = (surface_definition.net_area_mm2 * thickness_mm) / 1_000_000_000.0
                items << item(
                  smart_object: smart_object,
                  classification: "surface.assembly.layer.#{index + 1}.area",
                  description: "Assembly layer #{layer_name} area",
                  measure: 'area',
                  value: net_area_m2,
                  unit: 'm2',
                  breakdown: {
                    layer_index: index,
                    layer_name: layer_name,
                    thickness_mm: thickness_mm,
                    material_id: material_id,
                    owned_by_surface: true
                  }
                )
                items << item(
                  smart_object: smart_object,
                  classification: "surface.assembly.layer.#{index + 1}.volume",
                  description: "Assembly layer #{layer_name} volume",
                  measure: 'volume',
                  value: volume_m3,
                  unit: 'm3',
                  breakdown: {
                    layer_index: index,
                    layer_name: layer_name,
                    thickness_mm: thickness_mm,
                    material_id: material_id,
                    owned_by_surface: true
                  }
                )
              else
                items << item(
                  smart_object: smart_object,
                  classification: "surface.assembly.layer.#{index + 1}.structural_ref",
                  description: "Assembly layer #{layer_name} (structural reference)",
                  measure: 'reference',
                  value: 0.0,
                  unit: 'ref',
                  breakdown: {
                    layer_index: index,
                    layer_name: layer_name,
                    thickness_mm: thickness_mm,
                    material_id: material_id,
                    owned_by_surface: false,
                    note: 'owned by structural slab; excluded from surface BOQ to prevent duplicate quantities'
                  }
                )
              end
            end
            items.freeze
          end

          def control_joint_quantities(smart_object:, definitions:)
            joints = Array(definitions)
            total_len_m = joints.sum(&:length_mm) / 1000.0
            [
              item(
                smart_object: smart_object,
                classification: 'surface.control_joint.length',
                description: 'Surface control / expansion joint length',
                measure: 'length',
                value: total_len_m,
                unit: 'm',
                breakdown: { joint_count: joints.length }
              )
            ].freeze
          end

          def tree_pit_quantities(smart_object:, definitions:)
            pits = Array(definitions)
            grille_count = pits.count(&:grille)
            [
              item(
                smart_object: smart_object,
                classification: 'surface.tree_pit.count',
                description: 'Tree pit cutouts',
                measure: 'count',
                value: pits.length,
                unit: 'pcs',
                breakdown: { grille_count: grille_count }
              )
            ].freeze
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
