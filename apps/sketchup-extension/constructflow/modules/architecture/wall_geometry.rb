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

        def rebuild!(group, definition, openings: [])
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          if Array(openings).empty?
            add_polyline_wall(entities, definition.centerline_path_mm, definition.thickness_mm, definition.height_mm)
            return group
          end

          definition.centerline_path_mm.each_cons(2).with_index do |(start_mm, finish_mm), segment_index|
            segment_openings = Array(openings).select do |opening|
              Integer(opening['segment_index'] || opening[:segment_index] || 0) == segment_index
            end
            add_segment(
              entities,
              start_mm,
              finish_mm,
              definition.thickness_mm,
              definition.height_mm,
              segment_openings
            )
          end
          group
        end

        # Builds one continuous wall prism for a polyline. Segment-by-segment
        # rectangles are retained for hosted openings, where the cells are
        # needed to form the cutout; ordinary walls use this joined outline so
        # corners do not overlap or leave visible seams.
        def outline_points_mm(path_mm:, thickness_mm:)
          path = Array(path_mm)
          raise ArgumentError, 'wall path requires at least two points' if path.length < 2

          half = Float(thickness_mm) / 2.0
          left = offset_polyline(path, half)
          right = offset_polyline(path, -half)
          (left + right.reverse).map(&:freeze).freeze
        end

        private

        def add_polyline_wall(entities, path_mm, thickness_mm, height_mm)
          face = entities.add_face(outline_points_mm(path_mm: path_mm, thickness_mm: thickness_mm).map { |value| point_mm(value) })
          raise 'failed to create joined wall face' unless face

          face.reverse! if face.normal.z < 0
          face.pushpull(Core::Units.mm_to_su(height_mm))
        end

        def offset_polyline(path, offset)
          points = path.map { |value| Array(value).first(3).map { |item| Float(item) } }
          points.each_index.map do |index|
            if index.zero? || index == points.length - 1
              a = points[[index - 1, 0].max]
              b = points[[index + 1, points.length - 1].min]
              nx, ny = normal_for(a, b)
              [points[index][0] + nx * offset, points[index][1] + ny * offset, points[index][2]]
            else
              previous = points[index - 1]
              current = points[index]
              following = points[index + 1]
              first_normal = normal_for(previous, current)
              second_normal = normal_for(current, following)
              intersection = line_intersection(
                [previous[0] + first_normal[0] * offset, previous[1] + first_normal[1] * offset],
                [current[0] + first_normal[0] * offset, current[1] + first_normal[1] * offset],
                [current[0] + second_normal[0] * offset, current[1] + second_normal[1] * offset],
                [following[0] + second_normal[0] * offset, following[1] + second_normal[1] * offset]
              )
              if intersection
                [intersection[0], intersection[1], current[2]]
              else
                average_normal = normal_for(previous, following)
                [current[0] + average_normal[0] * offset, current[1] + average_normal[1] * offset, current[2]]
              end
            end
          end
        end

        def normal_for(first, second)
          dx = second[0] - first[0]
          dy = second[1] - first[1]
          length = Math.sqrt((dx * dx) + (dy * dy))
          return [0.0, 1.0] if length <= 0.001

          [-dy / length, dx / length]
        end

        def line_intersection(first_a, first_b, second_a, second_b)
          denominator = ((first_b[0] - first_a[0]) * (second_b[1] - second_a[1])) -
                        ((first_b[1] - first_a[1]) * (second_b[0] - second_a[0]))
          return nil if denominator.abs <= 0.000001

          ratio = (((second_a[0] - first_a[0]) * (second_b[1] - second_a[1])) -
                   ((second_a[1] - first_a[1]) * (second_b[0] - second_a[0]))) / denominator
          [first_a[0] + ratio * (first_b[0] - first_a[0]), first_a[1] + ratio * (first_b[1] - first_a[1])]
        end

        def add_segment(entities, start_mm, finish_mm, thickness_mm, height_mm, openings)
          if openings.empty?
            add_full_segment(entities, start_mm, finish_mm, thickness_mm, height_mm)
            return
          end

          length_mm = segment_length_mm(start_mm, finish_mm)
          normalized = openings.map { |opening| normalize_opening(opening) }
          x_breaks = [0.0, length_mm]
          z_breaks = [0.0, Float(height_mm)]

          normalized.each do |opening|
            x_breaks.concat([opening[:start_offset_mm], opening[:start_offset_mm] + opening[:width_mm]])
            z_breaks.concat([opening[:sill_mm], opening[:sill_mm] + opening[:height_mm]])
          end

          x_intervals = intervals(x_breaks, 0.0, length_mm)
          z_intervals = intervals(z_breaks, 0.0, Float(height_mm))
          x_intervals.each do |x0, x1|
            z_intervals.each do |z0, z1|
              center_x = (x0 + x1) / 2.0
              center_z = (z0 + z1) / 2.0
              next if normalized.any? { |opening| inside_opening?(center_x, center_z, opening) }

              add_segment_cell(entities, start_mm, finish_mm, thickness_mm, x0, x1, z0, z1)
            end
          end
        end

        def add_full_segment(entities, start_mm, finish_mm, thickness_mm, height_mm)
          start = point_mm(start_mm)
          finish = point_mm(finish_mm)
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

        def add_segment_cell(entities, start_mm, finish_mm, thickness_mm, x0_mm, x1_mm, z0_mm, z1_mm)
          return if (x1_mm - x0_mm) <= 0.001 || (z1_mm - z0_mm) <= 0.001

          sx, sy, sz = start_mm.map { |value| Float(value) }
          fx, fy, fz = finish_mm.map { |value| Float(value) }
          dx = fx - sx
          dy = fy - sy
          dz = fz - sz
          planar_length = Math.sqrt((dx * dx) + (dy * dy))
          raise ArgumentError, 'wall segment cannot be vertical/zero in plan' if planar_length <= 0.001
          raise ArgumentError, 'hosted openings currently require a level wall segment' if dz.abs > 1.0

          ux = dx / planar_length
          uy = dy / planar_length
          nx = -uy
          ny = ux
          half_t = Float(thickness_mm) / 2.0

          ax = sx + (ux * x0_mm)
          ay = sy + (uy * x0_mm)
          bx = sx + (ux * x1_mm)
          by = sy + (uy * x1_mm)
          base_z = sz + z0_mm

          face = entities.add_face(
            point_mm([ax + (nx * half_t), ay + (ny * half_t), base_z]),
            point_mm([bx + (nx * half_t), by + (ny * half_t), base_z]),
            point_mm([bx - (nx * half_t), by - (ny * half_t), base_z]),
            point_mm([ax - (nx * half_t), ay - (ny * half_t), base_z])
          )
          raise 'failed to create wall cell base face' unless face

          face.reverse! if face.normal.z < 0
          face.pushpull(Core::Units.mm_to_su(z1_mm - z0_mm))
        end

        def normalize_opening(opening)
          {
            start_offset_mm: Float(opening['start_offset_mm'] || opening[:start_offset_mm]),
            width_mm: Float(opening['width_mm'] || opening[:width_mm]),
            height_mm: Float(opening['height_mm'] || opening[:height_mm]),
            sill_mm: Float(opening['sill_mm'] || opening[:sill_mm] || 0)
          }
        end

        def inside_opening?(x_mm, z_mm, opening)
          x_mm > opening[:start_offset_mm] &&
            x_mm < (opening[:start_offset_mm] + opening[:width_mm]) &&
            z_mm > opening[:sill_mm] &&
            z_mm < (opening[:sill_mm] + opening[:height_mm])
        end

        def intervals(values, min, max)
          points = values.map { |value| [[Float(value), min].max, max].min }.uniq.sort
          points.each_cons(2).select { |a, b| (b - a) > 0.001 }
        end

        def segment_length_mm(start_mm, finish_mm)
          dx = Float(finish_mm[0]) - Float(start_mm[0])
          dy = Float(finish_mm[1]) - Float(start_mm[1])
          Math.sqrt((dx * dx) + (dy * dy))
        end

        def point_mm(values)
          x, y, z = Core::Units.point_from_mm(values)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
