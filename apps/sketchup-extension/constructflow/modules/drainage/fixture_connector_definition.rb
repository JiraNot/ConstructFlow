# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class FixtureConnectorDefinition
        SCHEMA_VERSION = 1
        FIXTURE_TYPES = %w[toilet basin shower kitchen_sink floor_waste washing_machine bathtub urinal custom].freeze
        CONNECTOR_TYPES = %w[soil_waste waste cold_water hot_water vent].freeze
        EPSILON = 1.0e-6

        attr_reader :fixture_id, :fixture_type, :connector_type,
                    :position_mm, :nominal_diameter_mm, :flow_rate_lps,
                    :invert_mm, :direction_vector

        def initialize(fixture_id:, fixture_type:, connector_type:,
                       position_mm:, nominal_diameter_mm:, flow_rate_lps: 0.5,
                       invert_mm: nil, direction_vector: [0.0, 0.0, -1.0])
          @fixture_id = fixture_id.to_s
          @fixture_type = fixture_type.to_s
          @connector_type = connector_type.to_s
          @position_mm = normalize_point(position_mm).freeze
          @nominal_diameter_mm = Float(nominal_diameter_mm)
          @flow_rate_lps = Float(flow_rate_lps || 0.0)
          @invert_mm = invert_mm ? Float(invert_mm) : nil
          @direction_vector = normalize_vector(direction_vector).freeze
          freeze
        end

        def errors
          result = []
          result << 'fixture id required' if fixture_id.empty?
          result << 'unsupported fixture type' unless FIXTURE_TYPES.include?(fixture_type)
          result << 'unsupported connector type' unless CONNECTOR_TYPES.include?(connector_type)
          result << 'nominal diameter must be positive' unless nominal_diameter_mm.positive?
          result << 'flow rate cannot be negative' if flow_rate_lps.negative?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def waste_system?
          %w[soil_waste waste].include?(connector_type)
        end

        def water_supply?
          %w[cold_water hot_water].include?(connector_type)
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'fixture_id' => fixture_id,
            'fixture_type' => fixture_type,
            'connector_type' => connector_type,
            'position_mm' => position_mm,
            'nominal_diameter_mm' => nominal_diameter_mm,
            'flow_rate_lps' => flow_rate_lps,
            'invert_mm' => invert_mm,
            'direction_vector' => direction_vector
          }
        end

        def self.from_h(data)
          return nil unless data.is_a?(Hash)

          new(
            fixture_id: data['fixture_id'] || data[:fixture_id],
            fixture_type: data['fixture_type'] || data[:fixture_type],
            connector_type: data['connector_type'] || data[:connector_type],
            position_mm: data['position_mm'] || data[:position_mm],
            nominal_diameter_mm: data['nominal_diameter_mm'] || data[:nominal_diameter_mm],
            flow_rate_lps: data['flow_rate_lps'] || data[:flow_rate_lps] || 0.5,
            invert_mm: data['invert_mm'] || data[:invert_mm],
            direction_vector: data['direction_vector'] || data[:direction_vector] || [0.0, 0.0, -1.0]
          )
        end

        private

        def normalize_point(p)
          arr = Array(p)
          [Float(arr[0] || 0.0), Float(arr[1] || 0.0), Float(arr[2] || 0.0)]
        end

        def normalize_vector(v)
          arr = Array(v)
          vx = Float(arr[0] || 0.0)
          vy = Float(arr[1] || 0.0)
          vz = Float(arr[2] || -1.0)
          len = Math.sqrt((vx * vx) + (vy * vy) + (vz * vz))
          len > EPSILON ? [vx / len, vy / len, vz / len] : [0.0, 0.0, -1.0]
        end
      end
    end
  end
end
