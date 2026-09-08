# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class LayoutSolver
        SUPPORTED_PATTERNS = %w[grid running_bond diagonal].freeze
        MAX_CANDIDATE_CELLS = 20_000
        EPSILON = 1.0e-6
        AREA_EPSILON = 0.01

        def solve(surface_definition:, pattern_definition:, pattern_object_id:)
          raise ArgumentError, surface_definition.errors.join('; ') unless surface_definition.valid?
          raise ArgumentError, pattern_definition.errors.join('; ') unless pattern_definition.valid?

          unless SUPPORTED_PATTERNS.include?(pattern_definition.pattern)
            return PavingLayoutDefinition.new(
              surface_object_id: pattern_definition.surface_object_id,
              pattern_object_id: pattern_object_id,
              pattern: pattern_definition.pattern,
              status: 'unsupported',
              warnings: ["piece solver does not support #{pattern_definition.pattern} yet"]
            )
          end

          basis = pattern_definition.basis
          outer_local = to_local_loop(surface_definition.outer_boundary_mm, pattern_definition.origin_mm, basis)
          holes_local = surface_definition.holes_mm.map do |loop|
            to_local_loop(loop, pattern_definition.origin_mm, basis)
          end
          outer_triangles = triangulate(outer_local)
          hole_triangles = holes_local.flat_map { |loop| triangulate(loop) }

          min_u, min_v, max_u, max_v = bounds(outer_local)
          width = pattern_definition.module_mm[0]
          height = pattern_definition.module_mm[1]
          step_u = width + pattern_definition.joint_mm
          step_v = height + pattern_definition.joint_mm
          col_min = (min_u / step_u).floor - 1
          col_max = (max_u / step_u).ceil + 1
          row_min = (min_v / step_v).floor - 1
          row_max = (max_v / step_v).ceil + 1
          candidate_count = (col_max - col_min + 1) * (row_max - row_min + 1)
          if candidate_count > MAX_CANDIDATE_CELLS
            return PavingLayoutDefinition.new(
              surface_object_id: pattern_definition.surface_object_id,
              pattern_object_id: pattern_object_id,
              pattern: pattern_definition.pattern,
              status: 'failed',
              warnings: ["layout requires #{candidate_count} candidate cells; maximum is #{MAX_CANDIDATE_CELLS}"]
            )
          end

          pieces = []
          row_min.upto(row_max) do |row|
            row_shift = running_bond_shift(pattern_definition.pattern, row, step_u)
            col_min.upto(col_max) do |column|
              u0 = (column * step_u) + row_shift
              v0 = row * step_v
              rect = [u0, v0, u0 + width, v0 + height]
              piece = solve_piece(
                rect: rect,
                row: row,
                column: column,
                outer_triangles: outer_triangles,
                hole_triangles: hole_triangles,
                pattern_definition: pattern_definition,
                basis: basis
              )
              pieces << piece if piece
            end
          end

          warnings = []
          violations = pieces.count { |piece| piece['minimum_cut_violation'] }
          warnings << "#{violations} cut pieces are below the configured minimum cut rule" if violations.positive?

          PavingLayoutDefinition.new(
            surface_object_id: pattern_definition.surface_object_id,
            pattern_object_id: pattern_object_id,
            pattern: pattern_definition.pattern,
            status: 'solved',
            pieces: pieces,
            warnings: warnings
          )
        rescue StandardError => error
          PavingLayoutDefinition.new(
            surface_object_id: pattern_definition.surface_object_id,
            pattern_object_id: pattern_object_id,
            pattern: pattern_definition.pattern,
            status: 'failed',
            warnings: [error.message]
          )
        end

        private

        def solve_piece(rect:, row:, column:, outer_triangles:, hole_triangles:,
                        pattern_definition:, basis:)
          outer_fragments = outer_triangles.filter_map do |triangle|
            clipped = clip_polygon_to_rect(triangle, rect)
            clipped if polygon_area(clipped) > AREA_EPSILON
          end
          return nil if outer_fragments.empty?

          hole_fragments = hole_triangles.filter_map do |triangle|
            clipped = clip_polygon_to_rect(triangle, rect)
            clipped if polygon_area(clipped) > AREA_EPSILON
          end
          outer_area = outer_fragments.sum { |polygon| polygon_area(polygon) }
          hole_area = hole_fragments.sum { |polygon| polygon_area(polygon) }
          visible_area = [outer_area - hole_area, 0.0].max
          return nil if visible_area <= AREA_EPSILON

          width = rect[2] - rect[0]
          height = rect[3] - rect[1]
          nominal_area = width * height
          full = hole_area <= AREA_EPSILON && (nominal_area - visible_area).abs <= [nominal_area * 1.0e-6, AREA_EPSILON].max
          effective_cut = full ? [width, height].min : visible_area / [width, height].max
          minimum_cut_violation = !full && effective_cut + EPSILON < pattern_definition.minimum_cut_mm

          {
            'id' => "piece_r#{row}_c#{column}",
            'row' => row,
            'column' => column,
            'classification' => full ? 'full' : 'cut',
            'nominal_area_mm2' => nominal_area,
            'visible_area_mm2' => visible_area,
            'cut_waste_area_mm2' => [nominal_area - visible_area, 0.0].max,
            'minimum_effective_cut_mm' => effective_cut,
            'minimum_cut_violation' => minimum_cut_violation,
            'cell_local_mm' => rect,
            'fragments_mm' => outer_fragments.map { |polygon| to_world_loop(polygon, pattern_definition.origin_mm, basis) },
            'void_fragments_mm' => hole_fragments.map { |polygon| to_world_loop(polygon, pattern_definition.origin_mm, basis) }
          }
        end

        def running_bond_shift(pattern, row, step_u)
          pattern == 'running_bond' && row.odd? ? step_u / 2.0 : 0.0
        end

        def to_local_loop(loop, origin, basis)
          primary = basis[:primary]
          secondary = basis[:secondary]
          Array(loop).map do |point|
            dx = Float(point[0]) - origin[0]
            dy = Float(point[1]) - origin[1]
            [
              (dx * primary[0]) + (dy * primary[1]),
              (dx * secondary[0]) + (dy * secondary[1])
            ]
          end
        end

        def to_world_loop(loop, origin, basis)
          primary = basis[:primary]
          secondary = basis[:secondary]
          loop.map do |point|
            u = point[0]
            v = point[1]
            [
              origin[0] + (u * primary[0]) + (v * secondary[0]),
              origin[1] + (u * primary[1]) + (v * secondary[1]),
              origin[2]
            ]
          end
        end

        def bounds(points)
          us = points.map { |point| point[0] }
          vs = points.map { |point| point[1] }
          [us.min, vs.min, us.max, vs.max]
        end

        def triangulate(loop)
          points = normalize_loop(loop)
          raise ArgumentError, 'polygon needs at least three unique points' if points.length < 3
          points.reverse! if signed_area(points).negative?

          indices = (0...points.length).to_a
          triangles = []
          guard = 0
          while indices.length > 3
            ear_index = nil
            indices.each_index do |index|
              previous = indices[(index - 1) % indices.length]
              current = indices[index]
              following = indices[(index + 1) % indices.length]
              a = points[previous]
              b = points[current]
              c = points[following]
              next unless cross(a, b, c) > EPSILON

              contains_point = indices.any? do |candidate|
                next false if candidate == previous || candidate == current || candidate == following
                point_in_triangle?(points[candidate], a, b, c)
              end
              next if contains_point

              ear_index = index
              triangles << [a, b, c]
              break
            end
            raise ArgumentError, 'cannot triangulate surface loop; verify self intersections/duplicate points' unless ear_index

            indices.delete_at(ear_index)
            guard += 1
            raise ArgumentError, 'triangulation exceeded safe iteration limit' if guard > points.length * points.length
          end
          triangles << indices.map { |index| points[index] }
          triangles
        end

        def normalize_loop(loop)
          points = Array(loop).map { |point| [Float(point[0]), Float(point[1])] }
          points.pop while points.length > 1 && same_point?(points.first, points.last)
          result = []
          points.each { |point| result << point unless !result.empty? && same_point?(result.last, point) }
          result.pop while result.length > 1 && same_point?(result.first, result.last)
          result
        end

        def same_point?(a, b)
          (a[0] - b[0]).abs <= EPSILON && (a[1] - b[1]).abs <= EPSILON
        end

        def signed_area(points)
          points.each_with_index.sum do |point, index|
            following = points[(index + 1) % points.length]
            (point[0] * following[1]) - (following[0] * point[1])
          end / 2.0
        end

        def polygon_area(points)
          return 0.0 if points.length < 3
          signed_area(points).abs
        end

        def cross(a, b, c)
          ((b[0] - a[0]) * (c[1] - a[1])) - ((b[1] - a[1]) * (c[0] - a[0]))
        end

        def point_in_triangle?(point, a, b, c)
          c1 = cross(a, b, point)
          c2 = cross(b, c, point)
          c3 = cross(c, a, point)
          c1 >= -EPSILON && c2 >= -EPSILON && c3 >= -EPSILON
        end

        def clip_polygon_to_rect(polygon, rect)
          left, bottom, right, top = rect
          clipped = polygon
          clipped = clip(clipped, ->(p) { p[0] >= left - EPSILON }) { |a, b| intersect_vertical(a, b, left) }
          clipped = clip(clipped, ->(p) { p[0] <= right + EPSILON }) { |a, b| intersect_vertical(a, b, right) }
          clipped = clip(clipped, ->(p) { p[1] >= bottom - EPSILON }) { |a, b| intersect_horizontal(a, b, bottom) }
          clip(clipped, ->(p) { p[1] <= top + EPSILON }) { |a, b| intersect_horizontal(a, b, top) }
        end

        def clip(points, inside)
          return [] if points.empty?
          output = []
          previous = points[-1]
          previous_inside = inside.call(previous)
          points.each do |current|
            current_inside = inside.call(current)
            if current_inside
              output << yield(previous, current) unless previous_inside
              output << current
            elsif previous_inside
              output << yield(previous, current)
            end
            previous = current
            previous_inside = current_inside
          end
          deduplicate_polygon(output)
        end

        def intersect_vertical(a, b, x)
          dx = b[0] - a[0]
          return [x, a[1]] if dx.abs <= EPSILON
          t = (x - a[0]) / dx
          [x, a[1] + (t * (b[1] - a[1]))]
        end

        def intersect_horizontal(a, b, y)
          dy = b[1] - a[1]
          return [a[0], y] if dy.abs <= EPSILON
          t = (y - a[1]) / dy
          [a[0] + (t * (b[0] - a[0])), y]
        end

        def deduplicate_polygon(points)
          result = []
          points.each { |point| result << point unless !result.empty? && same_point?(result.last, point) }
          result.pop if result.length > 1 && same_point?(result.first, result.last)
          result
        end
      end
    end
  end
end
