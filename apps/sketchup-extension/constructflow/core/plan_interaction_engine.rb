# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Geometry-only interaction rules shared by plan tools.
      # Keeping this independent from SketchUp makes inference behavior
      # deterministic and lets native tools remain thin adapters.
      class PlanInteractionEngine
        DEFAULT_SNAP_TOLERANCE_MM = 100.0

        # Plan interactions are evaluated in the XY editing plane by default.
        # Candidate Z is still preserved in the returned point so the semantic
        # host/level elevation remains authoritative for the eventual commit.
        def initialize(snap_tolerance_mm: DEFAULT_SNAP_TOLERANCE_MM, planar: true)
          @snap_tolerance_mm = Float(snap_tolerance_mm)
          raise ArgumentError, 'snap tolerance must be greater than zero' unless @snap_tolerance_mm.positive?
          @planar = !!planar
        end

        def snap(point_mm, references: [])
          point = normalize_point(point_mm)
          reference_values = Array(references)
          candidates = reference_values.flat_map { |reference| reference_points(reference) }
          candidates.concat(intersection_points(reference_values))
          candidates.concat(reference_projections(reference_values, point))
          primary_candidates = candidates.reject { |candidate| candidate[:kind].to_s == 'reference' }
          if primary_candidates.any? { |candidate| distance_sq(point, candidate[:point_mm]) <= (@snap_tolerance_mm**2) }
            candidates = primary_candidates
          end
          nearest = candidates.min_by do |candidate|
            candidate_point = candidate[:point_mm]
            source = candidate[:source_object_id] || Array(candidate[:source_object_ids]).join('|')
            [
              distance_sq(point, candidate_point),
              snap_priority(candidate[:kind]),
              source.to_s,
              candidate[:source_type].to_s,
              *candidate_point
            ]
          end
          return { point_mm: point, kind: 'free', distance_mm: 0.0 } unless nearest

          distance = Math.sqrt(distance_sq(point, nearest[:point_mm]))
          return { point_mm: point, kind: 'free', distance_mm: distance } if distance > @snap_tolerance_mm

          nearest.merge(point_mm: nearest[:point_mm].dup.freeze, distance_mm: distance).freeze
        end

        def constrain_segment(start_mm, finish_mm, mode: :orthogonal)
          start_point = normalize_point(start_mm)
          finish_point = normalize_point(finish_mm)
          case mode.to_sym
          when :free
            [finish_point[0], finish_point[1], start_point[2]].freeze
          when :orthogonal, :axis
            dx = (finish_point[0] - start_point[0]).abs
            dy = (finish_point[1] - start_point[1]).abs
            if dx >= dy
              [finish_point[0], start_point[1], start_point[2]].freeze
            else
              [start_point[0], finish_point[1], start_point[2]].freeze
            end
          when :axis_x, :x, :red
            [finish_point[0], start_point[1], start_point[2]].freeze
          when :axis_y, :y, :green
            [start_point[0], finish_point[1], start_point[2]].freeze
          when :axis_z, :z, :blue
            [start_point[0], start_point[1], finish_point[2]].freeze
          when :parallel, :perpendicular
            raise ArgumentError, "#{mode} constraint requires reference segment" unless @reference_segment

            reference_start, reference_finish = @reference_segment
            dx = reference_finish[0] - reference_start[0]
            dy = reference_finish[1] - reference_start[1]
            length = Math.sqrt((dx * dx) + (dy * dy))
            raise ArgumentError, 'reference segment cannot be zero length' if length <= 0.001
            direction = mode.to_sym == :perpendicular ? [-dy / length, dx / length] : [dx / length, dy / length]
            delta_x = finish_point[0] - start_point[0]
            delta_y = finish_point[1] - start_point[1]
            distance = (delta_x * direction[0]) + (delta_y * direction[1])
            [start_point[0] + (direction[0] * distance), start_point[1] + (direction[1] * distance), start_point[2]].freeze
          else
            raise ArgumentError, "unsupported plan constraint: #{mode}"
          end
        end

        def segment_preview(start_mm, finish_mm, mode: :orthogonal, references: [], length_mm: nil, reference_segment: nil)
          snapped = snap(finish_mm, references: references)
          @reference_segment = reference_segment && reference_segment.map { |point| normalize_point(point) }
          constrained = constrain_segment(start_mm, snapped[:point_mm], mode: mode)
          constrained = constrain_length(start_mm, constrained, length_mm, mode: mode) unless length_mm.nil?
          @reference_segment = nil
          dx = constrained[0] - Float(start_mm[0])
          dy = constrained[1] - Float(start_mm[1])
          {
            start_mm: normalize_point(start_mm),
            finish_mm: constrained,
            length_mm: Math.sqrt((dx * dx) + (dy * dy)),
            delta_x_mm: dx,
            delta_y_mm: dy,
            snap: snapped,
            constraint: mode.to_s
          }.freeze
        end

        def numeric_distance_mm(value, default_unit: (defined?(Core::Units) ? Core::Units.active_unit : :meter))
          text = value.to_s.strip.downcase.delete(',')
          match = /\A([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|cm|m|in|ft)?\z/.match(text)
          raise ArgumentError, "invalid numeric distance: #{value}" unless match

          number = Float(match[1])
          unit = match[2]
          if unit.nil?
            multiplier = if default_unit == :meter
                           number < 50.0 ? 1000.0 : 1.0
                         else
                           1.0
                         end
          else
            multiplier = { 'mm' => 1.0, 'cm' => 10.0, 'm' => 1000.0, 'in' => 25.4, 'ft' => 304.8 }.fetch(unit)
          end

          distance = number * multiplier
          raise ArgumentError, 'numeric distance must be greater than zero' unless distance.positive?

          distance
        end

        def placement_feedback(host:, candidate:, errors: [])
          normalized_errors = Array(errors).map(&:to_s).reject(&:empty?).freeze
          state = if host.nil?
                    'no_host'
                  elsif normalized_errors.empty?
                    'valid'
                  else
                    'invalid'
                  end
          {
            state: state,
            host_id: host && (host.respond_to?(:id) ? host.id.to_s : host[:id] || host['id']),
            candidate: candidate,
            errors: normalized_errors
          }.freeze
        end

        private

        def reference_points(reference)
          value = reference || {}
          if value.is_a?(Hash) && (value[:paths_mm] || value['paths_mm'])
            kind = (value[:kind] || value['kind'] || 'reference').to_s
            point_kind = kind == 'wall_reference' ? 'endpoint' : kind
            metadata = reference_metadata(value)
            Array(value[:paths_mm] || value['paths_mm']).flat_map do |path|
              points = Array(path).map { |point| normalize_point(point) }
              points.map { |point| { point_mm: point, kind: point_kind }.merge(metadata) } + points.each_cons(2).map do |a, b|
                { point_mm: [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0, (a[2] + b[2]) / 2.0].freeze, kind: 'midpoint' }.merge(metadata)
              end
            end
          elsif value.is_a?(Hash) && (value[:points_mm] || value['points_mm'])
            kind = (value[:kind] || value['kind'] || 'reference').to_s
            metadata = reference_metadata(value)
            Array(value[:points_mm] || value['points_mm']).map do |point|
              { point_mm: normalize_point(point), kind: kind }.merge(metadata)
            end
          elsif value.is_a?(Hash) && (value[:point_mm] || value['point_mm'])
            [{ point_mm: normalize_point(value[:point_mm] || value['point_mm']), kind: (value[:kind] || value['kind'] || 'reference').to_s }.merge(reference_metadata(value))]
          else
            path = if value.is_a?(Hash)
                     value[:path_mm] || value['path_mm'] || value
                   else
                     value
                   end
            points = Array(path).map { |point| normalize_point(point) }
            metadata = reference_metadata(value)
            result = points.map { |point| { point_mm: point, kind: 'endpoint' }.merge(metadata) }
            points.each_cons(2) do |a, b|
              result << { point_mm: [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0, (a[2] + b[2]) / 2.0].freeze, kind: 'midpoint' }.merge(metadata)
            end
            result
          end
        end

        def intersection_points(references)
          segments = Array(references).flat_map { |reference| reference_segments(reference) }
          segments.combination(2).filter_map do |first, second|
            intersection = segment_intersection(first[:points], second[:points])
            next unless intersection

            ids = [first[:metadata][:source_object_id], second[:metadata][:source_object_id]].compact.uniq
            types = [first[:metadata][:source_type], second[:metadata][:source_type]].compact.uniq
            metadata = {}
            metadata[:source_object_ids] = ids.freeze unless ids.empty?
            metadata[:source_types] = types.freeze unless types.empty?
            { point_mm: intersection, kind: 'intersection' }.merge(metadata)
          end
        end

        def reference_projections(references, target)
          Array(references).flat_map { |reference| reference_segments(reference) }.filter_map do |segment|
            first, second = segment[:points]
            dx = second[0] - first[0]
            dy = second[1] - first[1]
            length_sq = (dx * dx) + (dy * dy)
            next if length_sq <= 0.001

            ratio = (((target[0] - first[0]) * dx) + ((target[1] - first[1]) * dy)) / length_sq
            ratio = [[ratio, 0.0].max, 1.0].min
            point = [
              first[0] + (dx * ratio),
              first[1] + (dy * ratio),
              first[2] + ((second[2] - first[2]) * ratio)
            ].freeze
            { point_mm: point, kind: 'reference' }.merge(segment[:metadata])
          end
        end

        def reference_segments(reference)
          value = reference || {}
          if value.is_a?(Hash) && (value[:paths_mm] || value['paths_mm'])
            metadata = reference_metadata(value)
            return Array(value[:paths_mm] || value['paths_mm']).flat_map do |path|
              Array(path).each_cons(2).map do |a, b|
                { points: [normalize_point(a), normalize_point(b)], metadata: metadata }
              end
            end
          end
          path = value.is_a?(Hash) ? (value[:path_mm] || value['path_mm'] || []) : value
          metadata = reference_metadata(value)
          Array(path).each_cons(2).map do |a, b|
            { points: [normalize_point(a), normalize_point(b)], metadata: metadata }
          end
        end

        def segment_intersection(first, second)
          a, b = first
          c, d = second
          denominator = ((b[0] - a[0]) * (d[1] - c[1])) - ((b[1] - a[1]) * (d[0] - c[0]))
          return nil if denominator.abs <= 0.001

          ua = (((d[0] - c[0]) * (a[1] - c[1])) - ((d[1] - c[1]) * (a[0] - c[0]))) / denominator
          ub = (((b[0] - a[0]) * (a[1] - c[1])) - ((b[1] - a[1]) * (a[0] - c[0]))) / denominator
          return nil unless ua.between?(0.0, 1.0) && ub.between?(0.0, 1.0)

          [a[0] + (ua * (b[0] - a[0])), a[1] + (ua * (b[1] - a[1])), (a[2] + b[2] + c[2] + d[2]) / 4.0].freeze
        end

        def normalize_point(point)
          values = Array(point)
          raise ArgumentError, 'plan point requires x, y, z' unless values.length >= 3

          [Float(values[0]), Float(values[1]), Float(values[2])].freeze
        end

        def reference_metadata(reference)
          value = reference || {}
          return {} unless value.is_a?(Hash)

          metadata = {}
          source_id = value[:source_object_id] || value['source_object_id']
          source_type = value[:source_type] || value['source_type']
          metadata[:source_object_id] = source_id.to_s unless source_id.to_s.empty?
          metadata[:source_type] = source_type.to_s unless source_type.to_s.empty?
          metadata
        end

        def constrain_length(start_mm, finish_mm, length_mm, mode: :orthogonal)
          length = Float(length_mm)
          raise ArgumentError, 'segment length must be greater than zero' unless length.positive?
          dx = finish_mm[0] - start_mm[0]
          dy = finish_mm[1] - start_mm[1]
          current = Math.sqrt((dx * dx) + (dy * dy))
          if current <= 0.001
            case mode.to_sym
            when :axis_y, :y, :green
              return [Float(start_mm[0]), start_mm[1] + length, Float(start_mm[2])].freeze
            else
              return [start_mm[0] + length, Float(start_mm[1]), Float(start_mm[2])].freeze
            end
          end

          [start_mm[0] + (dx * length / current), start_mm[1] + (dy * length / current), Float(start_mm[2])].freeze
        end

        def distance_sq(a, b)
          distance = ((a[0] - b[0])**2) + ((a[1] - b[1])**2)
          distance += (a[2] - b[2])**2 unless @planar
          distance
        end

        def snap_priority(kind)
          { 'intersection' => 0, 'endpoint' => 1, 'midpoint' => 2 }.fetch(kind.to_s, 3)
        end
      end
    end
  end
end
