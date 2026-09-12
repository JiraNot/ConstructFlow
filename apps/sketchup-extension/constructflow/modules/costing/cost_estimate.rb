# frozen_string_literal: true

require_relative 'cost_estimate_line'

module JiraNot
  module ConstructFlow
    module Costing
      class CostEstimate
        SCHEMA_VERSION = 1

        attr_reader :estimate_id, :rate_library_id, :rate_library_version,
                    :currency, :created_at, :lines

        def initialize(estimate_id:, rate_library_id:, rate_library_version:,
                       currency: 'THB', created_at: Time.now.iso8601, lines: [])
          @estimate_id = estimate_id.to_s.strip
          @rate_library_id = rate_library_id.to_s.strip
          @rate_library_version = rate_library_version.to_s.strip
          @currency = currency.to_s.strip.upcase
          @created_at = created_at.to_s.strip
          @lines = normalize_lines(lines).freeze
          freeze
        end

        def line_count
          lines.length
        end

        def total_material_cost
          lines.sum(&:subtotal_material).round(2)
        end

        def total_labor_cost
          lines.sum(&:subtotal_labor).round(2)
        end

        def total_equipment_cost
          lines.sum(&:subtotal_equipment).round(2)
        end

        def total_cost
          lines.sum(&:total_cost).round(2)
        end

        def by_phase(phase)
          lines.select { |l| l.phase_scope == phase.to_s.strip }
        end

        def by_trade_division(division)
          lines.select { |l| l.trade_division == division.to_s.strip }
        end

        def division_summaries
          lines.group_by(&:trade_division).transform_values do |div_lines|
            {
              material_cost: div_lines.sum(&:subtotal_material).round(2),
              labor_cost: div_lines.sum(&:subtotal_labor).round(2),
              equipment_cost: div_lines.sum(&:subtotal_equipment).round(2),
              total_cost: div_lines.sum(&:total_cost).round(2),
              line_count: div_lines.length
            }
          end
        end

        def phase_summaries
          lines.group_by(&:phase_scope).transform_values do |phase_lines|
            {
              material_cost: phase_lines.sum(&:subtotal_material).round(2),
              labor_cost: phase_lines.sum(&:subtotal_labor).round(2),
              equipment_cost: phase_lines.sum(&:subtotal_equipment).round(2),
              total_cost: phase_lines.sum(&:total_cost).round(2),
              line_count: phase_lines.length
            }
          end
        end

        def trace_line(line_id)
          lines.find { |l| l.line_id == line_id.to_s.strip }
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'estimate_id' => estimate_id,
            'rate_library_id' => rate_library_id,
            'rate_library_version' => rate_library_version,
            'currency' => currency,
            'created_at' => created_at,
            'line_count' => line_count,
            'total_material_cost' => total_material_cost,
            'total_labor_cost' => total_labor_cost,
            'total_equipment_cost' => total_equipment_cost,
            'total_cost' => total_cost,
            'phase_summaries' => phase_summaries,
            'division_summaries' => division_summaries,
            'lines' => lines.map(&:to_h)
          }
        end

        def self.from_h(value)
          data = value || {}
          raw_lines = data['lines'] || data[:lines] || []
          parsed_lines = raw_lines.map { |l| l.is_a?(CostEstimateLine) ? l : CostEstimateLine.from_h(l) }
          new(
            estimate_id: data['estimate_id'] || data[:estimate_id],
            rate_library_id: data['rate_library_id'] || data[:rate_library_id],
            rate_library_version: data['rate_library_version'] || data[:rate_library_version],
            currency: data['currency'] || data[:currency] || 'THB',
            created_at: data['created_at'] || data[:created_at] || Time.now.iso8601,
            lines: parsed_lines
          )
        end

        private

        def normalize_lines(values)
          Array(values).map do |v|
            v.is_a?(CostEstimateLine) ? v : CostEstimateLine.from_h(v)
          end
        end
      end
    end
  end
end
