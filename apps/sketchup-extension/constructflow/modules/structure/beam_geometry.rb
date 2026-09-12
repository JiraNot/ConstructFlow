# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class BeamGeometry
        def create_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Structural Beam'
          rebuild!(group, definition)
          group
        end

        def rebuild!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          start_mm, finish_mm = definition.path_mm
          dx = finish_mm[0] - start_mm[0]
          dy = finish_mm[1] - start_mm[1]
          length = Math.sqrt((dx * dx) + (dy * dy))
          raise ArgumentError, 'beam cannot be vertical or zero length in plan' if length <= 0.001

          half = definition.section_mm[0] / 2.0
          nx = -dy / length
          ny = dx / length
          z = definition.base_elevation_mm
          corners = [
            [start_mm[0] + nx * half, start_mm[1] + ny * half, z],
            [finish_mm[0] + nx * half, finish_mm[1] + ny * half, z],
            [finish_mm[0] - nx * half, finish_mm[1] - ny * half, z],
            [start_mm[0] - nx * half, start_mm[1] - ny * half, z]
          ]
          face = entities.add_face(*corners.map { |point_mm| point(point_mm) })
          raise 'failed to create structural beam face' unless face
          face.reverse! if face.normal.z < 0
          face.pushpull(Core::Units.mm_to_su(definition.section_mm[1]))
          group
        end

        private

        def point(values_mm)
          values = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(*values)
        end
      end
    end
  end
end
