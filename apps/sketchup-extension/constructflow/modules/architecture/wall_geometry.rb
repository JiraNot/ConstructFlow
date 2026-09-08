# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class WallGeometry
        def create_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Wall'
          rebuild!(group, definition)
          group
        end

        def rebuild!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          definition.path_mm.each_cons(2) do |start_mm, finish_mm|
            add_segment(entities, start_mm, finish_mm, definition.thickness_mm, definition.height_mm)
          end
          group
        end

        private

        def add_segment(entities, start_mm, finish_mm, thickness_mm, height_mm)
          start = point(start_mm)
          finish = point(finish_mm)
          dx = finish.x - start.x
          dy = finish.y - start.y
          planar_length = Math.sqrt((dx * dx) + (dy * dy))
          raise ArgumentError, 'wall segment cannot be vertical/zero in plan' if planar_length <= 1e-9

          half = Core::Units.mm_to_su(thickness_mm) / 2.0
          ox = (-dy / planar_length) * half
          oy = (dx / planar_length) * half

          face = entities.add_face(
            Geom::Point3d.new(start.x + ox, start.y + oy, start.z),
            Geom::Point3d.new(finish.x + ox, finish.y + oy, finish.z),
            Geom::Point3d.new(finish.x - ox, finish.y - oy, finish.z),
            Geom::Point3d.new(start.x - ox, start.y - oy, start.z)
          )
          raise 'failed to create wall base face' unless face

          face.reverse! if face.normal.z < 0
          face.pushpull(Core::Units.mm_to_su(height_mm))
        end

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
