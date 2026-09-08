# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class ParkingLayoutDefinition
        SCHEMA_VERSION = 1

        attr_reader :surface_object_id, :origin_mm, :bay_count, :bay_width_mm,
                    :bay_length_mm, :angle_deg, :divider_width_mm,
                    :outer_border_width_mm

        def initialize(surface_object_id:, origin_mm:, bay_count: 3,
                       bay_width_mm: 2500, bay_length_mm: 5000,
                       angle_deg: 0, divider_width_mm: 100,
                       outer_border_width_mm: 150)
          @surface_object_id = surface_object_id.to_s
          @origin_mm = normalize_point(origin_mm).freeze
          @bay_count = Integer(bay_count)
          @bay_width_mm = Float(bay_width_mm)
          @bay_length_mm = Float(bay_length_mm)
          @angle_deg = Float(angle_deg)
          @divider_width_mm = Float(divider_width_mm)
          @outer_border_width_mm = Float(outer_border_width_mm)
          freeze
        end

        def errors
          result = []
          result << 'surface object id required' if surface_object_id.empty?
          result << 'parking bay count must be at least one' unless bay_count.positive?
          result << 'parking bay width must be greater than zero' unless bay_width_mm.positive?
          result << 'parking bay length must be greater than zero' unless bay_length_mm.positive?
          result << 'parking divider width cannot be negative' if divider_width_mm.negative?
          result << 'parking outer border width cannot be negative' if outer_border_width_mm.negative?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def total_width_mm
          (bay_count * bay_width_mm) + ([bay_count - 1, 0].max * divider_width_mm)
        end

        def bay_boundaries_mm
          primary, secondary = basis
          bay_count.times.map do |index|
            offset = index * (bay_width_mm + divider_width_mm)
            origin = add(origin_mm, scale(primary, offset))
            p0 = origin
            p1 = add(origin, scale(primary, bay_width_mm))
            p2 = add(p1, scale(secondary, bay_length_mm))
            p3 = add(origin, scale(secondary, bay_length_mm))
            [p0, p1, p2, p3].map(&:freeze).freeze
          end.freeze
        end

        def divider_centerlines_mm
          return [].freeze if bay_count <= 1
          primary, secondary = basis
          (1...bay_count).map do |index|
            offset = (index * bay_width_mm) + ((index - 0.5) * divider_width_mm)
            start = add(origin_mm, scale(primary, offset))
            finish = add(start, scale(secondary, bay_length_mm))
            [start.freeze, finish.freeze].freeze
          end.freeze
        end

        def footprint_area_mm2
          total_width_mm * bay_length_mm
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'surface_object_id' => surface_object_id,
            'origin_mm' => origin_mm,
            'bay_count' => bay_count,
            'bay_width_mm' => bay_width_mm,
            'bay_length_mm' => bay_length_mm,
            'angle_deg' => angle_deg,
            'divider_width_mm' => divider_width_mm,
            'outer_border_width_mm' => outer_border_width_mm
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            surface_object_id: data['surface_object_id'] || data[:surface_object_id],
            origin_mm: data['origin_mm'] || data[:origin_mm] || [0, 0, 0],
            bay_count: data['bay_count'] || data[:bay_count] || 3,
            bay_width_mm: data['bay_width_mm'] || data[:bay_width_mm] || 2500,
            bay_length_mm: data['bay_length_mm'] || data[:bay_length_mm] || 5000,
            angle_deg: data['angle_deg'] || data[:angle_deg] || 0,
            divider_width_mm: data['divider_width_mm'] || data[:divider_width_mm] || 100,
            outer_border_width_mm: data['outer_border_width_mm'] || data[:outer_border_width_mm] || 150
          )
        end

        private

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'parking origin requires x, y, z' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def basis
          radians = angle_deg * Math::PI / 180.0
          primary = [Math.cos(radians), Math.sin(radians), 0.0]
          secondary = [-Math.sin(radians), Math.cos(radians), 0.0]
          [primary, secondary]
        end

        def scale(vector, scalar)
          [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar]
        end

        def add(a, b)
          [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
        end
      end
    end
  end
end
