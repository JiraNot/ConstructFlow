# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      module Quantity
        class InteriorQuantityProvider
          PROVIDER_ID = 'constructflow.interior.quantity'
          FORMULA_VERSION = 1

          def cabinet_quantities(smart_object:, definition:)
            front_area = definition.fronts.sum do |front|
              next 0.0 if front['front_type'] == 'open'
              mod = definition.module(front['module_id'])
              next 0.0 unless mod
              Float(mod['width_mm']) * definition.opening_height_mm
            end
            [
              item(
                smart_object: smart_object,
                classification: 'interior.cabinet_run.unit',
                description: 'Cabinet run',
                measure: 'count', value: 1, unit: 'pcs',
                breakdown: {
                  width_mm: definition.width_mm,
                  height_mm: definition.height_mm,
                  depth_mm: definition.depth_mm,
                  module_count: definition.modules.length,
                  mode: definition.mode
                }
              ),
              item(
                smart_object: smart_object,
                classification: 'interior.cabinet.front_area_design',
                description: 'Cabinet front design area',
                measure: 'area', value: front_area / 1_000_000.0, unit: 'm2',
                breakdown: { front_count: definition.fronts.length, status: 'design_estimate' }
              )
            ].freeze
          end

          def part_set_quantities(smart_object:, definition:)
            material_groups = definition.board_parts.group_by do |part|
              [part['material_id'].to_s, Float(part['thickness_mm'])]
            end
            items = material_groups.map do |(material_id, thickness), parts|
              area_mm2 = parts.sum do |part|
                Float(part['length_mm']) * Float(part['width_mm']) * Integer(part['quantity'] || 1)
              end
              item(
                smart_object: smart_object,
                classification: 'interior.joinery.board_area',
                description: "Joinery board #{material_id} #{thickness.round(1)}mm",
                measure: 'area', value: area_mm2 / 1_000_000.0, unit: 'm2',
                breakdown: {
                  material_id: material_id,
                  thickness_mm: thickness,
                  part_count: parts.sum { |part| Integer(part['quantity'] || 1) },
                  source: 'generated_joinery_parts',
                  generator_version: definition.generator_version
                }
              )
            end

            if definition.glass_area_mm2.positive?
              items << item(
                smart_object: smart_object,
                classification: 'interior.joinery.glass_area',
                description: 'Joinery glass area',
                measure: 'area', value: definition.glass_area_mm2 / 1_000_000.0, unit: 'm2',
                breakdown: { part_count: definition.glass_parts.length, source: 'generated_joinery_parts' }
              )
            end

            items << item(
              smart_object: smart_object,
              classification: 'interior.joinery.edge_band',
              description: 'Joinery edge band',
              measure: 'length', value: definition.edge_band_length_mm / 1000.0, unit: 'm',
              breakdown: { source: 'generated_joinery_parts' }
            )

            definition.hardware.each do |hardware|
              items << item(
                smart_object: smart_object,
                classification: "interior.hardware.#{hardware['kind']}",
                description: hardware['kind'].to_s.tr('_', ' '),
                measure: 'count', value: Integer(hardware['quantity'] || 0), unit: 'pcs',
                breakdown: {
                  module_id: hardware['module_id'],
                  model: hardware['model'],
                  source: 'hardware_rule'
                }
              )
            end
            items.freeze
          end

          private

          def item(smart_object:, classification:, description:, measure:, value:, unit:, breakdown:)
            {
              source_object_id: smart_object.id,
              source_module: 'constructflow.interior',
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
