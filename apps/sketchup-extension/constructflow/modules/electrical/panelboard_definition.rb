# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class PanelboardDefinition
        SCHEMA_VERSION = 1
        PHASE_CONFIGS = %w[1P2W 3P4W].freeze
        DEFAULT_VOLTAGE_1P = 230.0
        DEFAULT_VOLTAGE_3P = 400.0

        attr_reader :id, :name, :phase_config, :voltage_v, :main_breaker_a,
                    :bus_rating_a, :max_circuits, :circuits

        def initialize(id:, name:, phase_config: '1P2W', voltage_v: nil,
                       main_breaker_a: 50.0, bus_rating_a: 100.0, max_circuits: 24,
                       circuits: {})
          @id = id.to_s
          @name = name.to_s
          @phase_config = phase_config.to_s
          @voltage_v = voltage_v ? Float(voltage_v) : (three_phase? ? DEFAULT_VOLTAGE_3P : DEFAULT_VOLTAGE_1P)
          @main_breaker_a = Float(main_breaker_a)
          @bus_rating_a = Float(bus_rating_a)
          @max_circuits = Integer(max_circuits)
          @circuits = normalize_circuits(circuits)
          freeze
        end

        def errors
          result = []
          result << 'panel id required' if id.empty?
          result << 'panel name required' if name.empty?
          result << 'unsupported phase config' unless PHASE_CONFIGS.include?(phase_config)
          result << 'main breaker rating must be positive' unless main_breaker_a.positive?
          result << 'bus rating must be >= main breaker rating' if bus_rating_a < main_breaker_a
          result << 'circuits count exceeds max_circuits' if circuits.length > max_circuits
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def three_phase?
          phase_config == '3P4W'
        end

        def phase_loads_va
          loads = if three_phase?
                    { 'A' => 0.0, 'B' => 0.0, 'C' => 0.0 }
                  else
                    { 'A' => 0.0 }
                  end

          circuits.each_value do |c|
            phase = c[:phase] || 'A'
            phase = 'A' unless loads.key?(phase)
            loads[phase] += Float(c[:load_va] || 0.0)
          end
          loads
        end

        def total_load_va
          phase_loads_va.values.sum
        end

        def max_phase_current_a
          phase_voltage = three_phase? ? (voltage_v / Math.sqrt(3.0)) : voltage_v
          return 0.0 if phase_voltage <= 0.001

          phase_loads_va.values.map { |va| va / phase_voltage }.max || 0.0
        end

        def main_breaker_overloaded?
          max_phase_current_a > main_breaker_a
        end

        def unbalance_percent
          return 0.0 unless three_phase?

          loads = phase_loads_va.values
          avg = loads.sum / 3.0
          return 0.0 if avg <= 0.001

          max_diff = loads.map { |l| (l - avg).abs }.max
          (max_diff / avg) * 100.0
        end

        def balanced_circuits
          return circuits unless three_phase?

          # Sort circuits descending by load_va for LPT load balancing
          sorted = circuits.values.sort_by { |c| -Float(c[:load_va] || 0.0) }
          phase_totals = { 'A' => 0.0, 'B' => 0.0, 'C' => 0.0 }
          balanced = {}

          sorted.each_with_index do |c, idx|
            # Assign to the phase currently having the least load
            least_loaded_phase = phase_totals.min_by(&:last).first
            slot = idx + 1

            new_c = c.merge(slot: slot, phase: least_loaded_phase)
            balanced[slot] = new_c
            phase_totals[least_loaded_phase] += Float(c[:load_va] || 0.0)
          end
          balanced
        end

        def with_balanced_phases
          self.class.new(
            id: id,
            name: name,
            phase_config: phase_config,
            voltage_v: voltage_v,
            main_breaker_a: main_breaker_a,
            bus_rating_a: bus_rating_a,
            max_circuits: max_circuits,
            circuits: balanced_circuits
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'name' => name,
            'phase_config' => phase_config,
            'voltage_v' => voltage_v,
            'main_breaker_a' => main_breaker_a,
            'bus_rating_a' => bus_rating_a,
            'max_circuits' => max_circuits,
            'circuits' => circuits,
            'total_load_va' => total_load_va,
            'phase_loads_va' => phase_loads_va,
            'unbalance_percent' => unbalance_percent.round(2)
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            name: data['name'] || data[:name] || data['id'] || data[:id],
            phase_config: data['phase_config'] || data[:phase_config] || '1P2W',
            voltage_v: data['voltage_v'] || data[:voltage_v],
            main_breaker_a: data['main_breaker_a'] || data[:main_breaker_a] || 50.0,
            bus_rating_a: data['bus_rating_a'] || data[:bus_rating_a] || 100.0,
            max_circuits: data['max_circuits'] || data[:max_circuits] || 24,
            circuits: data['circuits'] || data[:circuits] || {}
          )
        end

        private

        def normalize_circuits(hash)
          (hash || {}).each_with_object({}) do |(slot, info), res|
            s = Integer(slot)
            item = (info || {}).transform_keys(&:to_sym)
            res[s] = {
              circuit_id: item[:circuit_id]&.to_s,
              description: item[:description]&.to_s || "Circuit #{s}",
              rating_a: item[:rating_a] ? Float(item[:rating_a]) : 16.0,
              load_va: item[:load_va] ? Float(item[:load_va]) : 0.0,
              phase: item[:phase]&.to_s || 'A'
            }.freeze
          end.freeze
        end
      end
    end
  end
end
