# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module GeometryGuard
        DEFAULT_TOLERANCE_MM = 0.01

        module_function

        def positive_length!(value, label: 'length', tolerance_mm: DEFAULT_TOLERANCE_MM)
          numeric = Float(value)
          raise ArgumentError, "#{label} must be finite" unless numeric.finite?
          raise ArgumentError, "#{label} must be greater than tolerance" unless numeric > tolerance_mm

          numeric
        end

        def non_degenerate_points!(points, label: 'points', tolerance_mm: DEFAULT_TOLERANCE_MM)
          values = Array(points)
          raise ArgumentError, "#{label} requires at least 2 points" if values.length < 2

          values.each_cons(2) do |a, b|
            distance = distance_mm(a, b)
            raise ArgumentError, "#{label} contains a zero-length segment" if distance <= tolerance_mm
          end

          values
        end

        def distinct_points!(points, label: 'points', tolerance_mm: DEFAULT_TOLERANCE_MM)
          values = Array(points)
          values.combination(2) do |a, b|
            raise ArgumentError, "#{label} contains duplicate points" if distance_mm(a, b) <= tolerance_mm
          end
          values
        end

        def distance_mm(a, b)
          ax, ay, az = coordinates(a)
          bx, by, bz = coordinates(b)
          Math.sqrt((ax - bx)**2 + (ay - by)**2 + (az - bz)**2)
        end

        def coordinates(point)
          if point.respond_to?(:x) && point.respond_to?(:y)
            [Float(point.x), Float(point.y), Float(point.respond_to?(:z) ? point.z : 0.0)]
          else
            values = Array(point)
            raise ArgumentError, 'point requires x, y' if values.length < 2
            [Float(values[0]), Float(values[1]), Float(values[2] || 0.0)]
          end
        end
        private_class_method :coordinates
      end
    end
  end
end
