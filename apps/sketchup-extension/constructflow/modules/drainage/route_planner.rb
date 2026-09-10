# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class RoutePlanner
        MODES = %w[manual semi_auto auto].freeze

        Plan = Struct.new(
          :mode, :route_nodes_mm, :start_invert_mm, :end_invert_mm,
          :horizontal_length_mm, :slope_percent, :warnings, :metadata,
          keyword_init: true
        ) do
          def to_h
            {
              'mode' => mode,
              'route_nodes_mm' => route_nodes_mm,
              'start_invert_mm' => start_invert_mm,
              'end_invert_mm' => end_invert_mm,
              'horizontal_length_mm' => horizontal_length_mm,
              'slope_percent' => slope_percent,
              'warnings' => warnings,
              'metadata' => metadata
            }.freeze
          end
        end

        def plan(start_connector:, end_connector:, mode: 'semi_auto', via_nodes_mm: [],
                 start_invert_mm: nil, end_invert_mm: nil,
                 minimum_slope_percent: Validators::DrainageValidator::MIN_SLOPE_PERCENT,
                 orthogonal_preference: 'x_first')
          selected_mode = normalize_mode(mode)
          start_point = connector_point(start_connector, 'start')
          end_point = connector_point(end_connector, 'end')
          start_invert = explicit_or_connector_invert(start_invert_mm, start_connector)
          end_invert = explicit_or_connector_invert(end_invert_mm, end_connector)

          nodes = case selected_mode
                  when 'manual'
                    manual_nodes(start_point, end_point, via_nodes_mm)
                  when 'semi_auto'
                    semi_auto_nodes(start_point, end_point, via_nodes_mm, orthogonal_preference)
                  else
                    auto_nodes(start_point, end_point, orthogonal_preference)
                  end
          nodes = remove_duplicate_nodes(nodes)
          horizontal_length = horizontal_length_mm(nodes)
          raise ArgumentError, 'drainage route has zero horizontal length' if horizontal_length <= 0.001

          min_slope = Float(minimum_slope_percent)
          raise ArgumentError, 'minimum slope cannot be negative' if min_slope.negative?
          end_invert = derive_end_invert(start_invert, end_invert, horizontal_length, min_slope, selected_mode)
          nodes = apply_vertical_profile(nodes, start_invert, end_invert) if start_invert && end_invert
          slope = slope_percent(start_invert, end_invert, horizontal_length)
          warnings = route_warnings(start_invert, end_invert, slope, min_slope)

          Plan.new(
            mode: selected_mode,
            route_nodes_mm: deep_freeze(nodes),
            start_invert_mm: start_invert,
            end_invert_mm: end_invert,
            horizontal_length_mm: horizontal_length,
            slope_percent: slope,
            warnings: warnings.freeze,
            metadata: {
              'planner' => 'constructflow.drainage.route_planner.v1',
              'orthogonal' => selected_mode != 'manual',
              'minimum_slope_percent' => min_slope,
              'requires_site_verification' => start_invert.nil? || end_invert.nil?,
              'obstacle_avoidance' => 'deferred'
            }.freeze
          ).freeze
        end

        private

        def normalize_mode(value)
          mode = value.to_s
          raise ArgumentError, "unsupported drainage routing mode: #{value}" unless MODES.include?(mode)
          mode
        end

        def connector_point(connector, label)
          point = connector && (connector['position_mm'] || connector[:position_mm])
          raise ArgumentError, "#{label} connector position required" unless point
          normalize_point(point)
        end

        def explicit_or_connector_invert(value, connector)
          return Float(value) unless value.nil? || value == ''
          properties = connector && (connector['properties'] || connector[:properties]) || {}
          raw = properties['invert_mm'] || properties[:invert_mm]
          raw.nil? || raw == '' ? nil : Float(raw)
        end

        def manual_nodes(start_point, end_point, via_nodes)
          [start_point] + Array(via_nodes).map { |point| normalize_point(point) } + [end_point]
        end

        def semi_auto_nodes(start_point, end_point, via_nodes, preference)
          anchors = [start_point] + Array(via_nodes).map { |point| normalize_point(point) } + [end_point]
          anchors.each_cons(2).with_index.each_with_object([anchors.first]) do |((a, b), index), result|
            segment_preference = index.even? ? preference : alternate_preference(preference)
            result.concat(orthogonal_segment(a, b, segment_preference).drop(1))
          end
        end

        def auto_nodes(start_point, end_point, preference)
          orthogonal_segment(start_point, end_point, preference)
        end

        def orthogonal_segment(a, b, preference)
          return [a, b] if same_xy?(a, b)

          candidate = if preference.to_s == 'y_first'
                        [a, [a[0], b[1], a[2]], b]
                      else
                        [a, [b[0], a[1], a[2]], b]
                      end
          remove_duplicate_nodes(candidate)
        end

        def alternate_preference(value)
          value.to_s == 'y_first' ? 'x_first' : 'y_first'
        end

        def derive_end_invert(start_invert, end_invert, horizontal_length, min_slope, mode)
          return end_invert if end_invert
          return nil unless start_invert
          return nil if mode == 'manual'

          start_invert - (horizontal_length * min_slope / 100.0)
        end

        def apply_vertical_profile(nodes, start_invert, end_invert)
          total = horizontal_length_mm(nodes)
          travelled = 0.0
          nodes.each_with_index.map do |point, index|
            if index.zero?
              [point[0], point[1], start_invert]
            elsif index == nodes.length - 1
              [point[0], point[1], end_invert]
            else
              previous = nodes[index - 1]
              travelled += horizontal_distance(previous, point)
              ratio = total <= 0.001 ? 0.0 : travelled / total
              z = start_invert + ((end_invert - start_invert) * ratio)
              [point[0], point[1], z]
            end
          end
        end

        def route_warnings(start_invert, end_invert, slope, min_slope)
          result = []
          if start_invert.nil? || end_invert.nil?
            result << 'route invert is incomplete; verify on site before treating gravity slope as compliant'
            return result
          end
          result << format('route has reverse gravity slope %.3f%%', slope) if slope && slope.negative?
          if slope && !slope.negative? && slope < min_slope
            result << format('route slope %.3f%% is below configured %.3f%%', slope, min_slope)
          end
          result
        end

        def slope_percent(start_invert, end_invert, horizontal_length)
          return nil unless start_invert && end_invert
          ((start_invert - end_invert) / horizontal_length) * 100.0
        end

        def horizontal_length_mm(nodes)
          nodes.each_cons(2).sum { |a, b| horizontal_distance(a, b) }
        end

        def horizontal_distance(a, b)
          dx = b[0] - a[0]
          dy = b[1] - a[1]
          Math.sqrt((dx * dx) + (dy * dy))
        end

        def same_xy?(a, b)
          (a[0] - b[0]).abs <= 0.001 && (a[1] - b[1]).abs <= 0.001
        end

        def remove_duplicate_nodes(nodes)
          Array(nodes).each_with_object([]) do |point, result|
            normalized = normalize_point(point)
            result << normalized if result.empty? || distance_3d(result.last, normalized) > 0.001
          end
        end

        def distance_3d(a, b)
          dx = b[0] - a[0]
          dy = b[1] - a[1]
          dz = b[2] - a[2]
          Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
        end

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'route node requires x, y, z' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def deep_freeze(value)
          value.each { |item| item.freeze }
          value.freeze
        end
      end
    end
  end
end
