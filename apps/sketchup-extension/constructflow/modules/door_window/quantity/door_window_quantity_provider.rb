# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      module Quantity
        class DoorWindowQuantityProvider
          PROVIDER_ID = 'constructflow.door_window.quantity'
          FORMULA_VERSION = 1

          def quantities(smart_object:, type:, instance_parameters: {})
            parameters = type.parametric_parameters(instance_parameters: instance_parameters)
            items = [
              item(
                smart_object: smart_object,
                classification: "door_window.#{type.category}.unit",
                description: "#{type.category.capitalize} unit",
                measure: 'count',
                value: 1.0,
                unit: 'pcs',
                breakdown: { type_id: type.id, operation: type.operation }
              ),
              item(
                smart_object: smart_object,
                classification: 'door_window.frame.perimeter',
                description: 'Frame perimeter',
                measure: 'length',
                value: type.frame_perimeter_mm / 1000.0,
                unit: 'm',
                breakdown: {
                  type_id: type.id,
                  width_mm: type.width_mm,
                  height_mm: type.height_mm,
                  frame_material: type.frame_material
                }
              ),
              item(
                smart_object: smart_object,
                classification: 'door_window.panel.count',
                description: 'Panel count',
                measure: 'count',
                value: type.panel_roles.length.to_f,
                unit: 'pcs',
                breakdown: { type_id: type.id, roles: type.panel_roles }
              )
            ]

            if type.panel_style == 'glazed'
              items << item(
                smart_object: smart_object,
                classification: 'door_window.glazing.clear_area',
                description: 'Clear glazing area',
                measure: 'area',
                value: parameters.fetch('clear_area') / 1_000_000.0,
                unit: 'm2',
                breakdown: {
                  type_id: type.id,
                  clear_width_mm: parameters.fetch('clear_width'),
                  clear_height_mm: parameters.fetch('clear_height')
                }
              )
            end
            items.freeze
          end

          private

          def item(smart_object:, classification:, description:, measure:, value:, unit:, breakdown:)
            {
              source_object_id: smart_object.id,
              source_module: 'constructflow.door_window',
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
