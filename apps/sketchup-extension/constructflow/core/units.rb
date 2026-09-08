# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Units
        MM_PER_INCH = 25.4

        module_function

        def mm_to_su(value_mm)
          Float(value_mm) / MM_PER_INCH
        end

        def su_to_mm(value_su)
          Float(value_su) * MM_PER_INCH
        end

        def point_to_mm(point)
          [su_to_mm(point.x), su_to_mm(point.y), su_to_mm(point.z)]
        end

        def point_from_mm(values)
          values = Array(values)
          raise ArgumentError, 'point requires x, y, z' unless values.length >= 3

          [mm_to_su(values[0]), mm_to_su(values[1]), mm_to_su(values[2])]
        end
      end
    end
  end
end
