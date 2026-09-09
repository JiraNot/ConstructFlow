# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class Geometry
        DEFAULT_SIZE_MM = [500.0, 500.0, 500.0].freeze

        def create_fixed_asset_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Catalog Asset'
          rebuild_fixed_asset!(group, definition)
          group
        end

        def rebuild_fixed_asset!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          width, depth, height = definition.dimensions_mm || DEFAULT_SIZE_MM
          local = [
            [0, 0, 0], [width, 0, 0], [width, depth, 0], [0, depth, 0],
            [0, 0, height], [width, 0, height], [width, depth, height], [0, depth, height]
          ]
          edges = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
          ]
          points = local.map { |value| point(transform(value, definition)) }
          edges.each { |a, b| entities.add_line(points[a], points[b]) }
          group
        end

        private

        def transform(local, definition)
          radians = definition.rotation_deg * Math::PI / 180.0
          cos = Math.cos(radians)
          sin = Math.sin(radians)
          x = Float(local[0])
          y = Float(local[1])
          [
            definition.location_mm[0] + (x * cos) - (y * sin),
            definition.location_mm[1] + (x * sin) + (y * cos),
            definition.location_mm[2] + Float(local[2])
          ]
        end

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
