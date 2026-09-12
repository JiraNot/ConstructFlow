# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class RoomGeometry
        def create_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Room Boundary'
          rebuild!(group, definition)
          group
        end

        def rebuild!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          points = definition.boundary_mm.map { |point| point_from_mm(point) }
          points.each_with_index { |point, index| entities.add_line(point, points[(index + 1) % points.length]) }
          group
        end

        private

        def point_from_mm(values)
          x, y, z = Core::Units.point_from_mm(values)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
