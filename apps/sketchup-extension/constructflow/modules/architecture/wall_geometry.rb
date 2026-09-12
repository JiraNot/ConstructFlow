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
            add_polyline_wall(entities, definition.centerline_path_mm, definition.thickness_mm, definition.height_mm, joins: definition.joins)
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
        def outline_points_mm(path_mm:, thickness_mm:, joins: [])
          path = Array(path_mm)
          raise ArgumentError, 'wall path requires at least two points' if path.length < 2

          half = Float(thickness_mm) / 2.0
          left = offset_polyline(path, half, joins: joins, thickness_mm: thickness_mm)
          right = offset_polyline(path, -half, joins: joins, thickness_mm: thickness_mm)
          (left + right.reverse).map(&:freeze).freeze
        end

        private

        def add_polyline_wall(entities, path_mm, thickness_mm, height_mm, joins: [])
          face = entities.add_face(outline_points_mm(path_mm: path_mm, thickness_mm: thickness_mm, joins: joins).map { |value| point_mm(value) })
          raise 'failed to create joined wall face' unless face

          face.reverse! if face.normal.z < 0
          face.pushpull(Core::Units.mm_to_su(height_mm))
        end

        def offset_polyline(path, offset, joins: [], thickness_mm: 100.0)
          points = path.map { |value| Array(value).first(3).map { |item| Float(item) } }
          points.each_index.map do |index|
            if index.zero?
              join = Array(joins).find { |j| (j['node_index'] || j[:node_index]) == 0 && (j['style'] || j[:style]) != 'disallow' && (j['allow'] != false && j[:allow] != false) }
              vec = join ? (join['other_vector'] || join[:other_vector]) : nil
              style = join ? (join['style'] || join[:style]) : nil
              type = join ? (join['type'] || join[:type]) : nil
              other_thick = join ? (join['other_thickness_mm'] || join[:other_thickness_mm]) : nil

              if vec && (style == 'miter' || type == 'L')
                v1 = [points[1][0] - points[0][0], points[1][1] - points[0][1], 0.0]
                miter_offset_point(points[0], v1, vec, offset, thickness_mm)
              elsif type == 'T' && style == 'butt' && other_thick
                nx, ny = normal_for(points[0], points[1])
                dx = points[1][0] - points[0][0]
                dy = points[1][1] - points[0][1]
                len = Math.sqrt(dx * dx + dy * dy)
                shift = (len > 0.001) ? (other_thick.to_f / 2.0) : 0.0
                ux = (len > 0.001) ? (dx / len) : 0.0
                uy = (len > 0.001) ? (dy / len) : 0.0
                [points[0][0] + (ux * shift) + (nx * offset), points[0][1] + (uy * shift) + (ny * offset), points[0][2]]
              else
                a = points[0]
                b = points[[1, points.length - 1].min]
                nx, ny = normal_for(a, b)
                [points[index][0] + nx * offset, points[index][1] + ny * offset, points[index][2]]
              end
            elsif index == points.length - 1
              join = Array(joins).find { |j| (j['node_index'] || j[:node_index]) == index && (j['style'] || j[:style]) != 'disallow' && (j['allow'] != false && j[:allow] != false) }
              vec = join ? (join['other_vector'] || join[:other_vector]) : nil
              style = join ? (join['style'] || join[:style]) : nil
              type = join ? (join['type'] || join[:type]) : nil
              other_thick = join ? (join['other_thickness_mm'] || join[:other_thickness_mm]) : nil

              if vec && (style == 'miter' || type == 'L')
                v1 = [points[index - 1][0] - points[index][0], points[index - 1][1] - points[index][1], 0.0]
                miter_offset_point(points[index], v1, vec, offset, thickness_mm)
              elsif type == 'T' && style == 'butt' && other_thick
                nx, ny = normal_for(points[index - 1], points[index])
                dx = points[index - 1][0] - points[index][0]
                dy = points[index - 1][1] - points[index][1]
                len = Math.sqrt(dx * dx + dy * dy)
                shift = (len > 0.001) ? (other_thick.to_f / 2.0) : 0.0
                ux = (len > 0.001) ? (dx / len) : 0.0
                uy = (len > 0.001) ? (dy / len) : 0.0
                [points[index][0] + (ux * shift) + (nx * offset), points[index][1] + (uy * shift) + (ny * offset), points[index][2]]
              else
                a = points[[index - 1, 0].max]
                b = points[index]
                nx, ny = normal_for(a, b)
                [points[index][0] + nx * offset, points[index][1] + ny * offset, points[index][2]]
              end
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

        def miter_offset_point(p0, v1, v2, offset, thickness_mm)
          len1 = Math.sqrt(v1[0]**2 + v1[1]**2)
          len2 = Math.sqrt(v2[0]**2 + v2[1]**2)
          return [p0[0], p0[1], p0[2]] if len1 <= 0.001 || len2 <= 0.001

          u1 = [v1[0] / len1, v1[1] / len1]
          u2 = [v2[0] / len2, v2[1] / len2]
          n1 = [-u1[1], u1[0]]

          cross = (u1[0] * u2[1]) - (u1[1] * u2[0])
          if cross.abs <= 0.01
            return [p0[0] + (n1[0] * offset), p0[1] + (n1[1] * offset), p0[2]]
          end

          p_off = [n1[0] * offset, n1[1] * offset]
          p_off_cross_u1 = (p_off[0] * u1[1]) - (p_off[1] * u1[0])
          s = p_off_cross_u1 / (-cross)

          max_s = thickness_mm.to_f * 2.5
          s = s.clamp(-max_s, max_s)

          m = [u1[0] + u2[0], u1[1] + u2[1]]
          [p0[0] + (s * m[0]), p0[1] + (s * m[1]), p0[2]]
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
