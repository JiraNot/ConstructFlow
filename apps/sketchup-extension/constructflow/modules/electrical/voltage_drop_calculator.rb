# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class VoltageDropCalculator
        MAX_BRANCH_DROP_PCT = 3.0
        MAX_FEEDER_DROP_PCT = 2.0
        MAX_TOTAL_DROP_PCT = 5.0

        STANDARD_SIZES = [1.5, 2.5, 4.0, 6.0, 10.0, 16.0, 25.0, 35.0, 50.0].freeze

        Result = Struct.new(
          :voltage_drop_v, :voltage_drop_percent, :circuit_length_m,
          :current_a, :conductor_size_sqmm, :resistance_ohm_per_km,
          :compliant_branch, :compliant_feeder, :recommended_conductor_size_sqmm,
          keyword_init: true
        ) do
          def to_h
            {
              'voltage_drop_v' => voltage_drop_v.round(2),
              'voltage_drop_percent' => voltage_drop_percent.round(2),
              'circuit_length_m' => circuit_length_m,
              'current_a' => current_a,
              'conductor_size_sqmm' => conductor_size_sqmm,
              'resistance_ohm_per_km' => resistance_ohm_per_km,
              'compliant_branch' => compliant_branch,
              'compliant_feeder' => compliant_feeder,
              'recommended_conductor_size_sqmm' => recommended_conductor_size_sqmm
            }
          end
        end

        def calculate(length_m:, current_a:, conductor_size_sqmm: 2.5,
                      voltage_v: 230.0, phase_config: '1P2W', insulation_type: 'thw')
          len = Float(length_m)
          cur = Float(current_a)
          v = Float(voltage_v)
          size = Float(conductor_size_sqmm)
          is_3p = phase_config.to_s == '3P4W'

          cable = CableDefinition.new(conductor_size_sqmm: size, insulation_type: insulation_type)
          r = cable.resistance_ohm_per_km

          # Voltage drop formula
          # 1-phase: 2 * L * I * R / 1000
          # 3-phase: sqrt(3) * L * I * R / 1000
          factor = is_3p ? Math.sqrt(3.0) : 2.0
          vd_v = factor * len * cur * (r / 1000.0)
          vd_pct = v > 0.001 ? (vd_v / v) * 100.0 : 0.0

          compliant_b = vd_pct <= MAX_BRANCH_DROP_PCT
          compliant_f = vd_pct <= MAX_FEEDER_DROP_PCT

          # Recommend upsizing if non-compliant
          recommended_size = size
          unless compliant_b
            larger = STANDARD_SIZES.select { |s| s >= size }
            larger.each do |cand_size|
              cand_cable = CableDefinition.new(conductor_size_sqmm: cand_size, insulation_type: insulation_type)
              cand_vd = factor * len * cur * (cand_cable.resistance_ohm_per_km / 1000.0)
              cand_pct = (cand_vd / v) * 100.0
              if cand_pct <= MAX_BRANCH_DROP_PCT
                recommended_size = cand_size
                break
              end
            end
          end

          Result.new(
            voltage_drop_v: vd_v,
            voltage_drop_percent: vd_pct,
            circuit_length_m: len,
            current_a: cur,
            conductor_size_sqmm: size,
            resistance_ohm_per_km: r,
            compliant_branch: compliant_b,
            compliant_feeder: compliant_f,
            recommended_conductor_size_sqmm: recommended_size
          )
        end
      end
    end
  end
end
