# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class ConduitSizingEngine
        # Standard Conduit Internal Area in sq mm
        # [trade_size_mm] => internal_area_sqmm
        CONDUIT_INTERNAL_AREAS = {
          'emt' => {
            15.0 => 196.0,  # 1/2" ID ~15.8mm
            20.0 => 343.0,  # 3/4" ID ~20.9mm
            25.0 => 556.0,  # 1"   ID ~26.6mm
            32.0 => 968.0,  # 1-1/4" ID ~35.1mm
            40.0 => 1314.0, # 1-1/2" ID ~40.9mm
            50.0 => 2165.0, # 2"   ID ~52.5mm
            65.0 => 3088.0, # 2-1/2" ID ~62.7mm
            80.0 => 4766.0, # 3"   ID ~77.9mm
            100.0 => 8219.0 # 4"   ID ~102.3mm
          },
          'pvc' => {
            15.0 => 181.0,
            20.0 => 320.0,
            25.0 => 519.0,
            32.0 => 905.0,
            40.0 => 1238.0,
            50.0 => 2043.0,
            65.0 => 2922.0,
            80.0 => 4536.0,
            100.0 => 7854.0
          }
        }.freeze

        # NEC Chapter 9 Table 1 / Thai EIT Standard Fill Rules
        MAX_FILL_ONE_CONDUCTOR = 0.53       # 53%
        MAX_FILL_TWO_CONDUCTORS = 0.31      # 31%
        MAX_FILL_THREE_OR_MORE = 0.40       # 40%

        SizingResult = Struct.new(
          :conduit_type, :conduit_size_mm, :internal_area_sqmm,
          :total_cable_area_sqmm, :conductor_count, :fill_percentage,
          :max_allowed_fill_percentage, :compliant, keyword_init: true
        ) do
          def to_h
            {
              'conduit_type' => conduit_type,
              'conduit_size_mm' => conduit_size_mm,
              'internal_area_sqmm' => internal_area_sqmm,
              'total_cable_area_sqmm' => total_cable_area_sqmm,
              'conductor_count' => conductor_count,
              'fill_percentage' => fill_percentage,
              'max_allowed_fill_percentage' => max_allowed_fill_percentage,
              'compliant' => compliant
            }
          end
        end

        def max_fill_ratio(conductor_count)
          case conductor_count
          when 1 then MAX_FILL_ONE_CONDUCTOR
          when 2 then MAX_FILL_TWO_CONDUCTORS
          else MAX_FILL_THREE_OR_MORE
          end
        end

        def calculate_size(cables:, conduit_type: 'emt')
          cables_arr = Array(cables)
          raise ArgumentError, 'at least one cable required for conduit sizing' if cables_arr.empty?

          type = conduit_type.to_s.downcase
          table = CONDUIT_INTERNAL_AREAS[type] || CONDUIT_INTERNAL_AREAS['emt']

          total_area = cables_arr.sum(&:cross_section_area_sqmm)
          total_conductors = cables_arr.sum(&:conductor_count)

          allowed_fill = max_fill_ratio(total_conductors)
          min_required_area = total_area / allowed_fill

          # Find the smallest standard conduit whose internal area >= min_required_area
          selected_size, selected_area = table.sort_by(&:first).find do |_, area|
            area >= min_required_area
          end

          # If none large enough, pick largest and mark non-compliant
          unless selected_size
            selected_size, selected_area = table.max_by(&:first)
          end

          fill_pct = (total_area / selected_area) * 100.0
          max_pct = allowed_fill * 100.0

          SizingResult.new(
            conduit_type: type,
            conduit_size_mm: selected_size,
            internal_area_sqmm: selected_area,
            total_cable_area_sqmm: total_area.round(2),
            conductor_count: total_conductors,
            fill_percentage: fill_pct.round(2),
            max_allowed_fill_percentage: max_pct.round(2),
            compliant: fill_pct <= (max_pct + 0.01)
          )
        end
      end
    end
  end
end
