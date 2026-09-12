# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class WallJoinEngine
        JOIN_STYLES = %w[butt miter disallow].freeze
        TOLERANCE_MM = 0.001

        def classify(wall_a:, wall_b:, tolerance_mm: 1.0)
          # Joins describe the physical wall centerline, not the authoring
          # location line. This keeps hosted/finish-face walls joining at the
          # same geometric position that downstream geometry uses.
          a = Array(wall_a.respond_to?(:centerline_path_mm) ? wall_a.centerline_path_mm : wall_a.path_mm)
          b = Array(wall_b.respond_to?(:centerline_path_mm) ? wall_b.centerline_path_mm : wall_b.path_mm)
          tolerance = Float(tolerance_mm)
          connection = endpoint_matches(a, b, tolerance)
          return join_result('L', connection[:point_mm], connection[:a_vector], connection[:b_vector]) if connection

          connection = endpoint_on_segment(a, b, tolerance)
          return join_result('T', connection[:point_mm], connection[:a_vector], connection[:b_vector]) if connection

          connection = crossing_segments(a, b, tolerance)
          return join_result('X', connection[:point_mm], connection[:a_vector], connection[:b_vector]) if connection

          { type: 'none', style: 'disallow', point_mm: nil }.freeze
        end

        def resolve(wall_a:, wall_b:, style: nil, tolerance_mm: 1.0)
          join = classify(wall_a: wall_a, wall_b: wall_b, tolerance_mm: tolerance_mm)
          selected_style = (style || join[:style]).to_s
          raise ArgumentError, "unsupported wall join style: #{selected_style}" unless JOIN_STYLES.include?(selected_style)

          join.merge(style: selected_style, resolved: join[:type] != 'none' && selected_style != 'disallow').freeze
        end

        private

        def endpoint_matches(a, b, tolerance)
          a.each_with_index do |point_a, index_a|
            b.each_with_index do |point_b, index_b|
              next unless distance_sq(point_a, point_b) <= tolerance * tolerance

              return {
                a_vector: vector(between: a[[index_a - 1, 0].max], to: a[[index_a + 1, a.length - 1].min]),
                b_vector: vector(between: b[[index_b - 1, 0].max], to: b[[index_b + 1, b.length - 1].min]),
                point_mm: point_a.dup.freeze
              }
            end
          end
          nil
        end

        def endpoint_on_segment(a, b, tolerance)
          endpoint_matches_path(a, b, tolerance) do |point, segment|
            point_on_segment?(point, segment[0], segment[1], tolerance) &&
              !near_point?(point, segment[0], tolerance) && !near_point?(point, segment[1], tolerance)
          end
        end

        def endpoint_matches_path(endpoints_path, segments_path, tolerance)
          endpoints_path.each_with_index do |point, point_index|
            next unless point_index.zero? || point_index == endpoints_path.length - 1

            segments_path.each_cons(2).with_index do |segment, segment_index|
              next unless yield(point, segment)

              return {
                point_mm: point.dup.freeze,
                a_vector: vector(between: endpoints_path[[point_index - 1, 0].max], to: endpoints_path[[point_index + 1, endpoints_path.length - 1].min]),
                b_vector: vector(between: segment[0], to: segment[1]),
                segment_index: segment_index
              }
            end
          end
          nil
        end

        def crossing_segments(a, b, tolerance)
          a.each_cons(2).each do |first|
            b.each_cons(2).each do |second|
              result = segment_intersection(first, second)
              next unless result && result[:ua] > tolerance_ratio(first, tolerance) && result[:ua] < (1.0 - tolerance_ratio(first, tolerance)) &&
                          result[:ub] > tolerance_ratio(second, tolerance) && result[:ub] < (1.0 - tolerance_ratio(second, tolerance))

              return {
                point_mm: result[:point_mm],
                a_vector: vector(between: first[0], to: first[1]),
                b_vector: vector(between: second[0], to: second[1])
              }
            end
          end
          nil
        end

        def join_result(type, point, a_vector, b_vector)
          cross = (a_vector[0] * b_vector[1]) - (a_vector[1] * b_vector[0])
          dot = (a_vector[0] * b_vector[0]) + (a_vector[1] * b_vector[1])
          {
            type: type,
            angle_deg: Math.atan2(cross.abs, dot.abs) * 180.0 / Math::PI,
            point_mm: point,
            style: 'miter'
          }.freeze
        end

        def segment_intersection(first, second)
          a, b = first
          c, d = second
          denominator = ((b[0] - a[0]) * (d[1] - c[1])) - ((b[1] - a[1]) * (d[0] - c[0]))
          return nil if denominator.abs <= TOLERANCE_MM

          ua = (((d[0] - c[0]) * (a[1] - c[1])) - ((d[1] - c[1]) * (a[0] - c[0]))) / denominator
          ub = (((b[0] - a[0]) * (a[1] - c[1])) - ((b[1] - a[1]) * (a[0] - c[0]))) / denominator
          return nil unless ua.between?(0.0, 1.0) && ub.between?(0.0, 1.0)

          {
            ua: ua,
            ub: ub,
            point_mm: [a[0] + (ua * (b[0] - a[0])), a[1] + (ua * (b[1] - a[1])), (a[2] + b[2] + c[2] + d[2]) / 4.0].freeze
          }
        end

        def point_on_segment?(point, first, second, tolerance)
          dx = second[0] - first[0]
          dy = second[1] - first[1]
          length_sq = (dx * dx) + (dy * dy)
          return false if length_sq <= TOLERANCE_MM

          t = (((point[0] - first[0]) * dx) + ((point[1] - first[1]) * dy)) / length_sq
          return false unless t.between?(0.0, 1.0)

          near_point?(point, [first[0] + (t * dx), first[1] + (t * dy), point[2]], tolerance)
        end

        def near_point?(a, b, tolerance)
          distance_sq(a, b) <= tolerance * tolerance
        end

        def tolerance_ratio(segment, tolerance)
          length = Math.sqrt(distance_sq(segment[0], segment[1]))
          length <= TOLERANCE_MM ? 0.5 : [tolerance / length, 0.49].min
        end

        def vector(between:, to:)
          dx = to[0] - between[0]
          dy = to[1] - between[1]
          length = Math.sqrt((dx * dx) + (dy * dy))
          return [1.0, 0.0] if length <= TOLERANCE_MM

          [dx / length, dy / length]
        end

        def distance_sq(a, b)
          ((a[0] - b[0])**2) + ((a[1] - b[1])**2) + ((a[2] - b[2])**2)
        end
      end
    end
  end
end
