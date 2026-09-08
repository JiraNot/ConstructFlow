# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class Geometry
        DEFAULT_UNKNOWN_DEPTH_MM = 600.0

        def create_manhole_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Manhole'
          rebuild_manhole!(group, definition)
          group
        end

        def rebuild_manhole!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          x, y, z = definition.location_mm
          width, length = definition.size_mm
          top_z = definition.cover_level_mm || z
          depth = definition.depth_mm || DEFAULT_UNKNOWN_DEPTH_MM
          half_w = width / 2.0
          half_l = length / 2.0

          face = entities.add_face(
            point([x - half_w, y - half_l, top_z]),
            point([x + half_w, y - half_l, top_z]),
            point([x + half_w, y + half_l, top_z]),
            point([x - half_w, y + half_l, top_z])
          )
          raise 'failed to create manhole top face' unless face

          face.reverse! if face.normal.z > 0
          face.pushpull(Core::Units.mm_to_su(depth))
          group
        end

        def create_pipe_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Drainage Route'
          rebuild_pipe!(group, definition)
          group
        end

        def rebuild_pipe!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          definition.route_nodes_mm.each_cons(2) do |a, b|
            entities.add_line(point(a), point(b))
          end
          group
        end

        private

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
