# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module GeometryGuard
        DEFAULT_TOLERANCE_MM = 0.01

        module_function

        def finite_number!(value, label: 'value')
          number = Float(value)
          raise ArgumentError, "#{label} must be finite" unless number.finite?
          number
        end

        def positive_mm!(value, label: 'dimension', tolerance_mm: DEFAULT_TOLERANCE_MM)
          number = finite_number!(value, label: label)
          raise ArgumentError, "#{label} must be greater than #{tolerance_mm} mm" unless number > tolerance_mm
          number
        end

        def point3!(value, label: 'point')
          point = Array(value)
          raise ArgumentError, "#{label} requires x, y, z" unless point.length >= 3
          point.first(3).map.with_index { |item, index| finite_number!(item, label: "#{label}[#{index}]") }.freeze
        end

        def distinct_points!(a, b, label: 'segment', tolerance_mm: DEFAULT_TOLERANCE_MM)
          pa = point3!(a, label: "#{label}.start")
          pb = point3!(b, label: "#{label}.end")
          dx = pb[0] - pa[0]
          dy = pb[1] - pa[1]
          dz = pb[2] - pa[2]
          length = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          raise ArgumentError, "#{label} is degenerate" unless length > tolerance_mm
          [pa, pb].freeze
        end
      end
    end
  end
end
