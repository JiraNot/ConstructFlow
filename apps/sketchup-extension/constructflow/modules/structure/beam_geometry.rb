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

          width = definition.section_mm[0]
          depth = definition.section_mm[1]
          half = width / 2.0
          nx = -dy / length
          ny = dx / length
          z = definition.base_elevation_mm

          anchor = definition.respond_to?(:anchor) ? definition.anchor : :top_center
          case anchor.to_sym
          when :top_left, :middle_left, :bottom_left
            lat_shift = half
          when :top_right, :middle_right, :bottom_right
            lat_shift = -half
          else
            lat_shift = 0.0
          end

          case anchor.to_sym
          when :bottom_left, :bottom_center, :bottom_right
            z_top = z + depth
          when :middle_left, :center, :middle_right
            z_top = z + (depth / 2.0)
          else # top_left, top_center, top_right
            z_top = z
          end

          corners = [
            [start_mm[0] + nx * (lat_shift + half), start_mm[1] + ny * (lat_shift + half), z_top],
            [finish_mm[0] + nx * (lat_shift + half), finish_mm[1] + ny * (lat_shift + half), z_top],
            [finish_mm[0] + nx * (lat_shift - half), finish_mm[1] + ny * (lat_shift - half), z_top],
            [start_mm[0] + nx * (lat_shift - half), start_mm[1] + ny * (lat_shift - half), z_top]
          ]
          face = entities.add_face(*corners.map { |point_mm| point(point_mm) })
          raise 'failed to create structural beam face' unless face
          face.reverse! if face.normal.z < 0
          face.pushpull(-Core::Units.mm_to_su(depth))
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
