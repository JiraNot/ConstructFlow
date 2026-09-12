# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Deterministic residential-model constraint primitives. This is an
      # ordered projection engine, deliberately smaller than a general CAD
      # solver; commands can apply it before rebuilding representations.
      class ConstraintEngine
        KINDS = %w[align lock offset equal fixed_distance parallel perpendicular centered host attach level].freeze

        def solve(points:, constraints:)
          result = normalize_points(points)
          Array(constraints).each do |constraint|
            data = normalize_constraint(constraint)
            apply!(result, data)
          end
          result.transform_values { |point| point.freeze }.freeze
        end

        def validate(constraints)
          Array(constraints).each_with_index.filter_map do |constraint, index|
            normalize_constraint(constraint)
            nil
          rescue StandardError => error
            { index: index, message: error.message }.freeze
          end.freeze
        end

        private

        def normalize_points(points)
          (points || {}).each_with_object({}) do |(id, point), result|
            values = Array(point)
            raise ArgumentError, "point #{id} requires x, y, z" unless values.length >= 3

            result[id.to_s] = values.first(3).map { |value| Float(value) }
          end
        end

        def normalize_constraint(constraint)
          data = constraint || {}
          kind = (data[:kind] || data['kind']).to_s
          raise ArgumentError, "unsupported constraint kind: #{kind}" unless KINDS.include?(kind)
          source = (data[:source] || data['source']).to_s
          target = (data[:target] || data['target']).to_s
          raise ArgumentError, 'constraint target required' if target.empty?
          source_required = %w[align offset equal fixed_distance parallel perpendicular centered host attach].include?(kind)
          raise ArgumentError, 'constraint source required' if source_required && source.empty?

          other = (data[:other] || data['other']).to_s
          raise ArgumentError, 'centered constraint requires other point' if kind == 'centered' && other.empty?
          point = Array(data[:point] || data['point'] || []).first(3).map { |value| Float(value) }
          raise ArgumentError, 'lock constraint requires a fixed point' if kind == 'lock' && point.length != 3
          distance_mm = data.key?(:distance_mm) ? Float(data[:distance_mm]) : Float(data['distance_mm'] || 0)
          raise ArgumentError, 'fixed distance must be zero or greater' if %w[fixed_distance equal].include?(kind) && distance_mm.negative?
          if kind == 'equal' && other.empty? && distance_mm <= 0.0
            raise ArgumentError, 'equal constraint requires a reference point or distance'
          end

          {
            kind: kind,
            source: source,
            target: target,
            axis: (data[:axis] || data['axis'] || 'x').to_s,
            other: other,
            offset: Array(data[:offset] || data['offset'] || [0, 0, 0]).first(3).map { |value| Float(value) },
            distance_mm: distance_mm,
            point: point,
            level_z: data.key?(:level_z) ? Float(data[:level_z]) : Float(data['level_z'] || 0)
          }.freeze
        end

        def apply!(points, constraint)
          source = points.fetch(constraint[:source]) if %w[align offset equal fixed_distance parallel perpendicular centered host attach].include?(constraint[:kind])
          target = points.fetch(constraint[:target])
          case constraint[:kind]
          when 'align'
            axis = axis_index(constraint[:axis])
            target[axis] = source[axis]
          when 'lock'
            raise ArgumentError, 'lock constraint requires a fixed point' unless constraint[:point].length == 3

            points[constraint[:target]] = constraint[:point]
          when 'offset'
            points[constraint[:target]] = source.zip(constraint[:offset]).map { |a, b| a + b }
          when 'host', 'attach'
            points[constraint[:target]] = source.dup
          when 'centered'
            other = points.fetch(constraint[:other])
            points[constraint[:target]] = source.zip(other).map { |a, b| (a + b) / 2.0 }
          when 'level'
            target[2] = constraint[:level_z]
          when 'fixed_distance'
            points[constraint[:target]] = at_distance(source, target, constraint[:distance_mm])
          when 'equal'
            reference_distance = if constraint[:other].empty?
                                   constraint[:distance_mm]
                                 else
                                   distance(source, points.fetch(constraint[:other]))
                                 end
            raise ArgumentError, 'equal constraint requires a reference point or distance' if reference_distance <= 0.0

            points[constraint[:target]] = at_distance(source, target, reference_distance)
          when 'parallel', 'perpendicular'
            points[constraint[:target]] = oriented_from(source, target, constraint[:kind] == 'perpendicular')
          else
            raise ArgumentError, "unsupported constraint kind: #{constraint[:kind]}"
          end
        rescue KeyError => error
          raise ArgumentError, "constraint references unknown point: #{error.key}" 
        end

        def axis_index(axis)
          { 'x' => 0, 'y' => 1, 'z' => 2 }.fetch(axis) { raise ArgumentError, "unsupported alignment axis: #{axis}" }
        end

        def distance(a, b)
          Math.sqrt(a.zip(b).sum { |x, y| (x - y)**2 })
        end

        def at_distance(origin, point, length)
          raise ArgumentError, 'fixed distance must be zero or greater' if length.negative?
          current = distance(origin, point)
          return origin.dup if current <= 0.001

          origin.zip(point).map { |a, b| a + ((b - a) * length / current) }
        end

        def oriented_from(origin, point, perpendicular)
          dx = point[0] - origin[0]
          dy = point[1] - origin[1]
          length = Math.sqrt((dx * dx) + (dy * dy))
          return point.dup if length <= 0.001
          vector = perpendicular ? [-dy, dx] : [dx, dy]

          [origin[0] + vector[0], origin[1] + vector[1], point[2]]
        end
      end
    end
  end
end
