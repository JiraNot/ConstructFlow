# frozen_string_literal: true

require 'securerandom'
require_relative 'cost_estimate'
require_relative 'cost_estimate_line'

module JiraNot
  module ConstructFlow
    module Costing
      class CostingEngine
        def generate(quantity_items:, rate_library:, estimate_id: nil)
          raise ArgumentError, 'quantity_items required' unless quantity_items.is_a?(Array)
          raise ArgumentError, 'RateLibrary required' unless rate_library.is_a?(RateLibrary)

          id = estimate_id || "est_#{SecureRandom.uuid[0..7]}"
          lines = []
          seq = 0

          quantity_items.each do |item|
            seq += 1
            cls = (item[:classification] || item['classification']).to_s.strip
            desc = (item[:description] || item['description'] || cls).to_s.strip
            unit = (item[:unit] || item['unit']).to_s.strip.downcase
            value = Float(item[:value] || item['value'] || 0.0)
            phase = (item[:phase_scope] || item['phase_scope'] || 'new_construction').to_s.strip
            source_id = item[:source_object_id] || item['source_object_id']
            source_mod = item[:source_module] || item['source_module']
            formula_ver = item[:formula_version] || item['formula_version'] || 1

            rate = rate_library.find_rate(cls)

            # Determine waste percentage
            # Priority 1: item level breakdown waste (e.g. from paving layout or sheet nesting)
            item_breakdown = item[:breakdown] || item['breakdown'] || {}
            waste_pct = if item_breakdown[:waste_pct] || item_breakdown['waste_pct']
                          Float(item_breakdown[:waste_pct] || item_breakdown['waste_pct'])
                        elsif rate
                          rate.default_waste_pct
                        else
                          0.0
                        end

            mat_rate = rate ? rate.material_rate : 0.0
            lab_rate = rate ? rate.labor_rate : 0.0
            eq_rate = rate ? rate.equipment_rate : 0.0

            lines << CostEstimateLine.new(
              line_id: "line_#{format('%03d', seq)}",
              quantity_item_id: item[:id] || item['id'],
              source_object_ids: source_id ? [source_id] : [],
              source_module: source_mod,
              formula_version: formula_ver,
              classification: cls,
              description: desc,
              phase_scope: phase,
              unit: unit,
              net_quantity: value,
              waste_pct: waste_pct,
              material_rate: mat_rate,
              labor_rate: lab_rate,
              equipment_rate: eq_rate,
              currency: rate_library.currency
            )
          end

          CostEstimate.new(
            estimate_id: id,
            rate_library_id: rate_library.id,
            rate_library_version: rate_library.version,
            currency: rate_library.currency,
            lines: lines
          )
        end
      end
    end
  end
end
