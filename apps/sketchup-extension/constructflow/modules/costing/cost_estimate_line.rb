# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Costing
      class CostEstimateLine
        attr_reader :line_id, :quantity_item_id, :source_object_ids, :source_module,
                    :formula_version, :classification, :description, :phase_scope,
                    :trade_division, :unit, :net_quantity, :waste_pct, :material_rate,
                    :labor_rate, :equipment_rate, :currency

        def initialize(line_id:, classification:, description:, phase_scope:, unit:,
                       net_quantity:, source_object_ids: [], quantity_item_id: nil,
                       source_module: nil, formula_version: 1, trade_division: nil,
                       waste_pct: 0.0, material_rate: 0.0, labor_rate: 0.0,
                       equipment_rate: 0.0, currency: 'THB')
          @line_id = line_id.to_s.strip
          @quantity_item_id = quantity_item_id&.to_s
          @source_object_ids = Array(source_object_ids).map(&:to_s).uniq.sort.freeze
          @source_module = source_module&.to_s
          @formula_version = formula_version
          @classification = classification.to_s.strip
          @description = description.to_s.strip
          @phase_scope = phase_scope.to_s.strip
          @trade_division = (trade_division || default_division(classification)).to_s.strip
          @unit = unit.to_s.strip.downcase
          @net_quantity = Float(net_quantity)
          @waste_pct = Float(waste_pct)
          @material_rate = Float(material_rate)
          @labor_rate = Float(labor_rate)
          @equipment_rate = Float(equipment_rate)
          @currency = currency.to_s.strip.upcase
          freeze
        end

        def waste_quantity
          ((net_quantity * waste_pct) / 100.0).round(3)
        end

        def gross_quantity
          (net_quantity + waste_quantity).round(3)
        end

        def unit_rate
          (material_rate + labor_rate + equipment_rate).round(2)
        end

        def subtotal_material
          (gross_quantity * material_rate).round(2)
        end

        def subtotal_labor
          (gross_quantity * labor_rate).round(2)
        end

        def subtotal_equipment
          (gross_quantity * equipment_rate).round(2)
        end

        def total_cost
          (subtotal_material + subtotal_labor + subtotal_equipment).round(2)
        end

        def to_h
          {
            'line_id' => line_id,
            'quantity_item_id' => quantity_item_id,
            'source_object_ids' => source_object_ids,
            'source_module' => source_module,
            'formula_version' => formula_version,
            'classification' => classification,
            'description' => description,
            'phase_scope' => phase_scope,
            'trade_division' => trade_division,
            'unit' => unit,
            'net_quantity' => net_quantity,
            'waste_pct' => waste_pct,
            'waste_quantity' => waste_quantity,
            'gross_quantity' => gross_quantity,
            'material_rate' => material_rate,
            'labor_rate' => labor_rate,
            'equipment_rate' => equipment_rate,
            'subtotal_material' => subtotal_material,
            'subtotal_labor' => subtotal_labor,
            'subtotal_equipment' => subtotal_equipment,
            'total_cost' => total_cost,
            'currency' => currency
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            line_id: data['line_id'] || data[:line_id],
            quantity_item_id: data['quantity_item_id'] || data[:quantity_item_id],
            source_object_ids: data['source_object_ids'] || data[:source_object_ids] || [],
            source_module: data['source_module'] || data[:source_module],
            formula_version: data['formula_version'] || data[:formula_version] || 1,
            classification: data['classification'] || data[:classification],
            description: data['description'] || data[:description],
            phase_scope: data['phase_scope'] || data[:phase_scope],
            trade_division: data['trade_division'] || data[:trade_division],
            unit: data['unit'] || data[:unit],
            net_quantity: data['net_quantity'] || data[:net_quantity] || 0.0,
            waste_pct: data['waste_pct'] || data[:waste_pct] || 0.0,
            material_rate: data['material_rate'] || data[:material_rate] || 0.0,
            labor_rate: data['labor_rate'] || data[:labor_rate] || 0.0,
            equipment_rate: data['equipment_rate'] || data[:equipment_rate] || 0.0,
            currency: data['currency'] || data[:currency] || 'THB'
          )
        end

        private

        def default_division(cls)
          case cls
          when /^structure/ then '03_concrete_structure'
          when /^architecture\.wall/ then '04_masonry'
          when /^roof/ then '07_thermal_moisture'
          when /^opening/, /^door_window/ then '08_openings'
          when /^surface/ then '32_exterior_improvements'
          when /^interior/ then '12_furnishings'
          when /^drainage/, /^plumbing/ then '22_plumbing'
          when /^electrical/ then '26_electrical'
          else '01_general'
          end
        end
      end
    end
  end
end
