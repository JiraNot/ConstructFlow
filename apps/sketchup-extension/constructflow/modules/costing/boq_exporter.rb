# frozen_string_literal: true

require 'csv'

module JiraNot
  module ConstructFlow
    module Costing
      class BoqExporter
        def export(cost_estimate)
          raise ArgumentError, 'CostEstimate required' unless cost_estimate.is_a?(CostEstimate)

          csv_text = generate_csv(cost_estimate)
          {
            estimate_id: cost_estimate.estimate_id,
            currency: cost_estimate.currency,
            line_count: cost_estimate.line_count,
            total_material_cost: cost_estimate.total_material_cost,
            total_labor_cost: cost_estimate.total_labor_cost,
            total_equipment_cost: cost_estimate.total_equipment_cost,
            total_cost: cost_estimate.total_cost,
            division_summaries: cost_estimate.division_summaries,
            phase_summaries: cost_estimate.phase_summaries,
            csv: csv_text
          }
        end

        def generate_csv(cost_estimate)
          headers = [
            'Line ID', 'Phase Scope', 'Division', 'Classification', 'Description',
            'Unit', 'Net Qty', 'Waste %', 'Gross Qty', 'Mat Rate', 'Labor Rate',
            'Equip Rate', 'Unit Rate', 'Subtotal Mat', 'Subtotal Labor', 'Subtotal Equip',
            'Total Cost', 'Source Objects'
          ]

          CSV.generate do |csv|
            csv << headers
            cost_estimate.lines.each do |line|
              csv << [
                line.line_id,
                line.phase_scope,
                line.trade_division,
                line.classification,
                line.description,
                line.unit,
                line.net_quantity,
                line.waste_pct,
                line.gross_quantity,
                line.material_rate,
                line.labor_rate,
                line.equipment_rate,
                line.unit_rate,
                line.subtotal_material,
                line.subtotal_labor,
                line.subtotal_equipment,
                line.total_cost,
                line.source_object_ids.join(';')
              ]
            end
          end
        end
      end
    end
  end
end
