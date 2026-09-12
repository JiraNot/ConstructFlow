# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class CableDefinition
        SCHEMA_VERSION = 1
        INSULATION_TYPES = %w[thw thhn xlpe nyy vaf].freeze

        # Approximate outer diameters in mm for single-core insulated wire
        # [size_sqmm][insulation_type] => OD mm
        STANDARD_OD_TABLE = {
          1.5 => { 'thw' => 3.3, 'thhn' => 2.9, 'xlpe' => 3.1, 'nyy' => 5.2, 'vaf' => 3.5 },
          2.5 => { 'thw' => 3.9, 'thhn' => 3.4, 'xlpe' => 3.6, 'nyy' => 5.8, 'vaf' => 4.0 },
          4.0 => { 'thw' => 4.6, 'thhn' => 4.0, 'xlpe' => 4.2, 'nyy' => 6.5, 'vaf' => 4.8 },
          6.0 => { 'thw' => 5.2, 'thhn' => 4.5, 'xlpe' => 4.8, 'nyy' => 7.2, 'vaf' => 5.5 },
          10.0 => { 'thw' => 6.8, 'thhn' => 5.8, 'xlpe' => 6.2, 'nyy' => 8.8, 'vaf' => 7.0 },
          16.0 => { 'thw' => 7.8, 'thhn' => 6.8, 'xlpe' => 7.2, 'nyy' => 10.0, 'vaf' => 8.2 },
          25.0 => { 'thw' => 9.8, 'thhn' => 8.5, 'xlpe' => 9.0, 'nyy' => 12.0, 'vaf' => 10.5 },
          35.0 => { 'thw' => 11.2, 'thhn' => 9.8, 'xlpe' => 10.2, 'nyy' => 13.5, 'vaf' => 12.0 },
          50.0 => { 'thw' => 13.0, 'thhn' => 11.5, 'xlpe' => 12.0, 'nyy' => 15.5, 'vaf' => 14.0 }
        }.freeze

        # DC/AC Copper conductor resistance at 75°C (Ohm / km)
        STANDARD_RESISTANCE_OHM_PER_KM = {
          1.5 => 14.8,
          2.5 => 8.91,
          4.0 => 5.57,
          6.0 => 3.71,
          10.0 => 2.24,
          16.0 => 1.41,
          25.0 => 0.889,
          35.0 => 0.641,
          50.0 => 0.473
        }.freeze

        attr_reader :id, :conductor_size_sqmm, :conductor_count,
                    :insulation_type, :voltage_rating_v

        def initialize(id: nil, conductor_size_sqmm: 2.5, conductor_count: 1,
                       insulation_type: 'thw', voltage_rating_v: 450)
          @id = id&.to_s
          @conductor_size_sqmm = Float(conductor_size_sqmm)
          @conductor_count = Integer(conductor_count)
          @insulation_type = insulation_type.to_s.downcase
          @voltage_rating_v = Integer(voltage_rating_v)
          freeze
        end

        def errors
          result = []
          result << 'conductor size must be positive' unless conductor_size_sqmm.positive?
          result << 'conductor count must be at least 1' unless conductor_count >= 1
          result << 'unsupported insulation type' unless INSULATION_TYPES.include?(insulation_type)
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def outer_diameter_mm
          base_od = STANDARD_OD_TABLE.dig(conductor_size_sqmm, insulation_type) || (Math.sqrt(conductor_size_sqmm) * 2.5)
          if conductor_count == 1
            base_od
          elsif conductor_count == 2
            base_od * 2.0
          elsif conductor_count == 3
            base_od * 2.15
          else
            base_od * Math.sqrt(conductor_count) * 1.2
          end
        end

        def cross_section_area_sqmm
          # Area based on outer diameter (conduit fill calculation uses outer boundary area)
          r = outer_diameter_mm / 2.0
          Math::PI * (r**2)
        end

        def resistance_ohm_per_km
          STANDARD_RESISTANCE_OHM_PER_KM[conductor_size_sqmm] || (22.2 / conductor_size_sqmm)
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'conductor_size_sqmm' => conductor_size_sqmm,
            'conductor_count' => conductor_count,
            'insulation_type' => insulation_type,
            'voltage_rating_v' => voltage_rating_v,
            'outer_diameter_mm' => outer_diameter_mm,
            'cross_section_area_sqmm' => cross_section_area_sqmm,
            'resistance_ohm_per_km' => resistance_ohm_per_km
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            conductor_size_sqmm: data['conductor_size_sqmm'] || data[:conductor_size_sqmm] || 2.5,
            conductor_count: data['conductor_count'] || data[:conductor_count] || 1,
            insulation_type: data['insulation_type'] || data[:insulation_type] || 'thw',
            voltage_rating_v: data['voltage_rating_v'] || data[:voltage_rating_v] || 450
          )
        end
      end
    end
  end
end
